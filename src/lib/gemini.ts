/**
 * Central Gemini wrapper.
 *
 * Single hub for every Gemini call in the project. Replaces the simpler
 * `gemini-flash.ts` (kept as a re-export for back-compat).
 *
 * Modes
 * ═════
 *   GEMINI_MODE=free   →  always use the free-tier model
 *   GEMINI_MODE=paid   →  always use the paid-tier model
 *   GEMINI_MODE=auto   →  free first; on quota exhaustion or 429,
 *                          transparently retry on paid
 *   (default: free)
 *
 * Reliability chain
 * ═════════════════
 *   1. Cache hit (Redis) — skip the API entirely
 *   2. Try chosen model (free first if mode=auto)
 *   3. On quota/429: switch to paid (only if mode=auto)
 *   4. On error: return supplied `fallback` (degraded but valid)
 *   5. On error + no fallback: return MOCK content for the prompt type
 *
 * Quota
 * ═════
 *   Free-tier limits enforced client-side via Upstash counters:
 *     - 10 RPM
 *     - 1500 RPD
 *   Counter keys are bucketed per UTC minute / day.
 *
 * Cache
 * ═════
 *   Optional cache key (`cacheKey` param). When set, identical prompts
 *   re-use the previous result for 24h. Saves cost on regeneration runs
 *   that hit the same content twice.
 */
import { Redis } from '@upstash/redis';
import { createLogger } from './logger';

const log = createLogger('gemini');

// ── Models ──────────────────────────────────────────────────────────────
const FREE_MODEL = 'gemini-2.0-flash-exp';
const PAID_MODEL = 'gemini-2.0-flash';

const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// ── Free-tier quotas (RPM/RPD) ─────────────────────────────────────────
const FREE_RPM = 10;
const FREE_RPD = 1500;

const CACHE_TTL_SECONDS = 24 * 60 * 60;

// ── Types ──────────────────────────────────────────────────────────────
export type GeminiMode = 'free' | 'paid' | 'auto';

export interface GeminiOptions {
  systemPrompt?: string;
  json?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  /** Override mode for a single call */
  mode?: GeminiMode;
  /** Cache key suffix; when set, identical prompts skip API calls */
  cacheKey?: string;
  /** Returned if every model attempt fails (better than throwing) */
  fallback?: unknown;
  /** Used to pick a sensible mock when fallback is not provided */
  contentHint?: 'description' | 'features' | 'faqs' | 'verdict' | 'conversion_hook' | 'generic';
}

export interface GeminiCallMeta {
  model: string;
  cached: boolean;
  fallback: boolean;
  mode: GeminiMode;
  attemptCount: number;
}

interface ProviderResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message: string; status?: string };
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Returns the parsed result + call metadata. Use this when you want
 * cache/cost telemetry. For the legacy "just give me the data" shape,
 * use `generateContent()` below (re-exported from gemini-flash.ts).
 */
export async function geminiGenerate<T = string>(
  prompt: string,
  options: GeminiOptions = {},
): Promise<{ data: T; meta: GeminiCallMeta }> {
  const mode = options.mode ?? resolveMode();
  let attempt = 0;

  // 1. Cache lookup
  if (options.cacheKey) {
    const cached = await readCache(options.cacheKey);
    if (cached !== null) {
      const data = options.json ? (JSON.parse(cached) as T) : (cached as unknown as T);
      return {
        data,
        meta: { model: 'cache', cached: true, fallback: false, mode, attemptCount: 0 },
      };
    }
  }

  // 2. Determine attempt order
  const order: string[] =
    mode === 'free'
      ? [FREE_MODEL]
      : mode === 'paid'
        ? [PAID_MODEL]
        : [FREE_MODEL, PAID_MODEL]; // auto

  let lastErr: unknown;
  for (const model of order) {
    attempt++;
    try {
      // Quota gate (free-tier only)
      if (model === FREE_MODEL) {
        const allowed = await checkFreeQuota();
        if (!allowed) {
          log.warn('Free-tier quota exhausted');
          if (mode !== 'auto') break; // free-only mode → no fallback to paid
          continue;
        }
      }

      const text = await callModel(model, prompt, options);

      // Cache write
      if (options.cacheKey) {
        await writeCache(options.cacheKey, text);
      }

      const data = options.json ? (JSON.parse(text) as T) : (text as unknown as T);
      return {
        data,
        meta: { model, cached: false, fallback: false, mode, attemptCount: attempt },
      };
    } catch (err) {
      lastErr = err;
      log.warn(`Gemini ${model} failed (attempt ${attempt}): ${msg(err)}`);
      // 429 / quota → continue to next model in auto mode
    }
  }

  // 3. All models failed → fallback / mock
  log.warn(`All Gemini attempts failed: ${msg(lastErr)}`);
  const fallback = (options.fallback ?? buildMock(options.contentHint, options.json)) as T;
  return {
    data: fallback,
    meta: {
      model: 'fallback',
      cached: false,
      fallback: true,
      mode,
      attemptCount: attempt,
    },
  };
}

/**
 * Legacy shape — returns only the parsed value. Used by every existing
 * caller (gemini-flash.ts re-exports this so old imports keep working).
 */
export async function generateContent<T = string>(
  prompt: string,
  options: GeminiOptions = {},
): Promise<T> {
  const { data } = await geminiGenerate<T>(prompt, options);
  return data;
}

// ── HTTP call ──────────────────────────────────────────────────────────

async function callModel(
  model: string,
  prompt: string,
  options: GeminiOptions,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? 2048,
      ...(options.json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (options.systemPrompt) {
    body.systemInstruction = { parts: [{ text: options.systemPrompt }] };
  }

  const res = await fetch(`${ENDPOINT(model)}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    // Surface as recoverable so auto mode escalates to paid
    throw new QuotaError(`Gemini ${model} returned 429 (quota)`);
  }
  if (!res.ok) {
    const txt = (await res.text()).slice(0, 500);
    throw new Error(`Gemini ${model} ${res.status}: ${txt}`);
  }

  const json = (await res.json()) as ProviderResponse;
  if (json.error) {
    if (/quota|rate/i.test(json.error.message)) {
      throw new QuotaError(json.error.message);
    }
    throw new Error(`Gemini ${model}: ${json.error.message}`);
  }
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini ${model}: empty response`);
  return text;
}

class QuotaError extends Error {
  readonly isQuota = true;
}

// ── Mode resolution ────────────────────────────────────────────────────

function resolveMode(): GeminiMode {
  const env = (process.env.GEMINI_MODE ?? 'free').toLowerCase();
  if (env === 'paid' || env === 'auto') return env;
  return 'free';
}

// ── Quota tracking via Upstash Redis ───────────────────────────────────

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

async function checkFreeQuota(): Promise<boolean> {
  const r = getRedis();
  if (!r) return true; // No Redis configured → fail open

  const now = new Date();
  const minuteKey = `gemini:free:rpm:${now.toISOString().slice(0, 16)}`;
  const dayKey = `gemini:free:rpd:${now.toISOString().slice(0, 10)}`;

  try {
    const [minuteCount, dayCount] = await Promise.all([
      r.incr(minuteKey),
      r.incr(dayKey),
    ]);
    // Set TTLs only on first increment (cheap optimisation)
    if (minuteCount === 1) await r.expire(minuteKey, 90);
    if (dayCount === 1) await r.expire(dayKey, 86_400 + 3600);

    if (minuteCount > FREE_RPM || dayCount > FREE_RPD) {
      log.warn(`Free quota: minute=${minuteCount}/${FREE_RPM}, day=${dayCount}/${FREE_RPD}`);
      return false;
    }
    return true;
  } catch (err) {
    // Redis hiccup must not break content generation — fail open
    log.warn(`Quota check failed: ${msg(err)}`);
    return true;
  }
}

// ── Cache (24h SWR) ─────────────────────────────────────────────────────

async function readCache(key: string): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return (await r.get(`gemini:cache:${key}`)) as string | null;
  } catch {
    return null;
  }
}

async function writeCache(key: string, value: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(`gemini:cache:${key}`, value, { ex: CACHE_TTL_SECONDS });
  } catch {
    /* don't fail caller on cache write */
  }
}

// ── Mock fallbacks (last resort) ───────────────────────────────────────

function buildMock(
  hint: GeminiOptions['contentHint'] = 'generic',
  json = false,
): string | unknown[] | Record<string, unknown> {
  if (json) {
    switch (hint) {
      case 'features':
        return ['Core feature', 'Integrations', 'Reporting', 'Team support'];
      case 'faqs':
        return [
          {
            q: 'What is this tool used for?',
            a: 'See the official site for current capabilities.',
          },
        ];
      default:
        return {};
    }
  }
  switch (hint) {
    case 'description':
      return '<p>Detailed description coming soon — check the official site for current capabilities.</p>';
    case 'verdict':
      return 'A capable option in its category. Verify current pricing and features on the official site.';
    case 'conversion_hook':
      return 'Visit the official site';
    default:
      return '';
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
