/**
 * Tier-based rate limiting (Upstash Redis sliding window).
 *
 * Tiers
 * ═════
 *   public  — 60 req/min   anonymous browsing endpoints (read-only)
 *   auth    — 30 req/min   logged-in user actions (saves, votes)
 *   admin   — 100 req/min  admin dashboard polling
 *   ai      — 10 req/min   LLM-backed endpoints (recommendations, completions)
 *   strict  — 5 req/min    abuse-prone endpoints (login, password reset)
 *
 * Failure mode
 * ════════════
 *   No Upstash configured → every call returns "allowed". Losing rate
 *   limiting is better than blocking real traffic when Redis is down.
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export type Tier = 'public' | 'auth' | 'admin' | 'ai' | 'strict';

const LIMITS: Record<Tier, { limit: number; windowSec: number }> = {
  public: { limit: 60, windowSec: 60 },
  auth: { limit: 30, windowSec: 60 },
  admin: { limit: 100, windowSec: 60 },
  ai: { limit: 10, windowSec: 60 },
  strict: { limit: 5, windowSec: 60 },
};

let redis: Redis | null = null;
let warned = false;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warned) {
      // eslint-disable-next-line no-console
      console.warn('⚠️ Upstash not configured — rate limiting disabled (failing open)');
      warned = true;
    }
    return null;
  }
  redis = new Redis({ url, token });
  return redis;
}

const limiterCache = new Map<Tier, Ratelimit>();
function getLimiter(tier: Tier): Ratelimit | null {
  const cached = limiterCache.get(tier);
  if (cached) return cached;
  const r = getRedis();
  if (!r) return null;
  const cfg = LIMITS[tier];
  const limiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(cfg.limit, `${cfg.windowSec} s`),
    prefix: `rl:${tier}`,
    analytics: false,
  });
  limiterCache.set(tier, limiter);
  return limiter;
}

// ── Public API ─────────────────────────────────────────────────────────

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
  limit: number;
}

export async function rateLimitByTier(
  tier: Tier,
  identifier: string,
): Promise<RateLimitResult> {
  const limiter = getLimiter(tier);
  if (!limiter) {
    return {
      success: true,
      remaining: LIMITS[tier].limit,
      reset: 0,
      limit: LIMITS[tier].limit,
    };
  }
  const r = await limiter.limit(identifier);
  return {
    success: r.success,
    remaining: r.remaining,
    reset: r.reset,
    limit: LIMITS[tier].limit,
  };
}

/**
 * Vercel handler helper. Returns `true` if BLOCKED (response sent;
 * caller should `return` immediately). Returns `false` to proceed.
 */
export async function enforceRateLimit(
  req: VercelRequest,
  res: VercelResponse,
  tier: Tier,
  identifier?: string,
): Promise<boolean> {
  const id = identifier ?? extractIdentifier(req);
  const result = await rateLimitByTier(tier, id);

  res.setHeader('X-RateLimit-Limit', result.limit);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', Math.floor(result.reset / 1000));

  if (!result.success) {
    const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'rate_limited', retry_after_seconds: retryAfter });
    return true;
  }
  return false;
}

export function extractIdentifier(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0]?.trim() || 'unknown';
  if (Array.isArray(fwd) && fwd[0]) return fwd[0].split(',')[0]?.trim() || 'unknown';
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string') return real;
  return 'unknown';
}

// ── Back-compat — old signature used in api/log-error.ts etc ───────────

/**
 * @deprecated Prefer `rateLimitByTier(tier, id)`.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  const r = getRedis();
  if (!r) return true;
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / windowSec);
  const redisKey = `rl:legacy:${key}:${bucket}`;
  try {
    const count = await r.incr(redisKey);
    if (count === 1) await r.expire(redisKey, windowSec + 5);
    return count <= limit;
  } catch {
    return true;
  }
}

// Convenience wrappers for known callers
export const recommendLimiter = () => getLimiter('ai');
export const aiLimiter = () => getLimiter('ai');
