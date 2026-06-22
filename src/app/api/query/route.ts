import { NextRequest, NextResponse } from 'next/server';
import { embedQuery } from '@/lib/embed';
import { queryChunks } from '@/lib/vectorStore';
import { buildPrompt } from '@/lib/prompt';
import { callClaude } from '@/lib/llm';

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

  const { prompt } = buildPrompt(question, chunks);
  const answer = await callClaude(prompt);

  console.log(`[query] "${question}" → ${answer.slice(0, 120).replace(/\n/g, ' ')}…`);

  return NextResponse.json({ question, answer, chunks });
}
