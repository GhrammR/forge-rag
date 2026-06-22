import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    client = new Anthropic({ apiKey });
  }
  return client;
}

export async function callClaude(prompt: string): Promise<string> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('No text block in Claude response');
  return block.text;
}
