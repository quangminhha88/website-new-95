/**
 * <SimilarTools /> — recommendation rail powered by pgvector.
 *
 * Two modes:
 *   - mode="byTool"   : pass `toolId`, finds semantically similar tools
 *   - mode="byQuery"  : pass `query`, hits /api/recommend (Gemini embed)
 *
 * Renders a horizontal scroll on mobile, grid on desktop. Empty state
 * gracefully hides itself (returns null) so it never shows broken UI.
 */
import Link from 'next/link';
import { Sparkles, Flame } from 'lucide-react';
import {
  useSemanticRecommendations,
  useSemanticSearch,
  type SemanticMatch,
} from '@/hooks/useSemanticRecommendations';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/Skeleton';
import OptimizedImage from './OptimizedImage';

type Props =
  | {
      mode: 'byTool';
      toolId: string;
      title?: string;
      limit?: number;
      query?: never;
      excludeSlug?: never;
    }
  | {
      mode: 'byQuery';
      query: string;
      excludeSlug?: string;
      title?: string;
      limit?: number;
      toolId?: never;
    };

export default function SimilarTools(props: Props) {
  const isByTool = props.mode === 'byTool';
  const title = props.title ?? (isByTool ? 'Similar tools' : 'You may also like');
  const limit = props.limit ?? 6;

  const byTool = useSemanticRecommendations(isByTool ? props.toolId : undefined, {
    limit,
    enabled: isByTool,
  });
  const byQuery = useSemanticSearch(isByTool ? '' : props.query, {
    limit,
    enabled: !isByTool,
    excludeSlug: !isByTool ? props.excludeSlug : undefined,
  });

  const { data, isLoading, error } = isByTool ? byTool : byQuery;

  // Hide on error or no data — don't show a broken rail
  if (error) return null;
  if (!isLoading && (!data || data.length === 0)) return null;

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-bold">{title}</h2>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: limit }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {data!.map((m) => (
            <RecCard key={m.id} match={m} />
          ))}
        </div>
      )}
    </section>
  );
}

function RecCard({ match }: { match: SemanticMatch }) {
  const isHighConfidence = match.similarity > 0.8;
  const isTopEarner = match.revenue_score > 50;
  return (
    <Link href={`/tools/${match.slug}`} className="group block">
      <Card className="h-full transition-all hover:shadow-md hover:border-primary/30">
        <CardContent className="p-3">
          <OptimizedImage
            src={match.logo_url ?? undefined}
            alt={match.name}
            fallbackText={match.name}
            className="h-10 w-10 rounded-lg mb-2"
          />
          <p className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">
            {match.name}
          </p>
          {match.tagline && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{match.tagline}</p>
          )}
          {(isHighConfidence || isTopEarner) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {isHighConfidence && (
                <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                  {(match.similarity * 100).toFixed(0)}% match
                </Badge>
              )}
              {isTopEarner && (
                <Badge variant="warning" className="text-[10px] py-0 px-1.5 gap-0.5">
                  <Flame className="h-2.5 w-2.5" />
                  Top
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
