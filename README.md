# Forge RAG

A portfolio RAG demo built with Next.js 16, Claude, Voyage AI, and Upstash Vector. Upload PDF, TXT, or MD documents, ask questions, and get answers with inline citations that link back to the exact source passages.

**Live demo:** https://forge-rag-three.vercel.app/

<img width="1105" height="718" alt="Forge-RAG" src="https://github.com/user-attachments/assets/3a92f1df-582f-4cbc-aa44-756cd724a7da" />

---

## How it works

```
Upload            Ingest pipeline                   Query pipeline
──────   ──────────────────────────────   ──────────────────────────────────────
PDF/TXT  → extract text (unpdf)          question → embed (Voyage AI voyage-3)
  /MD    → chunk (recursive splitter)            → retrieve top-5 (Upstash Vector)
         → embed (Voyage AI voyage-3)            → grounded-citation prompt
         → upsert vectors (Upstash)              → stream answer (Claude Sonnet)
                                                 → parse [n] → clickable citations
```

The answer prompt forces Claude to cite every claim with `[n]` markers and to say exactly *"I couldn't find that in the provided documents."* when the answer isn't in the retrieved chunks — no hallucination.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Tailwind CSS v4) |
| LLM | Claude Sonnet (`claude-sonnet-4-6`) via `@anthropic-ai/sdk` |
| Embeddings | Voyage AI `voyage-3` (1024-dim) |
| Vector store | Upstash Vector (serverless, cosine similarity) |
| PDF extraction | `unpdf` (serverless-safe, no web worker) |
| Streaming | SSE via Web Streams API (`ReadableStream`) |
| Deploy | Vercel |

---

## Project structure

```
src/
  app/
    api/
      ingest/route.ts   POST — extract → chunk → embed → upsert
      query/route.ts    POST — embed query → retrieve → prompt → stream SSE
    page.tsx            Shell (renders <RagApp />)
    layout.tsx
  components/
    RagApp.tsx          Client component — all UI state, streaming reader
  lib/
    chunk.ts            Recursive character text splitter
    embed.ts            Voyage AI wrapper (query + document embeddings)
    llm.ts              Claude streaming wrapper (streamClaude)
    parseCitations.ts   Splits answer text into text/citation segments
    prompt.ts           Builds grounded-citation prompt + index map
    vectorStore.ts      Upstash Vector upsert + query
  types.ts              Chunk, RetrievedChunk, Citation
```

---

## Local setup

**Prerequisites:** Node 18+, npm

```bash
git clone https://github.com/GhrammR/forge-rag.git
cd forge-rag
npm install
```

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

```env
ANTHROPIC_API_KEY=sk-ant-...
VOYAGE_API_KEY=pa-...
UPSTASH_VECTOR_REST_URL=https://...
UPSTASH_VECTOR_REST_TOKEN=...
```

```bash
npm run dev
```

Open http://localhost:3000.

---

## Environment variables

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `VOYAGE_API_KEY` | [dashboard.voyageai.com](https://dashboard.voyageai.com) → API Keys |
| `UPSTASH_VECTOR_REST_URL` | [console.upstash.com/vector](https://console.upstash.com/vector) → your index → REST API |
| `UPSTASH_VECTOR_REST_TOKEN` | same page as above |

> **Voyage AI free tier** has a 3 RPM / 10K TPM limit. Add a payment method at [dashboard.voyageai.com](https://dashboard.voyageai.com) to unlock standard rate limits (200M free tokens still apply).

---

## Deploy to Vercel

The repo is already connected to Vercel. Push to `main` to trigger a redeploy.

For a fresh deploy:

1. Import the repo at [vercel.com/new](https://vercel.com/new)
2. Add the four environment variables above in **Settings → Environment Variables**
3. Deploy — no build configuration needed

---

## SSE event protocol

The `/api/query` endpoint returns `text/event-stream`. Clients consume three event types:

```
data: {"type":"chunk","text":"..."}   — one per token, build answer incrementally
data: {"type":"done","chunks":[...]}  — final, carries retrieved chunks for citations
data: {"type":"error","message":"..."}— on failure
```

---

## Chunking parameters

| Parameter | Value |
|---|---|
| Target chunk size | 3000 chars |
| Overlap | 400 chars |
| Separators | `\n\n`, `\n`, `. `, ` ` |
| Retrieval top-k | 5 |
