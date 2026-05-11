/**
 * Multi-provider AI wrapper.
 *
 * Single hub for every text-generation call. Replaces direct Gemini calls
 * for callers that want "best available LLM" rather than a specific provider.
 *
 * Provider priority
 * ═════════════════
 *   AI_PROVIDER=groq   → Groq only
 *   AI_PROVIDER=gemini → Gemini only (uses src/lib/gemini.ts internally)
 *   AI_PROVIDER=openai → OpenAI only
 *   AI_PROVIDER=auto (default):
 *     AI_MODE=free  →  Groq → Gemini-free
 *     AI_MODE=paid  →  OpenAI
 *     AI_MODE=auto  →  Groq → Gemini → OpenAI    (free first, escalate)
 *
 * Why this order?
 *   Groq Llama 3.x is the fastest + most generous free tier (≈30 RPM,
 *   no spend). Gemini free has tighter limits but covers JSON mode well.
 *   OpenAI is the always-paid stable fallback for when both free tiers
 *   are exhausted.
 *
 * Reliability chain
 * ═════════════════
 *   1. Cache lookup (Upstash, 24h)
 *   2. For each provider in order:
 *        - Quota gate (RPM + RPD per provider)
 *        - HTTP call
 *        - Cache write on success
 *   3. All providers failed → opts.fallback ?? mock-by-hint
 */
import { Redis } from '@upstash/redis';
import { geminiGenerate, type GeminiMode } from './gemini';
import { createLogger } from './logger';

const log = createLogger('ai');

// ── Models ──────────────────────────────────────────────────────────────
const GROQ_MODEL = 'llama-3.1-8b-instant'; // free, ~30 RPM, sub-second
const OPENAI_MODEL = 'gpt-4o-mini';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const QUOTA_GROQ = { rpm: 30, rpd: 14_400 };
const CACHE_TTL_SECONDS = 24 * 60 * 60;

const COST: Record<string, { input: number; output: number }> = {
  groq: { input: 0, output: 0 },
  'gemini-2.0-flash-exp': { input: 0, output: 0 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  cache: { input: 0, output: 0 },
  fallback: { input: 0, output: 0 },
};

export type AIProvider = 'groq' | 'gemini' | 'openai' | 'auto';
export type AIMode = 'free' | 'paid' | 'auto';

export interface AIOptions {
  systemPrompt?: string;
  json?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  provider?: AIProvider;
  mode?: AIMode;
  cacheKey?: string;
  fallback?: unknown;
  contentHint?: 'description' | 'features' | 'faqs' | 'verdict' | 'conversion_hook' | 'generic';
}

export interface AICallMeta {
  provider: 'groq' | 'gemini' | 'openai' | 'cache' | 'fallback';
  model: string;
  cached: boolean;
  fallback: boolean;
  attemptCount: number;
  costUsd: number;
}

// ── Public API ──────────────────────────────────────────────────────────

export async function aiGenerate<T = string>(
  prompt: string,
  options: AIOptions = {},
): Promise<{ data: T; meta: AICallMeta }> {
  if (options.cacheKey) {
    const cached = await readCache(options.cacheKey);
    if (cached !== null) {
      const data = options.json ? (JSON.parse(cached) as T) : (cached as unknown as T);
      return {
        data,
        meta: {
          provider: 'cache',
          model: 'cache',
          cached: true,
          fallback: false,
          attemptCount: 0,
          costUsd: 0,
        },
      };
    }
  }

  const order = resolveOrder(options);
  let attempt = 0;
  let lastErr: unknown;

  for (const provider of order) {
    attempt++;
    try {
      const result = await callProvider(provider, prompt, options);
      if (options.cacheKey) await writeCache(options.cacheKey, result.text);
      const data = options.json ? (JSON.parse(result.text) as T) : (result.text as unknown as T);
      return {
        data,
        meta: {
          provider,
          model: result.model,
          cached: false,
          fallback: false,
          attemptCount: attempt,
          costUsd: result.costUsd,
        },
      };
    } catch (err) {
      lastErr = err;
      log.warn(`${provider} failed (attempt ${attempt}): ${msg(err)}`);
    }
  }

  log.warn(`All AI providers failed: ${msg(lastErr)}`);
  const fallback = (options.fallback ?? buildMock(options.contentHint, options.json)) as T;
  return {
    data: fallback,
    meta: {
      provider: 'fallback',
      model: 'fallback',
      cached: false,
      fallback: true,
      attemptCount: attempt,
      costUsd: 0,
    },
  };
}

/** Legacy shape — returns only the parsed value. Drop-in replacement for
 *  the old `generateContent` so existing callers keep working. */
export async function generateContent<T = string>(
  prompt: string,
  options: AIOptions = {},
): Promise<T> {
  const { data } = await aiGenerate<T>(prompt, options);
  return data;
}

// ── Provider order resolution ──────────────────────────────────────────

function resolveOrder(opts: AIOptions): Array<'groq' | 'gemini' | 'openai'> {
  const provider = opts.provider ?? (process.env.AI_PROVIDER as AIProvider) ?? 'auto';
  const mode = opts.mode ?? (process.env.AI_MODE as AIMode) ?? 'free';

  if (provider === 'groq') return ['groq'];
  if (provider === 'gemini') return ['gemini'];
  if (provider === 'openai') return ['openai'];

  if (mode === 'free') return ['groq', 'gemini'];
  if (mode === 'paid') return ['openai'];
  return ['groq', 'gemini', 'openai'];
}

// ── Provider dispatch ──────────────────────────────────────────────────

interface ProviderResult {
  text: string;
  model: string;
  costUsd: number;
}

async function callProvider(
  provider: 'groq' | 'gemini' | 'openai',
  prompt: string,
  options: AIOptions,
): Promise<ProviderResult> {
  switch (provider) {
    case 'groq':
      return callGroq(prompt, options);
    case 'gemini':
      return callGeminiBridge(prompt, options);
    case 'openai':
      return callOpenAI(prompt, options);
  }
}

// ── Groq (OpenAI-compatible API) ───────────────────────────────────────

async function callGroq(prompt: string, options: AIOptions): Promise<ProviderResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  const ok = await checkQuota('groq', QUOTA_GROQ);
  if (!ok) throw new QuotaError('Groq free quota exhausted');

  const body: Record<string, unknown> = {
    model: GROQ_MODEL,
    messages: buildMessages(prompt, options.systemPrompt),
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxOutputTokens ?? 2048,
  };
  if (options.json) body.response_format = { type: 'json_object' };

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new QuotaError('Groq returned 429');
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const json = (await res.json()) as ChatCompletion;
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq: empty response');

  const tokensIn = json.usage?.prompt_tokens ?? approxTokens(prompt);
  const tokensOut = json.usage?.completion_tokens ?? approxTokens(text);
  const costUsd = (tokensIn / 1e6) * COST.groq.input + (tokensOut / 1e6) * COST.groq.output;
  return { text, model: GROQ_MODEL, costUsd };
}

// ── Gemini bridge (delegates to existing wrapper) ──────────────────────

async function callGeminiBridge(prompt: string, options: AIOptions): Promise<ProviderResult> {
  const geminiMode: GeminiMode =
    options.mode === 'paid' ? 'paid' : options.mode === 'auto' ? 'auto' : 'free';
  const { data, meta } = await geminiGenerate<string>(prompt, {
    systemPrompt: options.systemPrompt,
    json: options.json,
    temperature: options.temperature,
    maxOutputTokens: options.maxOutputTokens,
    mode: geminiMode,
    contentHint: options.contentHint,
  });
  if (meta.fallback) throw new Error('Gemini returned fallback content');
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  const tokensIn = approxTokens(prompt);
  const tokensOut = approxTokens(text);
  const rates = COST[meta.model] ?? COST['gemini-2.0-flash'];
  const costUsd = (tokensIn / 1e6) * rates.input + (tokensOut / 1e6) * rates.output;
  return { text, model: meta.model, costUsd };
}

// ── OpenAI ─────────────────────────────────────────────────────────────

async function callOpenAI(prompt: string, options: AIOptions): Promise<ProviderResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  // Daily budget gate — capped expensive-path calls
  const budgetOk = await checkClaudeDailyBudget();
  if (!budgetOk) throw new QuotaError('Claude daily budget exceeded');

  const body: Record<string, unknown> = {
    model: OPENAI_MODEL,
    messages: buildMessages(prompt, options.systemPrompt),
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxOutputTokens ?? 2048,
  };
  if (options.json) body.response_format = { type: 'json_object' };

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new QuotaError('OpenAI returned 429');
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const json = (await res.json()) as ChatCompletion;
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI: empty response');

  const tokensIn = json.usage?.prompt_tokens ?? approxTokens(prompt);
  const tokensOut = json.usage?.completion_tokens ?? approxTokens(text);
  const costUsd =
    (tokensIn / 1e6) * COST['gpt-4o-mini'].input + (tokensOut / 1e6) * COST['gpt-4o-mini'].output;
  return { text, model: OPENAI_MODEL, costUsd };
}

// ── Shared helpers ─────────────────────────────────────────────────────

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

class QuotaError extends Error {
  readonly isQuota = true;
}

function buildMessages(
  prompt: string,
  systemPrompt?: string,
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });
  return messages;
}

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ── Quota + cache (Upstash) ────────────────────────────────────────────

let redis: Redis | null = null;
let _redisWarnLogged = false;
const _memCounters = new Map<string, number[]>();
const _claudeDayMap = new Map<string, number>();

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!_redisWarnLogged) {
      log.warn('Upstash not configured — using in-memory rate limiting (lossy across restarts)');
      _redisWarnLogged = true;
    }
    return null;
  }
  redis = new Redis({ url, token });
  return redis;
}

async function checkQuota(
  provider: string,
  limits: { rpm: number; rpd: number },
): Promise<boolean> {
  const r = getRedis();
  const now = Date.now();

  if (!r) {
    // No Redis → in-memory sliding window over the last 60 s
    const key = `${provider}:rpm`;
    const stamps = (_memCounters.get(key) ?? []).filter((t) => t > now - 60_000);
    if (stamps.length >= limits.rpm) {
      log.warn(`${provider} in-memory quota: ${stamps.length}/${limits.rpm} per min`);
      _memCounters.set(key, stamps); // persist the trimmed window
      return false;
    }
    stamps.push(now);
    _memCounters.set(key, stamps);
    return true;
  }

  const minuteKey = `ai:${provider}:rpm:${new Date(now).toISOString().slice(0, 16)}`;
  const dayKey = `ai:${provider}:rpd:${new Date(now).toISOString().slice(0, 10)}`;
  try {
    const [m, d] = await Promise.all([r.incr(minuteKey), r.incr(dayKey)]);
    if (m === 1) await r.expire(minuteKey, 90);
    if (d === 1) await r.expire(dayKey, 86_400 + 3600);
    if (m > limits.rpm || d > limits.rpd) {
      log.warn(`${provider} quota: ${m}/${limits.rpm}/min, ${d}/${limits.rpd}/day`);
      return false;
    }
    return true;
  } catch (err) {
    log.warn(`Quota check failed for ${provider}: ${msg(err)}`);
    return true;
  }
}

/**
 * Daily budget gate for the high-cost paid escalation path (OpenAI).
 * Capped via MAX_CLAUDE_CALLS_PER_DAY env var (default 20). Uses Redis
 * INCR with 25h expiry, falling back to a per-process Map keyed by date.
 */
async function checkClaudeDailyBudget(): Promise<boolean> {
  const max = parseInt(process.env.MAX_CLAUDE_CALLS_PER_DAY ?? '20', 10);
  const today = new Date().toISOString().slice(0, 10);
  const r = getRedis();

  if (!r) {
    const count = (_claudeDayMap.get(today) ?? 0) + 1;
    _claudeDayMap.set(today, count);
    return count <= max;
  }

  try {
    const key = `ai:claude:rpd:${today}`;
    const count = await r.incr(key);
    if (count === 1) await r.expire(key, 90_000);
    return count <= max;
  } catch (err) {
    log.warn(`Claude daily budget check failed: ${msg(err)}`);
    // On Redis error, fall through to in-memory counter so we still cap
    const count = (_claudeDayMap.get(today) ?? 0) + 1;
    _claudeDayMap.set(today, count);
    return count <= max;
  }
}

async function readCache(key: string): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return (await r.get(`ai:cache:${key}`)) as string | null;
  } catch {
    return null;
  }
}

async function writeCache(key: string, value: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(`ai:cache:${key}`, value, { ex: CACHE_TTL_SECONDS });
  } catch {
    /* don't fail caller on cache write */
  }
}

// ── Mock fallbacks (last resort when every provider fails) ─────────────

function buildMock(
  hint: AIOptions['contentHint'] = 'generic',
  json = false,
): string | unknown[] | Record<string, unknown> {
  if (json) {
    if (hint === 'features') return ['Core feature', 'Integrations', 'Reporting', 'Team support'];
    if (hint === 'faqs')
      return [{ q: 'What is this tool used for?', a: 'See the official site for current capabilities.' }];
    return {};
  }
  if (hint === 'description')
    return '<p>Detailed description coming soon — check the official site for current capabilities.</p>';
  if (hint === 'verdict')
    return 'A capable option in its category. Verify current pricing and features on the official site.';
  if (hint === 'conversion_hook') return 'Visit the official site';
  return '';
}

// FIXED: [P0-A]
