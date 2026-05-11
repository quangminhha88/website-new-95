/**
 * Semantic recommendation hooks built on TanStack Query.
 *
 *   useSemanticRecommendations(toolId)   — "similar tools" — uses the tool's
 *                                          stored embedding, ZERO Gemini cost
 *
 *   useSemanticSearch(query)             — "you may also like" — calls
 *                                          /api/recommend (one Gemini embed
 *                                          per query, then cached 5min)
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface SemanticMatch {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  category_id: string | null;
  similarity: number;
  text_rank: number;
  revenue_score: number;
  final_score: number;
}

interface UseSemanticOptions {
  limit?: number;
  threshold?: number;
  enabled?: boolean;
}

/**
 * "Similar tools" for a given tool. Reads the source tool's embedding,
 * then runs match_tools_semantic. No external API calls — purely DB.
 */
export function useSemanticRecommendations(
  toolId: string | undefined,
  options: UseSemanticOptions = {},
) {
  const { limit = 6, threshold = 0.5, enabled = true } = options;

  return useQuery<SemanticMatch[]>({
    queryKey: ['semantic-recs', toolId, limit, threshold],
    enabled: enabled && !!toolId,
    staleTime: 30 * 60 * 1000, // 30 min — tool similarity is very stable
    queryFn: async () => {
      if (!toolId) return [];

      // Read this tool's embedding
      const { data: source, error: srcErr } = await supabase
        .from('tools')
        .select('embedding')
        .eq('id', toolId)
        .single();
      if (srcErr) throw srcErr;
      const embedding = (source as { embedding: number[] | null })?.embedding;
      if (!embedding) return []; // not embedded yet → graceful empty state

      const { data, error } = await supabase.rpc('match_tools_semantic', {
        query_embedding: embedding,
        query_text: null,
        match_threshold: threshold,
        match_count: limit,
        exclude_id: toolId,
      });
      if (error) throw error;
      return (data ?? []) as SemanticMatch[];
    },
  });
}

/**
 * "You may also like" for a free-text query (e.g. SmartFinder).
 * Hits /api/recommend which does the Gemini embed server-side.
 */
export function useSemanticSearch(query: string, options: UseSemanticOptions & { excludeSlug?: string } = {}) {
  const { limit = 8, enabled = true, excludeSlug } = options;
  const trimmed = query.trim();

  return useQuery<SemanticMatch[]>({
    queryKey: ['semantic-search', trimmed, limit, excludeSlug],
    enabled: enabled && trimmed.length >= 3,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed, limit, excludeSlug }),
      });
      if (!res.ok) throw new Error(`Recommendation API failed: ${res.status}`);
      const json = (await res.json()) as { results: SemanticMatch[] };
      return json.results ?? [];
    },
  });
}
