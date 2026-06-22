import { NextRequest, NextResponse } from 'next/server';
import { embedQuery } from '@/lib/embed';
import { queryChunks } from '@/lib/vectorStore';

export const runtime = 'nodejs';

const TOP_K = 5;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const question = body?.question?.trim();

  if (!question) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 });
  }

  const vector = await embedQuery(question);
  const chunks = await queryChunks(vector, TOP_K);

  return NextResponse.json({ question, chunks });
}
