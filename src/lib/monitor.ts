/**
 * Monitoring utility for client-side API calls.
 * Detects errors, latency issues, and empty responses.
 */

export interface MonitorResult<T> {
  data: T | null;
  error: string | null;
  meta: {
    duration: number;
    status: number;
    isLatent: boolean;
    isEmpty: boolean;
  };
}

const LATENCY_THRESHOLD_MS = 2000;

export async function monitoredFetch<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<MonitorResult<T>> {
  const start = Date.now();
  let status = 0;

  try {
    const response = await fetch(input, init);
    status = response.status;
    const duration = Date.now() - start;
    const isLatent = duration > LATENCY_THRESHOLD_MS;

    if (isLatent) {
      console.warn(`[Monitor] Slow API call (${duration}ms):`, input);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error');
      return {
        data: null,
        error: `HTTP ${status}: ${text}`,
        meta: { duration, status, isLatent, isEmpty: true },
      };
    }

    let data: T | null = null;
    const text = await response.text();
    const isEmpty = !text || text.trim() === '';

    if (!isEmpty) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        return {
          data: null,
          error: 'Failed to parse API response as JSON',
          meta: { duration, status, isLatent, isEmpty: false },
        };
      }
    }

    return { data, error: null, meta: { duration, status, isLatent, isEmpty } };
  } catch (err) {
    const duration = Date.now() - start;
    const message = err instanceof Error ? err.message : 'Network error';
    return {
      data: null,
      error: message,
      meta: { duration, status, isLatent: false, isEmpty: true },
    };
  }
}
