/**
 * OpenAI client — server-only. Used as the last-resort fallback in ai.ts.
 * Auth: OPENAI_API_KEY env var.
 */
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export interface OpenAIOptions {
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export interface OpenAIResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
  error?: { message: string };
}

export async function callOpenAI(
  prompt: string,
  options: OpenAIOptions = {},
): Promise<OpenAIResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const model = options.model ?? 'gpt-4o-mini';
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

  if (!res.ok) {
    const txt = (await res.text()).slice(0, 500);
    throw new Error(`OpenAI ${model} ${res.status}: ${txt}`);
  }

  const json = (await res.json()) as ChatResponse;
  if (json.error) throw new Error(`OpenAI: ${json.error.message}`);
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI: empty response');
  return {
    text,
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
    model: json.model ?? model,
  };
}
