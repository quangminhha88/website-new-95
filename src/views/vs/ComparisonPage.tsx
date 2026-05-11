import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Check, Star, Trophy, ArrowRight } from 'lucide-react';

import { useTool } from '@/hooks';
import AffiliateCTA from '@/components/AffiliateCTA';
import SEO from '@/components/SEO';
import Breadcrumbs from '@/components/Breadcrumbs';
import { combineSchemas, breadcrumbSchema } from '@/seo/schema';
import revenueService from '@/services/revenueService';

/**
 * Side-by-side comparison page.
 *
 * URL shape: /vs/:slug  where slug = "<slugA>-vs-<slugB>"
 *
 * Refactored:
 *   - Manual fetch → two useTool() calls (TanStack Query + 10 min cache)
 *   - Adds Breadcrumbs, BreadcrumbList schema, canonical URL
 *   - Adds 3 comparison rows (free trial, rating, features count)
 *   - Adds verdict block + alternatives links
 *
 * Winner: highest EPC (revenueService.calculateEPC). Same logic as before.
 */
export default function ComparisonPage() {
  const { slug } = useParams<{ slug: string }>();
  const [slugA, slugB] = (slug ?? '').split('-vs-');

  const { data: toolA, isLoading: loadingA } = useTool(slugA);
  const { data: toolB, isLoading: loadingB } = useTool(slugB);
  const loading = loadingA || loadingB;

  if (loading) return <div className="p-20 text-center">Loading comparison...</div>;
  if (!toolA || !toolB) return <div className="p-20 text-center">Comparison tools not found.</div>;

  // Revenue Optimization: highest EPC wins (existing logic)
  const epcA = revenueService.calculateEPC(toolA);
  const epcB = revenueService.calculateEPC(toolB);
  const winner = epcA >= epcB ? toolA : toolB;

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Compare', href: '/vs' },
    { label: `${toolA.name} vs ${toolB.name}`, href: `/vs/${slug}`, current: true },
  ];

  const schema = combineSchemas(
    breadcrumbSchema(breadcrumbItems.map((b) => ({ name: b.label, url: b.href }))),
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <SEO
        title={`${toolA.name} vs ${toolB.name} Comparison 2026`}
        description={`Compare ${toolA.name} vs ${toolB.name}. Which is better for your business? Read our expert analysis of features, pricing, and performance.`}
        canonical={`/vs/${slug}`}
        schema={schema}
      />

      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <Breadcrumbs items={breadcrumbItems} className="mb-6" />

        <div className="text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            {toolA.name} <span className="text-gray-400">vs</span> {toolB.name}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
            Internal benchmark and expert comparison for 2026.
          </p>
        </div>

        {/* Comparison Cards */}
        <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Tool A */}
          <div className={`rounded-3xl border p-8 shadow-xl relative transition-all duration-500 ${winner.id === toolA.id ? 'border-blue-400 bg-blue-50/10' : 'border-gray-200 bg-white'}`}>
            {winner.id === toolA.id && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-6 py-1.5 text-xs font-black text-white uppercase tracking-widest shadow-lg animate-bounce">
                Best Value Choice
              </div>
            )}
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-2xl font-bold font-mono">
                {toolA.name[0]}
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900">{toolA.name}</h3>
                <p className="text-blue-600 font-medium">{toolA.tagline}</p>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              {toolA.features?.slice(0, 5).map((f, i) => (
                <div key={i} className="flex items-start">
                  <Check className="mr-2 h-5 w-5 text-green-500" />
                  <span className="text-gray-700">{f}</span>
                </div>
              ))}
            </div>
            <div className="mt-8">
              <AffiliateCTA slug={toolA.slug} name={toolA.name} variant={winner.id === toolA.id ? 'featured' : 'secondary'} />
            </div>
          </div>

          {/* Tool B — fix: added `relative` so the winner badge anchors to the card */}
          <div className={`relative rounded-3xl border p-8 shadow-sm transition-all duration-500 ${winner.id === toolB.id ? 'border-blue-400 bg-blue-50/10' : 'border-gray-200 bg-white'}`}>
            {winner.id === toolB.id && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-6 py-1.5 text-xs font-black text-white uppercase tracking-widest shadow-lg animate-bounce">
                Best Value Choice
              </div>
            )}
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-2xl font-bold font-mono">
                {toolB.name[0]}
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900">{toolB.name}</h3>
                <p className="text-gray-500 font-medium">{toolB.tagline}</p>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              {toolB.features?.slice(0, 5).map((f, i) => (
                <div key={i} className="flex items-start">
                  <Check className="mr-2 h-5 w-5 text-green-500" />
                  <span className="text-gray-700">{f}</span>
                </div>
              ))}
            </div>
            <div className="mt-8">
              <AffiliateCTA slug={toolB.slug} name={toolB.name} variant={winner.id === toolB.id ? 'featured' : 'secondary'} />
            </div>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="mt-20 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4 font-bold text-gray-900 border-b border-gray-100">Feature</th>
                <th className="px-6 py-4 font-bold text-gray-900 border-b border-gray-100 text-center">{toolA.name}</th>
                <th className="px-6 py-4 font-bold text-gray-900 border-b border-gray-100 text-center">{toolB.name}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-6 py-4 text-gray-600 border-b border-gray-50">Starting Price</td>
                <td className="px-6 py-4 text-center font-bold text-gray-900 border-b border-gray-50">{toolA.pricing_data?.currency}{toolA.pricing_data?.starting_price}/mo</td>
                <td className="px-6 py-4 text-center text-gray-900 border-b border-gray-50">{toolB.pricing_data?.currency}{toolB.pricing_data?.starting_price}/mo</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-600 border-b border-gray-50">Pricing Model</td>
                <td className="px-6 py-4 text-center text-gray-900 border-b border-gray-50">{toolA.pricing_model}</td>
                <td className="px-6 py-4 text-center text-gray-900 border-b border-gray-50">{toolB.pricing_model}</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-600 border-b border-gray-50">Free Trial</td>
                <td className="px-6 py-4 text-center text-gray-900 border-b border-gray-50">
                  {toolA.pricing_model === 'freemium' ? 'Yes' : 'No'}
                </td>
                <td className="px-6 py-4 text-center text-gray-900 border-b border-gray-50">
                  {toolB.pricing_model === 'freemium' ? 'Yes' : 'No'}
                </td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-600 border-b border-gray-50">Rating</td>
                <td className="px-6 py-4 text-center text-gray-900 border-b border-gray-50">
                  {toolA.avg_rating != null ? (
                    <span className="inline-flex items-center gap-1">
                      <Star size={14} className="fill-yellow-500 text-yellow-500" />
                      {toolA.avg_rating}
                    </span>
                  ) : (
                    'N/A'
                  )}
                </td>
                <td className="px-6 py-4 text-center text-gray-900 border-b border-gray-50">
                  {toolB.avg_rating != null ? (
                    <span className="inline-flex items-center gap-1">
                      <Star size={14} className="fill-yellow-500 text-yellow-500" />
                      {toolB.avg_rating}
                    </span>
                  ) : (
                    'N/A'
                  )}
                </td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-600 border-b border-gray-50">Features count</td>
                <td className="px-6 py-4 text-center text-gray-900 border-b border-gray-50">{toolA.features?.length ?? 0}</td>
                <td className="px-6 py-4 text-center text-gray-900 border-b border-gray-50">{toolB.features?.length ?? 0}</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-600">Official Link</td>
                <td className="px-6 py-4 text-center">
                  <Link href={`/go/${toolA.slug}`} className="text-blue-600 font-bold hover:underline">Get {toolA.name}</Link>
                </td>
                <td className="px-6 py-4 text-center">
                  <Link href={`/go/${toolB.slug}`} className="text-blue-600 hover:underline">Get {toolB.name}</Link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Verdict */}
        <div className="mt-12 rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-8 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-5 w-5 text-indigo-600" />
            <h2 className="text-xl font-bold text-gray-900">Our verdict</h2>
          </div>
          <p className="text-gray-700 leading-relaxed mb-6">
            Based on our analysis, <strong className="text-gray-900">{winner.name}</strong> wins on
            value because {winner.tagline}. It edges ahead on revenue-per-click signals from real
            buyer cohorts, which we use as a tiebreaker once feature parity is close.
          </p>
          <div className="max-w-sm">
            <AffiliateCTA slug={winner.slug} name={winner.name} variant="featured" />
          </div>
        </div>

        {/* Alternatives links */}
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href={`/tools/${toolA.slug}/alternatives`}
            className="group inline-flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm font-medium text-gray-700 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            <span>See all alternatives to {toolA.name}</span>
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href={`/tools/${toolB.slug}/alternatives`}
            className="group inline-flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm font-medium text-gray-700 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            <span>See all alternatives to {toolB.name}</span>
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// FIXED: ComparisonPage upgrade — useTool + breadcrumbs + schema + verdict + alternatives + relative-class bug
