/**
 * Groq client — server-only.
 *
 * Free tier (Q1 2026, approx):
 *   llama-3.1-8b-instant   — 30 RPM, 14_400 RPD
 *   llama-3.1-70b-versatile — 30 RPM,   1_000 RPD (paid recommended)
 *
 * API is OpenAI-compatible at /openai/v1/chat/completions.
 * Auth: GROQ_API_KEY env var.
 */
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export interface GroqOptions {
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export interface GroqResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
  error?: { message: string; type?: string };
}

export async function callGroq(prompt: string, options: GroqOptions = {}): Promise<GroqResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  const model = options.model ?? 'llama-3.1-8b-instant';
  const messages: Array<{ role: string; content: string }> = [];
  if (options.systemPrompt) {
    const sys = options.json
      ? `${options.systemPrompt}\n\nRespond with valid JSON only — no preamble or markdown fences.`
      : options.systemPrompt;
    messages.push({ role: 'system', content: sys });
  }
  messages.push({ role: 'user', content: prompt });

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2048,
  };
  if (options.json) body.response_format = { type: 'json_object' };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new GroqQuotaError(`Groq ${model} 429 quota`);
  if (!res.ok) {
    const txt = (await res.text()).slice(0, 500);
    throw new Error(`Groq ${model} ${res.status}: ${txt}`);
  }

  const json = (await res.json()) as ChatResponse;
  if (json.error) {
    if (/rate|quota/i.test(json.error.message)) throw new GroqQuotaError(json.error.message);
    throw new Error(`Groq: ${json.error.message}`);
  }
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq: empty response');
  return {
    text,
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
    model: json.model ?? model,
  };
}

export class GroqQuotaError extends Error {
  readonly isQuota = true;
}
