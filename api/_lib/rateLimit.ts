/**
 * @deprecated Re-export shim. Import from `src/lib/rateLimit.ts` directly.
 *
 * Existing /api handlers still import from here; the canonical
 * implementation lives at src/lib/rateLimit.ts so it can be reused
 * from non-API contexts (server scripts, edge functions).
 */
export {
  rateLimit,
  rateLimitByTier,
  enforceRateLimit,
  extractIdentifier,
  recommendLimiter,
  aiLimiter,
} from '../../src/lib/rateLimit';
export type { Tier, RateLimitResult } from '../../src/lib/rateLimit';
