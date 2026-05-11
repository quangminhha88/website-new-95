/**
 * Anthropic Claude client — server-only.
 *
 * Wraps the Messages API. Returns text + token usage so the caller can
 * log to ai_usage_log for cost tracking.
 *
 * Auth: ANTHROPIC_API_KEY env var.
 */

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';

export interface ClaudeOptions {
  model?: 'claude-3-5-sonnet-latest' | 'claude-3-5-haiku-latest';
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
}

export interface ClaudeResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

interface MessagesResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens: number; output_tokens: number };
  model?: string;
  error?: { message: string };
}

export async function callClaude(prompt: string, options: ClaudeOptions = {}): Promise<ClaudeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const model = options.model ?? 'claude-3-5-sonnet-latest';
  const finalSystem = options.json
    ? `${options.systemPrompt ?? ''}\n\nRespond with strict JSON, no preamble or markdown fences.`
    : options.systemPrompt;

  const body: Record<string, unknown> = {
    model,
    max_tokens: options.maxTokens ?? 2048,
    temperature: options.temperature ?? 0.7,
    messages: [{ role: 'user', content: prompt }],
  };
  if (finalSystem) body.system = finalSystem;

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = (await res.text()).slice(0, 500);
    throw new Error(`Claude ${res.status}: ${txt}`);
  }

  const json = (await res.json()) as MessagesResponse;
  if (json.error) throw new Error(`Claude: ${json.error.message}`);

  const text = json.content?.find((c) => c.type === 'text')?.text;
  if (!text) throw new Error('Claude: empty response');

  return {
    text,
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
    model: json.model ?? model,
  };
}
