/**
 * Smart Finder — real-time search powered by Postgres FTS + EPC ranking.
 *
 * Cost profile:
 *   - Real-time keystroke search → Postgres FTS (free Supabase tier)
 *   - "AI mode" toggle (optional) → /api/recommend (only on submit, never per keystroke)
 *
 * UX:
 *   - 250ms debounce on the input
 *   - Empty state shows top-revenue tools so the page is never blank
 *   - Filter chips for category + price ceiling, applied client-side via the RPC
 *   - Result cards include relevance score, EPC indicator (top earners get a flame)
 *
 * SEO:
 *   - URL search param `?q=` so query is shareable + indexable in social
 *   - All result cards link to canonical /tools/:slug
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Search, Sparkles, Filter, Flame, ChevronRight, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import SEO from '@/components/SEO';
import OptimizedImage from '@/components/OptimizedImage';
import { Skeleton } from '@/components/Skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useSmartSearch, usePopularQueries } from '@/hooks/useSmartSearch';
import { useCategories } from '@/hooks';
import SimilarTools from '@/components/SimilarTools';
import { trackImpression } from '@/analytics/seo-metrics';
import type { SearchResult } from '@/hooks/useSmartSearch';

const PRICE_BUCKETS = [
  { label: 'Free', value: 0 },
  { label: 'Under $20/mo', value: 20 },
  { label: 'Under $50/mo', value: 50 },
  { label: 'Under $100/mo', value: 100 },
];

export default function SmartFinderPage() {
  const router = useRouter();
  const pathname = usePathname() ?? '/finder';
  const searchParams = useSearchParams();
  const initialQuery = searchParams?.get('q') ?? '';

  const [query, setQuery] = useState(initialQuery);
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [maxPrice, setMaxPrice] = useState<number | undefined>();

  const { data: categories } = useCategories(50);
  const popular = usePopularQueries();

  const { data: results, isLoading, isStale, error } = useSmartSearch(query, {
    categoryId,
    maxPrice,
  });

  // Sync query → URL (so users can share / bookmark)
  useEffect(() => {
    const trimmed = query.trim();
    const target = trimmed ? `${pathname}?q=${encodeURIComponent(trimmed)}` : pathname;
    router.replace(target);
  }, [query, router, pathname]);

  // Track an impression once when the page mounts
  useEffect(() => {
    trackImpression({ pagePath: '/finder', pageType: 'other' });
  }, []);

  const hasFilters = !!categoryId || maxPrice !== undefined;
  const hasQuery = query.trim().length > 0;

  function clearFilters() {
    setCategoryId(undefined);
    setMaxPrice(undefined);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title="Smart Finder — find the right SaaS for your stack"
        description="Real-time search across thousands of SaaS tools. Filter by category, pricing, and use case."
        canonical="/finder"
      />

      {/* Hero */}
      <section className="bg-white border-b border-gray-100">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <div className="text-center mb-8">
            <Badge variant="secondary" className="mb-4 inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" />
              Smart Finder
            </Badge>
            <h1 className="text-4xl font-black text-gray-900 sm:text-5xl">
              Find your perfect <span className="text-primary">SaaS stack</span>
            </h1>
            <p className="mt-3 text-gray-600">
              Real-time search across the entire directory. Try natural language —
              "CRM for solo consultants under $50/mo".
            </p>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
            <Input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What kind of tool are you looking for?"
              className="h-14 pl-12 pr-12 text-base shadow-sm"
              aria-label="Search tools"
            />
            {(isLoading || isStale) && hasQuery && (
              <Loader2
                aria-hidden="true"
                className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400"
              />
            )}
            {!isLoading && !isStale && hasQuery && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Popular searches when input empty */}
          {!hasQuery && (
            <div className="mt-6 flex flex-wrap items-center gap-2 justify-center">
              <span className="text-xs font-medium text-gray-500">Try:</span>
              {popular.map((q) => (
                <Button
                  key={q}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full h-8 text-xs"
                  onClick={() => setQuery(q)}
                >
                  {q}
                </Button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Filters */}
      <section className="bg-white border-b border-gray-100">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500">
              <Filter className="h-3 w-3" />
              Filters:
            </span>

            {/* Category filter */}
            <select
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value || undefined)}
              aria-label="Filter by category"
              className="h-8 rounded-md border border-input bg-background px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All categories</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Price chips */}
            {PRICE_BUCKETS.map((bucket) => (
              <Button
                key={bucket.label}
                type="button"
                variant={maxPrice === bucket.value ? 'default' : 'outline'}
                size="sm"
                className="h-8 rounded-full text-xs"
                onClick={() =>
                  setMaxPrice(maxPrice === bucket.value ? undefined : bucket.value)
                }
              >
                {bucket.label}
              </Button>
            ))}

            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 text-xs text-gray-500"
              >
                <X className="h-3 w-3" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="mx-auto max-w-4xl px-4 py-8">
        <ResultsView
          results={results}
          isLoading={isLoading}
          error={error}
          query={query}
          hasFilters={hasFilters}
        />

        {/* "You may also like" — semantic match via /api/recommend.
            Only fires for queries ≥ 3 chars; gracefully hides if no embeddings. */}
        {hasQuery && !isLoading && (
          <SimilarTools mode="byQuery" query={query} title="You may also like" limit={6} />
        )}
      </section>
    </div>
  );
}

interface ResultsViewProps {
  results: SearchResult[] | null;
  isLoading: boolean;
  error: Error | null;
  query: string;
  hasFilters: boolean;
}

function ResultsView({ results, isLoading, error, query, hasFilters }: ResultsViewProps) {
  // ── Error ──
  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-sm font-semibold text-destructive">Search failed</p>
          <p className="mt-1 text-sm text-gray-500">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  // ── Loading (first paint, no previous results) ──
  if (isLoading && !results) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  // ── Empty (after search) ──
  if (results && results.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Search className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-4 font-bold text-gray-900">No tools match "{query}"</p>
          <p className="mt-1 text-sm text-gray-500">
            {hasFilters
              ? 'Try removing some filters, or rephrase your search.'
              : 'Try broader keywords (e.g. "email" instead of "newsletter platform with AI").'}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!results) return null;

  // ── Results header ──
  const headline = query.trim()
    ? `${results.length} ${results.length === 1 ? 'match' : 'matches'} for "${query}"`
    : 'Top-rated tools';

  return (
    <>
      <p className="mb-4 text-sm font-semibold text-gray-900">{headline}</p>

      <AnimatePresence mode="popLayout">
        <div className="space-y-3">
          {results.map((tool, idx) => (
            <ResultCard key={tool.id} tool={tool} index={idx} />
          ))}
        </div>
      </AnimatePresence>
    </>
  );
}

function ResultCard({ tool, index }: { tool: SearchResult; index: number }) {
  // Top earners get a flame badge — visual signal of "people actually convert here"
  const isTopEarner = tool.revenue_score > 50;
  const price = tool.pricing_data?.starting_price;
  const currency = tool.pricing_data?.currency ?? '$';

  // Highest 3 features as quick chips
  const featureChips = useMemo(
    () => (tool.features ?? []).slice(0, 3),
    [tool.features],
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.2) }}
    >
      <Link href={`/tools/${tool.slug}`} className="block group">
        <Card className="transition-all hover:shadow-md hover:border-primary/30">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start gap-4">
              <OptimizedImage
                src={tool.logo_url ?? undefined}
                alt={tool.name}
                fallbackText={tool.name}
                className="h-12 w-12 flex-shrink-0 rounded-lg"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-gray-900 group-hover:text-primary transition-colors">
                    {tool.name}
                  </h3>
                  {isTopEarner && (
                    <Badge variant="warning" className="gap-1">
                      <Flame className="h-3 w-3" />
                      Top earner
                    </Badge>
                  )}
                  {tool.avg_rating && tool.avg_rating >= 4.5 && (
                    <Badge variant="success" className="text-[10px]">
                      ★ {tool.avg_rating.toFixed(1)}
                    </Badge>
                  )}
                </div>

                {tool.tagline && (
                  <p className="mt-1 text-sm text-gray-600 line-clamp-1">{tool.tagline}</p>
                )}

                {featureChips.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {featureChips.map((f) => (
                      <span
                        key={f}
                        className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700"
                      >
                        {f.length > 28 ? `${f.slice(0, 28)}…` : f}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {price !== undefined && (
                  <span className="text-xs font-semibold text-gray-900">
                    {price === 0 ? 'Free' : `${currency}${price}/mo`}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}
