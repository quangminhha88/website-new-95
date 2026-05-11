/**
 * Compat wrappers around TanStack Query.
 *
 * These exist for two audiences:
 *
 *   1. Code that previously used the custom `useQuery(key, fetcher, { ttl })`
 *      API can keep working with the same call shape — just import from
 *      this file instead of the deleted custom hook.
 *
 *   2. Ad-hoc queries that don't justify a domain hook in `useTools.ts`
 *      can use this without importing TanStack directly.
 *
 * Returns the legacy `{ data, isLoading, error, refetch }` shape so call
 * sites don't need to change. If you need the full TanStack feature set
 * (placeholders, optimistic updates, infinite queries, etc.), import
 * `useQuery` from `@tanstack/react-query` directly.
 *
 * Caching defaults match the SaaS-directory profile defined in
 * `src/lib/queryClient.ts`: 5min stale, 10min gc, 1 retry, no focus refetch.
 */
import {
  useQuery as useTanstackQuery,
  useMutation as useTanstackMutation,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query';

// ── Query types ─────────────────────────────────────────────────────────

export interface QueryOptions {
  /** Cache key — array form is preferred for partial invalidation. String is auto-wrapped. */
  enabled?: boolean;
  /** Time in MILLISECONDS that data is considered fresh. Default 5 min. */
  staleTime?: number;
  /** Time in MILLISECONDS before unused cache is garbage-collected. Default 10 min. */
  gcTime?: number;
  /** Retry count on failure. Default 1. */
  retry?: number | boolean;
  /** Legacy alias for `staleTime` — accepts SECONDS for back-compat with old API. */
  ttl?: number;
}

export interface QueryResult<T> {
  data: T | null;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

/**
 * Drop-in replacement for the old custom useQuery.
 *
 * @example  // Same call shape as before
 *   const { data, isLoading } = useQuery(
 *     ['featured-tools'],
 *     () => supabase.from('tools').select('*').limit(8),
 *   );
 *
 * @example  // With ttl in seconds (legacy API)
 *   useQuery(['key'], fetcher, { ttl: 600 });   // 10 min stale
 *
 * @example  // With staleTime in milliseconds (new API)
 *   useQuery(['key'], fetcher, { staleTime: 600_000 });
 */
export function useQuery<T>(
  key: QueryKey | string,
  fetcher: () => Promise<T>,
  options: QueryOptions = {},
): QueryResult<T> {
  // Normalise key — string → single-element array
  const queryKey: QueryKey = Array.isArray(key) ? key : [key];

  // ttl (legacy, seconds) → staleTime (TanStack, ms). staleTime takes precedence.
  const staleTime =
    options.staleTime ?? (options.ttl !== undefined ? options.ttl * 1000 : undefined);

  const q = useTanstackQuery<T>({
    queryKey,
    queryFn: fetcher,
    enabled: options.enabled,
    staleTime,
    gcTime: options.gcTime,
    retry: options.retry,
  });

  return {
    data: q.data ?? null,
    isLoading: q.isPending && q.fetchStatus !== 'idle',
    isFetching: q.isFetching,
    error: q.error as Error | null,
    refetch: q.refetch,
  };
}

// ── Mutation wrapper ────────────────────────────────────────────────────

/**
 * Same as TanStack's `useMutation` but re-exported here so callers don't
 * have to import from two different places. Use this for any state-changing
 * server interaction (POST/PUT/DELETE).
 */
export function useMutation<TData, TVariables, TError = Error>(
  options: UseMutationOptions<TData, TError, TVariables>,
): UseMutationResult<TData, TError, TVariables> {
  return useTanstackMutation(options);
}
