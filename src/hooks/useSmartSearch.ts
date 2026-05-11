/**
 * Smart Finder hooks.
 *
 * useSmartSearch — debounced real-time search via the `search_tools_fts` RPC.
 *   - Empty query → returns top-revenue tools (so the page never shows blank)
 *   - Non-empty query → FTS + EPC-aware ranking, server-side
 *   - Filters: categoryId, maxPrice
 *   - 250ms debounce keeps DB load light while typing
 *
 * The RPC does the EPC join on the server, so the client makes ONE round
 * trip per search regardless of result count.
 */
import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';

const log = createLogger('hook:smart-search');

export interface SearchResult {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  logo_url: string | null;
  category_id: string | null;
  pricing_data: { starting_price?: number; currency?: string } | null;
  features: string[] | null;
  avg_rating: number | null;
  relevance: number;
  revenue_score: number;
  final_score: number;
}

export interface SearchFilters {
  categoryId?: string;
  maxPrice?: number;
}

/** Generic debounced value — used to throttle the RPC call. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function useSmartSearch(
  query: string,
  filters: SearchFilters = {},
  options: { limit?: number; debounceMs?: number; enabled?: boolean } = {},
) {
  const { limit = 20, debounceMs = 250, enabled = true } = options;
  const debouncedQuery = useDebouncedValue(query.trim(), debounceMs);

  const result = useQuery<SearchResult[]>({
    queryKey: ['smart-search', debouncedQuery, filters.categoryId, filters.maxPrice, limit],
    enabled,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData, // smooth UX while typing — keep previous results visible
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_tools_fts', {
        query_text: debouncedQuery,
        category_filter: filters.categoryId ?? null,
        max_price: filters.maxPrice ?? null,
        match_count: limit,
      });
      if (error) {
        log.warn('Search RPC failed', error.message);
        throw error;
      }
      return (data ?? []) as SearchResult[];
    },
  });

  return {
    data: result.data ?? null,
    isLoading: result.isPending && result.fetchStatus !== 'idle',
    isFetching: result.isFetching,
    error: result.error as Error | null,
    refetch: result.refetch,
    /** True while the debouncer is waiting — useful to show a subtle indicator */
    isStale: query.trim() !== debouncedQuery,
  };
}

/**
 * Curated "what people are searching" hints. Static fallback for now;
 * once you have search_history at scale you can replace with a Supabase
 * `popular_searches` materialised view query.
 */
export function usePopularQueries(): string[] {
  return [
    'CRM for solo consultants',
    'free email marketing',
    'project management for agencies',
    'invoicing under $20/mo',
    'AI writing assistant',
    'analytics for SaaS',
  ];
}
