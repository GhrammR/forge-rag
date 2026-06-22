import type { RetrievedChunk } from '@/types';

export interface PromptResult {
  prompt: string;
  indexMap: Map<number, RetrievedChunk>;
}

export function buildPrompt(question: string, chunks: RetrievedChunk[]): PromptResult {
  const indexMap = new Map<number, RetrievedChunk>();

  const contextBlock = chunks
    .map((chunk, i) => {
      const n = i + 1;
      indexMap.set(n, chunk);
      return `[${n}] (from "${chunk.docName}", chunk ${chunk.position}): ${chunk.text}`;
    })
    .join('\n\n');

  const prompt = `You are answering strictly from the sources below. Each source is numbered.

${contextBlock}

Rules:
- Answer ONLY using the sources above.
- After each claim, cite the source number(s) in square brackets, e.g. [1] or [2][3].
- If the sources do not contain the answer, say exactly: "I couldn't find that in the provided documents." Do not guess.

Question: ${question}`;

  return { prompt, indexMap };
}
