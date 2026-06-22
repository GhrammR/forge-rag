export interface Chunk {
  chunkId: string;
  docId: string;
  docName: string;
  position: number;
  text: string;
}

export interface RetrievedChunk extends Chunk {
  score: number;
}

export interface Citation {
  index: number;
  chunk: RetrievedChunk;
}
