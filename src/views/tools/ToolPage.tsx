import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion } from 'motion/react';
import {
  Check,
  ExternalLink,
  ArrowLeft,
  Shield,
  Zap,
  Globe,
  ArrowRight,
  Star,
} from 'lucide-react';
import SEO from '@/components/SEO';
import Breadcrumbs from '@/components/Breadcrumbs';
import AffiliateCTA from '@/components/AffiliateCTA';
import { useDynamicCTA } from '@/hooks/useDynamicCTA';
import AuthorBlock from '@/components/AuthorBlock';
import { sanitizeHTML } from '@/utils/sanitize';
import { useTool, useCategoryById, useRelatedTools } from '@/hooks';
import SimilarTools from '@/components/SimilarTools';
import ReviewSection from '@/components/ReviewSection';
import { useTrackPage } from '@/hooks/useTrackPage';
import { toolPageSchema } from '@/seo/schema';
import { isToolIndexable } from '@/seo/indexability';
import { extractFAQs } from '@/seo/faq-utils';

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

export default function ToolPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: tool, isLoading: toolLoading, error: toolError } = useTool(slug);
  const { data: category } = useCategoryById(tool?.category_id);
  const { data: relatedTools } = useRelatedTools(tool?.category_id, tool?.id);
  const { data: dynamicCta } = useDynamicCTA(tool?.slug);

  // Fire impression + dwell tracking once the tool data is loaded
  useTrackPage({
    pageType: 'tool',
    resourceSlug: tool?.slug,
    enabled: !!tool,
  });

  if (toolLoading) return <LoadingSpinner />;
  if (toolError || !tool) {
    return <ErrorState message="The tool you're looking for doesn't exist or was removed." />;
  }

  const pricingDisplay = `${tool.pricing_data?.currency ?? '$'}${tool.pricing_data?.starting_price ?? '0'}/mo`;
  const indexability = isToolIndexable(tool);
  const breadcrumbs = [
    { name: 'Directory', url: '/' },
    { name: category?.name ?? 'Category', url: `/category/${category?.slug ?? ''}` },
    { name: tool.name, url: `/tools/${tool.slug}` },
  ];
  const faqs = extractFAQs(tool.faqs_html);
  const schema = toolPageSchema({
    tool,
    category: category ?? undefined,
    faqs,
    breadcrumbs,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title={`${tool.name} Review & Pricing 2026`}
        description={`Expert ${tool.name} review: features, pricing from ${pricingDisplay}, pros, cons & alternatives. Category: ${category?.name ?? 'SaaS'}.`}
        canonical={`/tools/${tool.slug}`}
        ogType="product"
        ogImage={tool.logo_url}
        schema={schema}
        indexability={indexability}
      />

      <nav className="sticky top-0 z-20 border-b border-gray-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            SaaS Directory
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Breadcrumbs
          items={breadcrumbs.map((b, i) => ({
            label: b.name,
            href: b.url,
            current: i === breadcrumbs.length - 1,
          }))}
        />

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              {/* Header */}
              <div className="flex items-start gap-6 sm:items-center">
                {tool.logo_url ? (
                  <img
                    src={tool.logo_url}
                    alt={`${tool.name} logo`}
                    className="h-20 w-20 flex-shrink-0 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm"
                    referrerPolicy="no-referrer"
                    loading="eager"
                  />
                ) : (
                  <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-3xl font-bold text-white shadow-xl">
                    {tool.name[0]}
                  </div>
                )}
                <div>
                  {tool.review_count && tool.review_count > 0 ? (
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex text-yellow-400">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${i < Math.floor(tool.avg_rating ?? 0) ? 'fill-current' : ''}`}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-bold text-gray-900">{tool.avg_rating}/5</span>
                      <span className="text-xs text-gray-500">({tool.review_count} reviews)</span>
                    </div>
                  ) : (
                    <span className="inline-block text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full mb-1">
                      New – Be the first to review
                    </span>
                  )}
                  <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                    {tool.name}
                  </h1>
                  {tool.tagline && (
                    <p className="text-lg font-medium text-blue-600 sm:text-xl">{tool.tagline}</p>
                  )}
                </div>
              </div>

              {/* E-E-A-T author block */}
              <div className="mt-6">
                <AuthorBlock />
              </div>

              {/* Mobile CTA */}
              <div className="mt-8 lg:hidden">
                <a
                  href={`/go/${tool.slug}`}
                  className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-4 text-lg font-bold text-white shadow-lg active:scale-95"
                >
                  Get Started with {tool.name}
                  <ExternalLink className="ml-2 h-5 w-5" />
                </a>
                <p className="mt-3 text-center text-sm font-medium text-gray-500">
                  Pricing starts at {pricingDisplay}
                </p>
              </div>

              {/* About */}
              <div className="mt-12">
                <h2 className="text-2xl font-bold text-gray-900">
                  {tool.name} Review &amp; Core Features
                </h2>
                <div className="mt-4 prose prose-blue prose-lg max-w-none text-gray-600">
                  <p className="leading-relaxed">{tool.full_description ?? tool.description}</p>
                </div>
              </div>

              {/* Expert Verdict */}
              <div className="mt-10 rounded-2xl bg-indigo-50 border border-indigo-100 p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-indigo-600 p-2 rounded-lg text-white">
                    <Star className="h-5 w-5 fill-current" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Expert Verdict</h2>
                </div>
                <p className="text-gray-700 font-medium italic leading-relaxed">
                  {tool.expert_verdict ??
                    tool.conversion_hook ??
                    `If you're seeking a robust, scalable ${category?.name ?? 'SaaS'} solution, ${tool.name} is a top-tier contender that balances power with a streamlined experience.`}
                </p>
              </div>

              {tool.conversion_hook && (
                <div className="mt-10 mb-12">
                  <AffiliateCTA
                    slug={tool.slug}
                    name={tool.name}
                    variant="featured"
                    ctaText={tool.conversion_hook}
                  />
                </div>
              )}

              {/* Features */}
              {tool.features?.length > 0 && (
                <div className="mt-12">
                  <h2 className="text-2xl font-bold text-gray-900">Key Features</h2>
                  <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {tool.features.map((feature, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.06 }}
                        className="flex items-start rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:border-blue-100 hover:shadow-md transition-all"
                      >
                        <div className="mr-3 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
                          <Check className="h-4 w-4" />
                        </div>
                        <span className="text-gray-700">{feature}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pros / Cons */}
              {(tool.pros?.length || tool.cons?.length) ? (
                <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2">
                  {tool.pros?.length ? (
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Pros</h3>
                      <ul className="mt-4 space-y-3">
                        {tool.pros.map((pro, i) => (
                          <li key={i} className="flex items-start text-gray-600">
                            <Check className="mr-2 mt-1 h-4 w-4 flex-shrink-0 text-green-500" />
                            {pro}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {tool.cons?.length ? (
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Cons</h3>
                      <ul className="mt-4 space-y-3">
                        {tool.cons.map((con, i) => (
                          <li key={i} className="flex items-start text-gray-600">
                            <span className="mr-2 mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-400" />
                            {con}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {tool.cta_html && (
                <div className="mt-16">
                  <div
                    className="cta-container relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-50 to-indigo-50 p-8 sm:p-12 border border-blue-100 shadow-sm"
                    dangerouslySetInnerHTML={{ __html: sanitizeHTML(tool.cta_html) }}
                  />
                </div>
              )}

              {tool.use_cases?.length ? (
                <div className="mt-12">
                  <h2 className="text-2xl font-bold text-gray-900">Common Use Cases</h2>
                  <div className="mt-6 space-y-4">
                    {tool.use_cases.map((useCase, i) => (
                      <div key={i} className="rounded-2xl bg-indigo-50/50 p-6 border border-indigo-100">
                        <p className="text-indigo-900 leading-relaxed font-medium">{useCase}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {tool.faqs_html && (
                <div className="mt-16 border-t border-gray-200 pt-12">
                  <h2 className="text-2xl font-bold text-gray-900 mb-8">
                    Frequently Asked Questions
                  </h2>
                  <div
                    className="prose prose-blue max-w-none"
                    dangerouslySetInnerHTML={{ __html: sanitizeHTML(tool.faqs_html) }}
                  />
                </div>
              )}

              {(relatedTools?.length ?? 0) > 0 && (
                <div className="mt-16 border-t border-gray-200 pt-12">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">
                        Best {category?.name ?? ''} Alternatives
                      </h2>
                      <p className="mt-2 text-gray-500">
                        Explore similar {category?.name ?? 'SaaS'} tools.
                      </p>
                    </div>
                    <Link
                      href={`/tools/${tool.slug}/alternatives`}
                      className="hidden text-sm font-bold text-blue-600 hover:text-blue-700 sm:block"
                    >
                      View Comparison Guide →
                    </Link>
                  </div>

                  <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
                    {(relatedTools ?? []).map((alt) => (
                      <Link
                        key={alt.id}
                        href={`/tools/${alt.slug}`}
                        className="group relative flex items-center rounded-2xl border border-gray-200 bg-white p-4 transition-all hover:border-blue-200 hover:shadow-lg"
                      >
                        <div className="mr-4 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gray-50 group-hover:bg-blue-50 transition-colors overflow-hidden">
                          {alt.logo_url ? (
                            <img
                              src={alt.logo_url}
                              alt={alt.name}
                              className="h-8 w-8 object-contain"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-xl font-bold text-gray-400">{alt.name[0]}</span>
                          )}
                        </div>
                        <div className="flex-grow min-w-0">
                          <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                            {alt.name}
                          </h3>
                          <p className="text-sm text-gray-500 line-clamp-1">{alt.tagline}</p>
                        </div>
                        <ArrowRight className="h-5 w-5 text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-500 flex-shrink-0 ml-2" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-28 space-y-6">
              <AffiliateCTA
                slug={tool.slug}
                name={tool.name}
                variant={dynamicCta?.type ?? 'primary'}
                ctaText={dynamicCta?.text}
                variantIndex={dynamicCta?.variantIndex}
              />

              <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
                <div className="mb-6 rounded-2xl bg-blue-50 p-4 text-center">
                  <div className="text-sm font-semibold uppercase tracking-wider text-blue-600">
                    Starting at
                  </div>
                  <div className="mt-1 flex items-baseline justify-center">
                    <span className="text-4xl font-black text-gray-900">
                      {tool.pricing_data?.currency ?? '$'}{tool.pricing_data?.starting_price ?? '0'}
                    </span>
                    <span className="ml-1 text-gray-500">/mo</span>
                  </div>
                  <div className="mt-2 text-sm font-medium text-blue-600">
                    {tool.pricing_model ?? 'Subscription'}
                  </div>
                </div>

                <div className="space-y-5">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-gray-400">
                    Why choose {tool.name}?
                  </h4>
                  <ul className="space-y-4">
                    {[
                      `Ranked #1 in ${category?.name ?? 'its segment'}`,
                      tool.tagline ?? `Leading ${category?.name ?? 'SaaS'} solution`,
                      'Competitive pricing & strong ROI',
                    ].map((point, i) => (
                      <li key={i} className="flex items-start text-sm text-gray-700">
                        <div className="mr-3 mt-0.5 rounded-full bg-green-100 p-1 text-green-600">
                          <Check className="h-3 w-3" />
                        </div>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8 space-y-4 border-t border-gray-100 pt-8">
                  <div className="flex items-center text-sm text-gray-600">
                    <Shield className="mr-3 h-5 w-5 text-indigo-500" />
                    Verified &amp; Secure
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Zap className="mr-3 h-5 w-5 text-yellow-500" />
                    Instant Activation
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Globe className="mr-3 h-5 w-5 text-blue-400" />
                    Available Worldwide
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Semantic recommendations — hidden if tool isn't embedded yet */}
          <div className="max-w-4xl mx-auto px-4">
            <SimilarTools mode="byTool" toolId={tool.id} />
            <ReviewSection toolId={tool.id} toolName={tool.name} />
          </div>
        </div>
      </main>

      <AffiliateCTA slug={tool.slug} name={tool.name} variant="sticky" />
    </div>
  );
}
