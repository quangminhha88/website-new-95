/**
 * Gemini Flash text generation — server-only.
 *
 * Used by the content-refresh cron to regenerate descriptions, FAQs,
 * and conversion hooks without spending money. gemini-2.5-flash is the
 * current free-tier model (rate-limited but free).
 *
 * NEVER import from client code — leaks the API key.
 */
const ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

interface GenerateOptions {
  /** Lower = more deterministic. Default 0.7. */
  temperature?: number;
  /** Hard cap on tokens. Default 2048. */
  maxOutputTokens?: number;
  /** JSON-mode — requires the prompt to instruct JSON output too. */
  responseJson?: boolean;
}

interface GenerateResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message: string };
}

export async function generateText(
  prompt: string,
  options: GenerateOptions = {},
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  if (!prompt.trim()) throw new Error('generateText: empty prompt');

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? 2048,
    },
  };
  if (options.responseJson) {
    (body.generationConfig as Record<string, unknown>).responseMimeType = 'application/json';
  }

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = (await res.text()).slice(0, 300);
    throw new Error(`Gemini ${res.status}: ${errBody}`);
  }

  const json = (await res.json()) as GenerateResponse;
  if (json.error) throw new Error(`Gemini: ${json.error.message}`);
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini: empty response');
  return text.trim();
}
