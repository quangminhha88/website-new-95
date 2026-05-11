/**
 * Review-related TanStack Query hooks.
 *
 * Mirrors the CompatResult/adapt pattern from useTools.ts so call sites
 * follow the same { data, isLoading, error, refetch } shape.
 */
import { useQuery as useTanstackQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ToolReview {
  id: string;
  tool_id: string;
  author_name: string;
  rating: number;
  title?: string | null;
  body: string;
  verified: boolean;
  ai_sentiment?: string | null;
  created_at: string;
}

interface CompatResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

function adapt<T>(q: ReturnType<typeof useTanstackQuery<T>>): CompatResult<T> {
  return {
    data: q.data ?? null,
    isLoading: q.isPending && q.fetchStatus !== 'idle',
    error: q.error as Error | null,
    refetch: q.refetch,
  };
}

/**
 * Fetch the latest 20 approved reviews for a tool.
 * Returns null/empty until the toolId is known.
 */
export function useToolReviews(toolId: string | undefined): CompatResult<ToolReview[]> {
  return adapt(
    useTanstackQuery<ToolReview[]>({
      queryKey: ['reviews', toolId],
      enabled: !!toolId,
      staleTime: 5 * 60 * 1000,
      queryFn: async () => {
        if (!toolId) return [];
        const { data, error } = await supabase
          .from('tool_reviews')
          .select(
            'id, tool_id, author_name, rating, title, body, verified, ai_sentiment, created_at',
          )
          .eq('tool_id', toolId)
          .eq('moderation_status', 'approved')
          .order('created_at', { ascending: false })
          .limit(20);
        if (error) throw error;
        return (data ?? []) as ToolReview[];
      },
    }),
  );
}
