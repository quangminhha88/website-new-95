/**
 * Gemini embedding client — server-side only.
 *
 * Wraps the Google Generative Language API embedding endpoint. Uses
 * `gemini-embedding-001` with MRL output_dimensionality=1536 to match
 * the pgvector column.
 *
 * Auth: requires GEMINI_API_KEY in env (Vercel/.env.local).
 *
 * NEVER import this from client code — the API key would leak.
 */

const ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';
const DIM = 1536;

interface EmbedResponse {
  embedding?: { values: number[] };
  error?: { message: string };
}

export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  if (!text || !text.trim()) throw new Error('embedText: empty input');

  const url = `${ENDPOINT}?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text: text.slice(0, 8000) }] }, // 8k char cap
      taskType: 'SEMANTIC_SIMILARITY',
      outputDimensionality: DIM,
    }),
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`embedText: ${res.status} ${body}`);
  }

  const json = (await res.json()) as EmbedResponse;
  if (json.error) throw new Error(`embedText: ${json.error.message}`);
  const values = json.embedding?.values;
  if (!values || values.length !== DIM) {
    throw new Error(`embedText: unexpected dim ${values?.length}`);
  }
  return values;
}
