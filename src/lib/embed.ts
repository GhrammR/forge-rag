import { VoyageAIClient } from 'voyageai';

const MODEL = 'voyage-3';

let client: VoyageAIClient | null = null;

function getClient(): VoyageAIClient {
  if (!client) {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) throw new Error('VOYAGE_API_KEY is not set');
    client = new VoyageAIClient({ apiKey });
  }
  return client;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const result = await getClient().embed({
    input: texts,
    model: MODEL,
  });
  if (!result.data) throw new Error('Voyage AI returned no embedding data');
  return result.data.map((d) => d.embedding as number[]);
}

export async function embedQuery(text: string): Promise<number[]> {
  const result = await getClient().embed({
    input: [text],
    model: MODEL,
    inputType: 'query',
  });
  if (!result.data) throw new Error('Voyage AI returned no embedding data');
  return result.data[0].embedding as number[];
}
