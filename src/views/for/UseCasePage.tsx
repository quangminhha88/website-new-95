import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Layers, Star, ArrowRight } from 'lucide-react';

import SEO from '@/components/SEO';
import Breadcrumbs from '@/components/Breadcrumbs';
import { supabase } from '@/lib/supabase';
import { combineSchemas, breadcrumbSchema, itemListSchema } from '@/seo/schema';
import { absoluteUrl } from '@/seo/config';
import type { Tool } from '@/types/tool';

/**
 * /for/:usecase — programmatic SEO landing page.
 *
 * Strategy: full-text search the tools.search_vector column for the
 * use-case keywords ("content-creators" → "content creators"). Falls
 * back to the top-rated approved tools when fewer than 4 hits, so the
 * page is never empty for low-volume queries.
 *
 * Slug → display:  "content-creators" → "Content Creators"
 */
export default function UseCasePage() {
  const { usecase } = useParams<{ usecase: string }>();
  const slug = usecase ?? '';
  const display = formatUsecase(slug);
  const queryText = slug.replace(/-/g, ' ');
  const year = new Date().getFullYear();

  const { data, isLoading, error } = useQuery({
    queryKey: ['usecase', slug],
    enabled: slug.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      // Primary: full-text search against the FTS column
      const ftsResult = await supabase
        .from('tools')
        .select('id, slug, name, tagline, logo_url, avg_rating, review_count, category_id')
        .eq('moderation_status', 'approved')
        .textSearch('search_vector', queryText, {
          type: 'websearch',
          config: 'english',
        })
        .limit(12);

      let tools = (ftsResult.data ?? []) as Tool[];

      // Fallback: top-rated when FTS returns sparse results
      if (tools.length < 4) {
        const fallback = await supabase
          .from('tools')
          .select('id, slug, name, tagline, logo_url, avg_rating, review_count, category_id')
          .eq('moderation_status', 'approved')
          .order('avg_rating', { ascending: false, nullsFirst: false })
          .limit(12 - tools.length);

        const seen = new Set(tools.map((t) => t.id));
        for (const t of (fallback.data ?? []) as Tool[]) {
          if (!seen.has(t.id)) tools.push(t);
        }
      }

      return tools;
    },
  });

  const tools = data ?? [];

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: `Tools for ${display}`, href: `/for/${slug}`, current: true },
  ];

  const schema = combineSchemas(
    breadcrumbSchema(breadcrumbItems.map((b) => ({ name: b.label, url: b.href }))),
    tools.length > 0
      ? itemListSchema(
          tools.map((t, i) => ({
            name: t.name,
            url: `/tools/${t.slug}`,
            position: i + 1,
          })),
          `Best Tools for ${display}`,
        )
      : null,
  );

  const description = `Hand-picked SaaS tools for ${display.toLowerCase()} in ${year}. Compare features, pricing, and real user ratings — find your fit in minutes.`;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <SEO
        title={`Best Tools for ${display} in ${year}`}
        description={description}
        canonical={`/for/${slug}`}
        ogImage={absoluteUrl(`/api/og/niche?slug=${slug}`)}
        schema={schema}
      />

      <main className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:px-8">
        <Breadcrumbs items={breadcrumbItems} className="mb-6" />

        <header className="mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
            <Layers size={12} />
            Curated for your use case
          </div>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            Best Tools for {display} in {year}
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-gray-600">
            {tools.length > 0
              ? `${tools.length} options ranked by real user ratings and feature fit.`
              : 'Curated picks — pulled from our directory of approved tools.'}
          </p>
        </header>

        {isLoading && <Loader />}
        {error && <ErrorState />}

        {!isLoading && !error && tools.length === 0 && (
          <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600">
            We don't have curated picks for "{display}" yet — try{' '}
            <Link href="/finder" className="font-medium text-indigo-600 hover:underline">
              Smart Finder
            </Link>{' '}
            instead.
          </p>
        )}

        {!isLoading && !error && tools.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────

function ToolCard({ tool }: { tool: Tool }) {
  const initial = (tool.name[0] ?? 'S').toUpperCase();
  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all"
    >
      <div className="flex items-start gap-3">
        {tool.logo_url ? (
          <img
            src={tool.logo_url}
            alt=""
            className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-lg font-bold text-white">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
            {tool.name}
          </h3>
          {tool.tagline && (
            <p className="text-sm text-gray-500 line-clamp-2 mt-0.5">{tool.tagline}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs">
        {tool.avg_rating != null ? (
          <span className="inline-flex items-center gap-1 text-gray-700">
            <Star size={12} className="fill-yellow-500 text-yellow-500" />
            <span className="font-semibold">{tool.avg_rating}</span>
            {tool.review_count ? (
              <span className="text-gray-500">({tool.review_count})</span>
            ) : null}
          </span>
        ) : (
          <span />
        )}
        <span className="inline-flex items-center gap-1 text-indigo-600 font-medium">
          View
          <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

function Loader() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-40 rounded-2xl bg-white border border-gray-200 animate-pulse" />
      ))}
    </div>
  );
}

function ErrorState() {
  return (
    <p className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
      Couldn't load tools right now. Try refreshing in a moment.
    </p>
  );
}

function formatUsecase(slug: string): string {
  if (!slug) return '';
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

// FIXED: New /for/:usecase programmatic SEO page
