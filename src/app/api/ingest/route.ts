import { NextRequest, NextResponse } from 'next/server';
import { chunkDocument } from '@/lib/chunk';
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
    const docId = crypto.randomUUID();
    const chunks = chunkDocument(text, file.name, docId);

    console.log(`[ingest] "${file.name}" → ${chunks.length} chunks`);
    for (const c of chunks) {
      console.log(`  [${c.position}] (${c.text.length} chars): ${c.text.slice(0, 120).replace(/\n/g, ' ')}…`);
    }

    results.push({ docName: file.name, docId, chunkCount: chunks.length });
  }

  return NextResponse.json({ results });
}

async function extractText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const arrayBuffer = await file.arrayBuffer();
    const parser = new PDFParse({ data: new Uint8Array(arrayBuffer) });
    const result = await parser.getText();
    return result.text;
  }

  return file.text();
}
