import { NextRequest, NextResponse } from 'next/server';
import { chunkDocument } from '@/lib/chunk';
import { embedTexts } from '@/lib/embed';
import { upsertChunks } from '@/lib/vectorStore';
import crypto from 'crypto';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const files = formData.getAll('files') as File[];

  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  const results = [];

  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'txt', 'md'].includes(ext ?? '')) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.name}` },
        { status: 400 }
      );
    }

    const text = await extractText(file);

    if (text.trim().length === 0) {
      return NextResponse.json(
        {
          error: `No text could be extracted from "${file.name}". The file may be a scanned image PDF or otherwise contain no selectable text.`,
        },
        { status: 422 }
      );
    }

    const docId = crypto.randomUUID();
    const chunks = chunkDocument(text, file.name, docId);

    console.log(`[ingest] "${file.name}" → ${chunks.length} chunks`);
    for (const c of chunks) {
      console.log(`  [${c.position}] (${c.text.length} chars): ${c.text.slice(0, 120).replace(/\n/g, ' ')}…`);
    }

    const vectors = await embedTexts(chunks.map((c) => c.text));
    await upsertChunks(chunks, vectors);

    console.log(`[ingest] "${file.name}" → upserted ${chunks.length} vectors`);

    results.push({ docName: file.name, docId, chunkCount: chunks.length });
  }

  return NextResponse.json({ results });
}

async function extractText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const buffer = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buffer);
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }

  return file.text();
}
