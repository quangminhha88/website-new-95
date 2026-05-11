/**
 * Generic retry helper with exponential backoff + jitter.
 *
 * Used to wrap any flaky async operation (Supabase calls, fetch, etc.).
 * Default config: 3 attempts, 200ms base, 2s cap, full jitter.
 */
import { createLogger } from './logger';

const log = createLogger('lib:retry');

export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  maxAttempts?: number;
  /** Initial delay in ms. Default 200. */
  baseDelayMs?: number;
  /** Maximum single delay in ms. Default 2000. */
  maxDelayMs?: number;
  /** Determines whether an error is retryable. Default: only network/5xx. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Optional label for logging. */
  label?: string;
}

const DEFAULTS: Required<Omit<RetryOptions, 'shouldRetry' | 'label'>> = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 2000,
};

/**
 * Sleep for `ms` milliseconds.
 */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Compute the delay for `attempt` (1-based) with full jitter.
 * Formula: random(0, min(maxDelay, baseDelay * 2^(attempt-1)))
 */
export function backoffDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exp = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
  return Math.floor(Math.random() * exp);
}

/**
 * Default predicate: retry on network errors and 5xx, never on 4xx.
 */
export function defaultShouldRetry(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  // Network errors
  if (/network|fetch|timeout|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(msg)) return true;
  // Supabase wraps PostgREST errors with .status / .code
  const e = error as { status?: number; code?: string };
  if (typeof e.status === 'number') {
    if (e.status >= 500) return true;
    if (e.status === 429) return true; // rate limit — back off
    return false; // 4xx is the caller's fault
  }
  // Postgres connection errors
  if (e.code === '08000' || e.code === '08006' || e.code === '57P03') return true;
  return false;
}

/**
 * Run `fn` with retry-on-failure.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = { ...DEFAULTS, ...options };
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;
  const label = options.label ?? 'operation';

  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLast = attempt === opts.maxAttempts;

      if (isLast || !shouldRetry(err, attempt)) {
        throw err;
      }

      const delay = backoffDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
      log.warn(`${label} failed (attempt ${attempt}/${opts.maxAttempts}), retrying in ${delay}ms`, {
        error: err instanceof Error ? err.message : String(err),
      });
      await sleep(delay);
    }
  }

  // Unreachable, but TS needs it
  throw lastError;
}
