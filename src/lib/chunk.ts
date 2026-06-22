import { Chunk } from '@/types';

const TARGET_CHARS = 3000; // ~750 tokens at ~4 chars/token
const OVERLAP_CHARS = 400; // ~100 tokens
const SEPARATORS = ['\n\n', '\n', '. ', ' '];

export function chunkDocument(text: string, docName: string, docId: string): Chunk[] {
  const rawChunks = splitRecursive(text.trim());
  return rawChunks
    .filter((t) => t.trim().length > 0)
    .map((t, position) => ({
      chunkId: `${docId}-${position}`,
      docId,
      docName,
      position,
      text: t.trim(),
    }));
}

function splitRecursive(text: string, sepIdx = 0): string[] {
  if (text.length <= TARGET_CHARS) return [text];

  if (sepIdx >= SEPARATORS.length) {
    const result: string[] = [];
    for (let i = 0; i < text.length; i += TARGET_CHARS - OVERLAP_CHARS) {
      result.push(text.slice(i, i + TARGET_CHARS));
    }
    return result;
  }

  const sep = SEPARATORS[sepIdx];
  const parts = text.split(sep).filter((s) => s.trim().length > 0);

  if (parts.length <= 1) return splitRecursive(text, sepIdx + 1);

  // Recursively split any part that is itself too large
  const fine: string[] = [];
  for (const part of parts) {
    if (part.length > TARGET_CHARS) {
      fine.push(...splitRecursive(part, sepIdx + 1));
    } else {
      fine.push(part);
    }
  }

  return mergeWithOverlap(fine, sep);
}

function mergeWithOverlap(parts: string[], sep: string): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const part of parts) {
    const candidate = current ? `${current}${sep}${part}` : part;
    if (candidate.length <= TARGET_CHARS) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      const overlap = current.slice(-OVERLAP_CHARS);
      current = overlap ? `${overlap}${sep}${part}` : part;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
