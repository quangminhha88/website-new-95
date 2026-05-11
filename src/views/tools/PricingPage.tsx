import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Check, Calendar, ExternalLink } from 'lucide-react';

import { useTool, useCategoryById } from '@/hooks';
import SEO from '@/components/SEO';
import Breadcrumbs from '@/components/Breadcrumbs';
import AffiliateCTA from '@/components/AffiliateCTA';
import { combineSchemas, breadcrumbSchema, softwareApplicationSchema } from '@/seo/schema';

/**
 * /tools/:slug/pricing — dedicated SEO landing page for "X pricing" intent.
 *
 * Renders a structured pricing table when tool.pricing_data.plans exists,
 * otherwise falls back to pricing_summary + pricing_model + a deep link
 * to the affiliate redirect.
 */
export default function PricingPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: tool, isLoading, error } = useTool(slug);
  const { data: category } = useCategoryById(tool?.category_id);

  if (isLoading) return <LoadingSpinner />;
  if (error || !tool)
    return <ErrorState message="The tool you're looking for doesn't exist or was removed." />;

  const year = new Date().getFullYear();
  const plans = tool.pricing_data?.plans ?? [];
  const hasPlans = plans.length > 0;
  const lastUpdated = tool.updated_at
    ? new Date(tool.updated_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const description =
    tool.pricing_summary ??
    `${tool.name} pricing for ${year}. Compare ${tool.name} plans, features, and free trial availability. Find the best plan for your team.`;

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    ...(category ? [{ label: category.name, href: `/category/${category.slug}` }] : []),
    { label: tool.name, href: `/tools/${tool.slug}` },
    { label: 'Pricing', href: `/tools/${tool.slug}/pricing`, current: true },
  ];

  const schema = combineSchemas(
    softwareApplicationSchema({ tool, categoryName: category?.name }),
    breadcrumbSchema(breadcrumbItems.map((b) => ({ name: b.label, url: b.href }))),
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <SEO
        title={`${tool.name} Pricing ${year} – Plans, Cost & Free Trial`}
        description={description}
        canonical={`/tools/${tool.slug}/pricing`}
        schema={schema}
      />

      <main className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 lg:px-8">
        <Breadcrumbs items={breadcrumbItems} className="mb-6" />

        <header className="mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            {tool.name} Pricing Plans {year}
          </h1>
          {tool.tagline && <p className="mt-3 text-lg text-gray-600">{tool.tagline}</p>}
          {lastUpdated && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-gray-500">
              <Calendar size={14} />
              Last updated: {lastUpdated}
            </p>
          )}
        </header>

        {hasPlans ? (
          <PlansTable
            plans={plans}
            currency={tool.pricing_data?.currency ?? '$'}
            toolName={tool.name}
          />
        ) : (
          <FallbackPricing
            slug={tool.slug}
            name={tool.name}
            summary={tool.pricing_summary}
            pricingModel={tool.pricing_model}
            currency={tool.pricing_data?.currency}
            startingPrice={tool.pricing_data?.starting_price}
          />
        )}

        {/* Featured CTA */}
        <div className="mt-12 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-6 text-center sm:p-8">
          <h2 className="text-xl font-bold text-gray-900">Ready to try {tool.name}?</h2>
          <p className="mt-2 text-sm text-gray-600">
            Get the best price by going through our verified affiliate link.
          </p>
          <div className="mt-5 inline-block">
            <AffiliateCTA
              slug={tool.slug}
              name={tool.name}
              variant="featured"
              ctaText={`Get ${tool.name} – Best Price`}
            />
          </div>
        </div>

        {/* Back to tool page */}
        <p className="mt-8 text-center text-sm">
          <Link
            href={`/tools/${tool.slug}`}
            className="font-medium text-blue-600 hover:underline"
          >
            ← Back to {tool.name} review
          </Link>
        </p>
      </main>
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────

interface PlansTableProps {
  plans: Array<{ name: string; price: string; features: string[] }>;
  currency: string;
  toolName: string;
}

function PlansTable({ plans, currency, toolName }: PlansTableProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan) => {
        const priceDisplay = /^\d/.test(plan.price.trim())
          ? `${currency}${plan.price}`
          : plan.price;
        return (
          <div
            key={plan.name}
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col"
          >
            <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
            <p className="mt-2 text-3xl font-extrabold text-gray-900">{priceDisplay}</p>
            <ul className="mt-5 space-y-2 flex-1">
              {plan.features.map((feature, i) => (
                <li key={i} className="flex items-start text-sm text-gray-700">
                  <Check className="mr-2 h-4 w-4 flex-shrink-0 text-green-500 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <div className="md:col-span-2 lg:col-span-3 rounded-2xl border border-dashed border-gray-300 bg-white/40 p-4 text-center text-xs text-gray-500">
        Prices listed are sourced from {toolName}'s public pricing page and may
        change. We refresh this page periodically — see "Last updated" above.
      </div>
    </div>
  );
}

interface FallbackProps {
  slug: string;
  name: string;
  summary?: string;
  pricingModel: string;
  currency?: string;
  startingPrice?: string;
}

function FallbackPricing({
  slug,
  name,
  summary,
  pricingModel,
  currency,
  startingPrice,
}: FallbackProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-gray-500">Pricing model</dt>
          <dd className="mt-1 text-lg font-semibold text-gray-900 capitalize">
            {pricingModel}
          </dd>
        </div>
        {startingPrice && (
          <div>
            <dt className="text-sm font-medium text-gray-500">Starts at</dt>
            <dd className="mt-1 text-lg font-semibold text-gray-900">
              {currency ?? '$'}
              {startingPrice}
              <span className="text-sm font-normal text-gray-500"> /mo</span>
            </dd>
          </div>
        )}
      </dl>

      {summary && (
        <div className="mt-6 border-t border-gray-100 pt-6">
          <p className="text-sm leading-relaxed text-gray-700">{summary}</p>
        </div>
      )}

      <Link
        href={`/go/${slug}`}
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
      >
        Check latest {name} pricing
        <ExternalLink size={14} />
      </Link>
    </div>
  );
}

// ── Loading + error states (mirrors ToolPage.tsx pattern) ───────────

function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent shadow-sm" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
      <h2 className="text-2xl font-bold text-gray-900">Tool Not Found</h2>
      <p className="mt-2 text-gray-600">{message}</p>
      <Link href="/" className="mt-6 font-medium text-blue-600 hover:underline">
        ← Back to Directory
      </Link>
    </div>
  );
}

// FIXED: New PricingPage at /tools/:slug/pricing
