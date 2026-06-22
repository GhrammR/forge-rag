'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { RetrievedChunk } from '@/types';
import { parseCitations } from '@/lib/parseCitations';

const ABSTENTION = "I couldn't find that in the provided documents.";

interface Message {
  id: string;
  question: string;
  answer: string;
  chunks: RetrievedChunk[];
  streaming: boolean;
  activeCitation: number | null;
  error?: string;
}

interface UploadedDoc {
  docName: string;
  chunkCount: number;
}

// ── sub-components ────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg className="w-10 h-10 text-zinc-300 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

function AnswerText({
  text,
  chunks,
  streaming,
  activeCitation,
  onCitationClick,
}: {
  text: string;
  chunks: RetrievedChunk[];
  streaming: boolean;
  activeCitation: number | null;
  onCitationClick: (index: number) => void;
}) {
  if (text === ABSTENTION) {
    return (
      <span className="flex items-start gap-2 text-zinc-500 dark:text-zinc-400 italic">
        <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        {text}
      </span>
    );
  }

  const segments = parseCitations(text);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return <span key={i}>{seg.content}</span>;
        }
        const exists = seg.index >= 1 && seg.index <= chunks.length;
        const isActive = activeCitation === seg.index;
        return (
          <button
            key={i}
            onClick={() => exists && onCitationClick(seg.index)}
            disabled={!exists}
            title={exists ? `View source ${seg.index}` : undefined}
            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold mx-0.5 align-middle transition-colors ${
              exists
                ? isActive
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                  : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-default'
            }`}
          >
            {seg.index}
          </button>
        );
      })}
      {streaming && (
        <span className="inline-block w-0.5 h-4 bg-zinc-400 ml-0.5 animate-pulse align-middle" />
      )}
    </>
  );
}

function SourcePanel({
  index,
  chunk,
  onClose,
}: {
  index: number;
  chunk: RetrievedChunk;
  onClose: () => void;
}) {
  return (
    <div className="mt-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        <span className="font-medium text-zinc-700 dark:text-zinc-200">
          Source [{index}] &mdash;{' '}
          <span className="text-zinc-500 dark:text-zinc-400">{chunk.docName}</span>
          <span className="ml-2 text-zinc-400">chunk {chunk.position}</span>
        </span>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors leading-none ml-4"
          aria-label="Close source panel"
        >
          ✕
        </button>
      </div>
      <p className="px-3 py-2.5 leading-relaxed text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
        {chunk.text}
      </p>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function RagApp() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadError, setUploadError] = useState('');
  const [question, setQuestion] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // auto-scroll when a message grows
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.answer]);

  // auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [question]);

  // ── upload ──────────────────────────────────────────────────────────────────

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter(f =>
      ['pdf', 'txt', 'md'].includes(f.name.split('.').pop()?.toLowerCase() ?? '')
    );
    if (list.length === 0) {
      setUploadStatus('error');
      setUploadError('Only PDF, TXT, and MD files are supported.');
      return;
    }

    setUploadStatus('uploading');
    setUploadError('');

    const formData = new FormData();
    for (const file of list) formData.append('files', file);

    try {
      const res = await fetch('/api/ingest', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setUploadStatus('error');
        setUploadError(data.error ?? 'Upload failed');
        return;
      }
      setDocs(prev => [...prev, ...data.results]);
      setUploadStatus('done');
    } catch {
      setUploadStatus('error');
      setUploadError('Upload failed — check your connection');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  // ── drag and drop ───────────────────────────────────────────────────────────

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }
  function onDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }

  // ── citation toggle ─────────────────────────────────────────────────────────

  function setCitation(id: string, index: number | null) {
    setMessages(prev => prev.map(m =>
      m.id === id
        ? { ...m, activeCitation: m.activeCitation === index ? null : index }
        : m
    ));
  }

  // ── question submit ─────────────────────────────────────────────────────────

  async function submitQuestion() {
    const q = question.trim();
    if (!q || isStreaming) return;

    const id = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id, question: q, answer: '', chunks: [], streaming: true, activeCitation: null,
    }]);
    setQuestion('');
    setIsStreaming(true);

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        setMessages(prev => prev.map(m =>
          m.id === id ? { ...m, streaming: false, error: err.error } : m
        ));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'chunk') {
              setMessages(prev => prev.map(m =>
                m.id === id ? { ...m, answer: m.answer + event.text } : m
              ));
            } else if (event.type === 'done') {
              setMessages(prev => prev.map(m =>
                m.id === id ? { ...m, streaming: false, chunks: event.chunks } : m
              ));
            } else if (event.type === 'error') {
              setMessages(prev => prev.map(m =>
                m.id === id ? { ...m, streaming: false, error: event.message } : m
              ));
            }
          } catch {
            // ignore malformed events
          }
        }
      }
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === id ? { ...m, streaming: false, error: 'Stream interrupted — please try again.' } : m
      ));
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitQuestion();
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className={`flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 relative transition-colors ${isDragging ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-zinc-400 dark:border-zinc-500 rounded-none pointer-events-none bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-zinc-500 dark:text-zinc-400">
            <UploadIcon />
            <p className="text-base font-medium">Drop files to upload</p>
            <p className="text-sm">PDF, TXT, or MD</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center gap-4 flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Forge RAG</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Upload documents. Ask questions. Get cited answers.</p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md"
            multiple
            className="hidden"
            onChange={e => e.target.files && handleFiles(e.target.files)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadStatus === 'uploading'}
            className="px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {uploadStatus === 'uploading' ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Uploading…
              </span>
            ) : 'Upload documents'}
          </button>
        </div>
      </header>

      {/* Uploaded docs strip */}
      {(docs.length > 0 || uploadError) && (
        <div className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-2 flex flex-wrap gap-2 items-center">
          {docs.map((d, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2.5 py-1 rounded-full">
              <span className="text-green-500">✓</span>
              {d.docName}
              <span className="text-zinc-400">({d.chunkCount} chunks)</span>
            </span>
          ))}
          {uploadError && (
            <span className="inline-flex items-center gap-1.5 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-2.5 py-1 rounded-full">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {uploadError}
              <button onClick={() => setUploadError('')} className="ml-1 hover:text-red-700 dark:hover:text-red-300">✕</button>
            </span>
          )}
        </div>
      )}

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4 min-h-48">
            <UploadIcon />
            {docs.length === 0 ? (
              <>
                <div>
                  <p className="text-base font-medium text-zinc-600 dark:text-zinc-400">No documents uploaded yet</p>
                  <p className="text-sm text-zinc-400 dark:text-zinc-600 mt-1">Click <strong>Upload documents</strong> or drop files here to get started.</p>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                >
                  Choose files
                </button>
              </>
            ) : (
              <div>
                <p className="text-base font-medium text-zinc-600 dark:text-zinc-400">Ready to answer questions</p>
                <p className="text-sm text-zinc-400 dark:text-zinc-600 mt-1">Type a question below about your uploaded documents.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map(msg => (
              <div key={msg.id} className="space-y-2">
                {/* Question */}
                <div className="flex justify-end">
                  <div className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[80%] text-sm">
                    {msg.question}
                  </div>
                </div>

                {/* Answer */}
                <div className="flex justify-start">
                  <div className={`border px-4 py-3 rounded-2xl rounded-tl-sm max-w-[80%] text-sm leading-relaxed ${
                    msg.error
                      ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                      : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700'
                  }`}>
                    {msg.error ? (
                      <span className="flex items-start gap-2">
                        <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                        </svg>
                        {msg.error}
                      </span>
                    ) : msg.answer ? (
                      <AnswerText
                        text={msg.answer}
                        chunks={msg.chunks}
                        streaming={msg.streaming}
                        activeCitation={msg.activeCitation}
                        onCitationClick={index => setCitation(msg.id, index)}
                      />
                    ) : (
                      <LoadingDots />
                    )}
                  </div>
                </div>

                {/* Source panel */}
                {msg.activeCitation !== null &&
                  msg.chunks[msg.activeCitation - 1] && (
                    <div className="max-w-[80%]">
                      <SourcePanel
                        index={msg.activeCitation}
                        chunk={msg.chunks[msg.activeCitation - 1]}
                        onClose={() => setCitation(msg.id, null)}
                      />
                    </div>
                  )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      {/* Question input */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-4 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={docs.length === 0 ? 'Upload a document first…' : 'Ask a question about your documents…'}
            disabled={docs.length === 0 || isStreaming}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-3 text-sm placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500 disabled:opacity-50 max-h-40 overflow-y-auto"
          />
          <button
            onClick={submitQuestion}
            disabled={!question.trim() || isStreaming || docs.length === 0}
            className="px-4 py-3 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity flex-shrink-0"
          >
            {isStreaming ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : 'Send'}
          </button>
        </div>
        <p className="max-w-3xl mx-auto mt-1.5 text-xs text-zinc-400 dark:text-zinc-600">
          Enter to send · Shift+Enter for newline · Drop files anywhere to upload
        </p>
      </div>
    </div>
  );
}
