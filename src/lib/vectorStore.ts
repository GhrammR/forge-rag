import { Index } from '@upstash/vector';
import type { Chunk, RetrievedChunk } from '@/types';

let index: Index | null = null;

function getIndex(): Index {
  if (!index) {
    const url = process.env.UPSTASH_VECTOR_REST_URL;
    const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
    if (!url || !token) throw new Error('UPSTASH_VECTOR_REST_URL or UPSTASH_VECTOR_REST_TOKEN is not set');
    index = new Index({ url, token });
  }
  return index;
}

export async function upsertChunks(chunks: Chunk[], vectors: number[][]): Promise<void> {
  const records = chunks.map((chunk, i) => ({
    id: chunk.chunkId,
    vector: vectors[i],
    metadata: {
      docId: chunk.docId,
      docName: chunk.docName,
      position: chunk.position,
      text: chunk.text,
    },
  }));
  await getIndex().upsert(records);
}

export async function queryChunks(vector: number[], topK = 5): Promise<RetrievedChunk[]> {
  const results = await getIndex().query({
    vector,
    topK,
    includeMetadata: true,
  });

  return results.map((r) => {
    const m = r.metadata as Record<string, unknown>;
    return {
      chunkId: String(r.id),
      docId: String(m.docId),
      docName: String(m.docName),
      position: Number(m.position),
      text: String(m.text),
      score: r.score,
    };
  });
}
