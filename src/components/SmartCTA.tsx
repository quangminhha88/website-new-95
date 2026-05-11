/**
 * <SmartCTA /> — a CTA slot that picks the highest-revenue tool to promote,
 * filtered by category/intent, with deterministic rotation per visitor.
 *
 * Usage:
 *   <SmartCTA categoryId={tool.category_id} exclude={[tool.slug]} />
 *   <SmartCTA intentKeywords={['email', 'marketing']} />
 *   <SmartCTA placement="comparison-winner" categoryId="..." />
 */
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowRight, TrendingUp, Sparkles } from 'lucide-react';
import { pickBestCTA, pickCTARail, type CTAQuery, type CTAOption } from '@/seo/cta-engine';
import { getVisitorId } from '@/seo/ab-engine';
import { Skeleton } from './Skeleton';

interface SmartCTAProps extends Omit<CTAQuery, 'visitorId'> {
  /** Visual style — different placements need different framings */
  placement?: 'sidebar' | 'inline' | 'comparison-winner' | 'rail';
  className?: string;
  /** For 'rail' placement: number of items to show */
  railSize?: number;
}

export default function SmartCTA({
  placement = 'sidebar',
  className = '',
  railSize = 4,
  ...query
}: SmartCTAProps) {
  const visitorId = typeof window !== 'undefined' ? getVisitorId() : 'ssr';

  if (placement === 'rail') {
    return <CTARail query={{ ...query, visitorId }} n={railSize} className={className} />;
  }

  return <CTASingle query={{ ...query, visitorId }} placement={placement} className={className} />;
}

function CTASingle({
  query,
  placement,
  className,
}: {
  query: CTAQuery;
  placement: 'sidebar' | 'inline' | 'comparison-winner';
  className: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['cta', 'single', query],
    queryFn: () => pickBestCTA(query),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <Skeleton className={`h-32 ${className}`} />;
  if (!data) return null;

  if (placement === 'comparison-winner') {
    return (
      <div className={`rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 ${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-200 px-3 py-1 text-xs font-bold text-amber-900">
            <TrendingUp className="h-3 w-3" />
            Best Value Pick
          </span>
        </div>
        <h3 className="text-xl font-bold text-gray-900">{data.name}</h3>
        <p className="mt-1 text-sm text-gray-600">
          Highest converter in this category — chosen by our editorial team.
        </p>
        <Link
          href={`/go/${data.slug}?src=cta_winner`}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black transition-colors"
        >
          Try {data.name}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  if (placement === 'inline') {
    return (
      <div className={`my-8 rounded-xl border border-indigo-100 bg-indigo-50/50 p-5 ${className}`}>
        <p className="text-sm text-indigo-900">
          <span className="font-bold">Recommended:</span> {data.name} —{' '}
          <Link
            href={`/go/${data.slug}?src=cta_inline`}
            className="font-semibold underline hover:no-underline"
          >
            try free
          </Link>
        </p>
      </div>
    );
  }

  // sidebar
  return (
    <div className={`rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm ${className}`}>
      <div className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-indigo-600">
        <Sparkles className="h-3 w-3" />
        Top Pick
      </div>
      <h3 className="mt-2 text-lg font-bold text-gray-900">{data.name}</h3>
      <Link
        href={`/go/${data.slug}?src=cta_sidebar`}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
      >
        Try Free
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function CTARail({
  query,
  n,
  className,
}: {
  query: CTAQuery;
  n: number;
  className: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['cta', 'rail', query, n],
    queryFn: () => pickCTARail(query, n),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className={`grid grid-cols-2 gap-3 sm:grid-cols-${n} ${className}`}>
        {Array.from({ length: n }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const items = data ?? [];
  if (items.length === 0) return null;

  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-${Math.min(n, 4)} ${className}`}>
      {items.map((item: CTAOption) => (
        <Link
          key={item.slug}
          href={`/tools/${item.slug}`}
          className="group flex flex-col rounded-xl border border-gray-100 bg-white p-4 hover:border-indigo-200 hover:shadow-md transition-all"
        >
          <p className="font-semibold text-gray-900 truncate group-hover:text-indigo-600">
            {item.name}
          </p>
          <span className="mt-1 text-xs text-gray-500">View details</span>
        </Link>
      ))}
    </div>
  );
}
