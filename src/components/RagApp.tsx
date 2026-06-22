'use client';

import { useState, useRef, useEffect } from 'react';
import type { RetrievedChunk } from '@/types';
import { parseCitations } from '@/lib/parseCitations';

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
          Source [{index}] &mdash; <span className="text-zinc-500 dark:text-zinc-400">{chunk.docName}</span>
          <span className="ml-2 text-zinc-400">chunk {chunk.position}</span>
        </span>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors leading-none"
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

export default function RagApp() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadError, setUploadError] = useState('');
  const [question, setQuestion] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.answer]);

  async function handleFiles(files: FileList) {
    if (files.length === 0) return;
    setUploadStatus('uploading');
    setUploadError('');

    const formData = new FormData();
    for (const file of files) formData.append('files', file);

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
  }

  function setCitation(id: string, index: number | null) {
    setMessages(prev => prev.map(m =>
      m.id === id
        ? { ...m, activeCitation: m.activeCitation === index ? null : index }
        : m
    ));
  }

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
        m.id === id ? { ...m, streaming: false, error: 'Stream interrupted' } : m
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

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
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
            {uploadStatus === 'uploading' ? 'Uploading…' : 'Upload documents'}
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
            <span className="text-xs text-red-500">{uploadError}</span>
          )}
        </div>
      )}

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-zinc-400 dark:text-zinc-600 gap-2">
            <p className="text-lg font-medium">No questions yet</p>
            <p className="text-sm">Upload a document then ask a question below.</p>
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
                  <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 py-3 rounded-2xl rounded-tl-sm max-w-[80%] text-sm leading-relaxed">
                    {msg.error ? (
                      <span className="text-red-500">{msg.error}</span>
                    ) : msg.answer ? (
                      <AnswerText
                        text={msg.answer}
                        chunks={msg.chunks}
                        streaming={msg.streaming}
                        activeCitation={msg.activeCitation}
                        onCitationClick={index => setCitation(msg.id, index)}
                      />
                    ) : (
                      <span className="inline-block w-0.5 h-4 bg-zinc-400 animate-pulse align-middle" />
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
            {isStreaming ? '…' : 'Send'}
          </button>
        </div>
        <p className="max-w-3xl mx-auto mt-1.5 text-xs text-zinc-400 dark:text-zinc-600">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
