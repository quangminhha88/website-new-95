/**
 * <PersonalizedSection /> — homepage rail of recommendations based on
 * the user's recent search/click history.
 *
 * Anonymous users get the top revenue tools (same as SmartCTA rail).
 * Authenticated users get tools matching the categories they've recently
 * clicked on, blended with the high-EPC list.
 */
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { Skeleton } from './Skeleton';
import OptimizedImage from './OptimizedImage';

interface RecommendedTool {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
}

async function fetchPersonalized(userId: string | undefined): Promise<RecommendedTool[]> {
  // Anonymous: top revenue
  if (!userId) {
    const { data } = await supabase
      .from('tool_revenue_score')
      .select('id, slug, name, tagline, logo_url')
      .order('revenue_score', { ascending: false })
      .limit(8);
    return (data ?? []) as RecommendedTool[];
  }

  // Authenticated: blend recent search categories + high-revenue
  const { data: recent } = await supabase
    .from('user_search_history')
    .select('clicked_slugs')
    .eq('user_id', userId)
    .order('searched_at', { ascending: false })
    .limit(20);

  const recentSlugs = (recent ?? [])
    .flatMap((r: any) => r.clicked_slugs ?? [])
    .filter(Boolean);

  if (recentSlugs.length > 0) {
    // Find category IDs of clicked tools, then top-revenue in those categories
    const { data: clickedTools } = await supabase
      .from('tools')
      .select('category_id')
      .in('slug', recentSlugs.slice(0, 10));

    const categoryIds = Array.from(
      new Set((clickedTools ?? []).map((t: any) => t.category_id).filter(Boolean)),
    );

    if (categoryIds.length > 0) {
      const { data } = await supabase
        .from('tools')
        .select('id, slug, name, tagline, logo_url, category_id, commission_estimate')
        .eq('moderation_status', 'approved')
        .in('category_id', categoryIds)
        .not('slug', 'in', `(${recentSlugs.map((s: string) => `"${s}"`).join(',')})`)
        .order('commission_estimate', { ascending: false, nullsFirst: false })
        .limit(8);
      if (data && data.length >= 4) return data as RecommendedTool[];
    }
  }

  // Fallback to top-revenue
  const { data: fallback } = await supabase
    .from('tool_revenue_score')
    .select('id, slug, name, tagline, logo_url')
    .order('revenue_score', { ascending: false })
    .limit(8);
  return (fallback ?? []) as RecommendedTool[];
}

export default function PersonalizedSection() {
  const userId = useAuthStore((s) => s.user?.id);
  const { data, isLoading } = useQuery<RecommendedTool[]>({
    queryKey: ['recommendations', 'personalized', userId ?? 'anon'],
    queryFn: () => fetchPersonalized(userId),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <section className="py-16 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold uppercase text-indigo-700 mb-2">
            <Sparkles className="h-3 w-3" />
            {userId ? 'Recommended for you' : 'Trending now'}
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            {userId ? 'Picks based on your activity' : "Today's top tools"}
          </h2>
        </div>
        <Link
          href="/finder"
          className="hidden sm:inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:underline"
        >
          See more <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(data ?? []).map((tool) => (
            <Link
              key={tool.id}
              href={`/tools/${tool.slug}`}
              className="group flex flex-col rounded-xl border border-gray-100 bg-white p-4 hover:shadow-md hover:border-indigo-200 transition-all"
            >
              <OptimizedImage
                src={tool.logo_url ?? undefined}
                alt={tool.name}
                fallbackText={tool.name}
                className="h-10 w-10 rounded-lg mb-3"
              />
              <p className="font-semibold text-gray-900 truncate group-hover:text-indigo-600">
                {tool.name}
              </p>
              <p className="text-xs text-gray-500 line-clamp-2 mt-1">{tool.tagline}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
