import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  getToolBySlugServer,
  getCategoryByIdServer,
  getRelatedToolsServer,
  getTopToolSlugsServer,
} from '@/lib/supabase-server';
import { toolPageSchema } from '@/seo/schema';
import { isToolIndexable, robotsContent } from '@/seo/indexability';
import { extractFAQs } from '@/seo/faq-utils';
import { SITE_CONFIG } from '@/seo/config';
import ToolPageClient from './ToolPageClient';

/**
 * /tools/[slug] — Server Component shell.
 *
 * - generateStaticParams pre-renders the top 200 tools by avg_rating at
 *   build time. Anything outside that set is served on-demand and cached
 *   per `revalidate` below.
 * - generateMetadata produces the canonical, OG, robots, and title tags
 *   server-side so crawlers see them without running JS.
 * - The actual UI is the same JSX that lived in src/views/tools/ToolPage.tsx,
 *   now in ToolPageClient.tsx — data is passed via props instead of fetched
 *   client-side. Interactive client hooks (useDynamicCTA, useTrackPage) stay
 *   inside the client component.
 */

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  const slugs = await getTopToolSlugsServer(200);
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = await getToolBySlugServer(slug);
  if (!tool) return {};

  const category = tool.category_id ? await getCategoryByIdServer(tool.category_id) : null;
  const pricingDisplay = `${tool.pricing_data?.currency ?? '$'}${tool.pricing_data?.starting_price ?? '0'}/mo`;
  const indexability = isToolIndexable(tool);

  const title = tool.seo_title ?? `${tool.name} Review & Pricing 2026`;
  const description =
    tool.seo_meta_description ??
    `Expert ${tool.name} review: features, pricing from ${pricingDisplay}, pros, cons & alternatives. Category: ${category?.name ?? 'SaaS'}.`;

  return {
    title,
    description,
    alternates: { canonical: `/tools/${slug}` },
    openGraph: {
      type: 'website',
      url: `${SITE_CONFIG.url}/tools/${slug}`,
      title,
      description,
      images: [
        {
          url: `/api/og/tool?slug=${slug}`,
          width: 1200,
          height: 630,
          alt: tool.name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`/api/og/tool?slug=${slug}`],
    },
    robots: robotsContent(indexability),
  };
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = await getToolBySlugServer(slug);
  if (!tool) notFound();

  // Category + related-tools fetched in parallel. Skip the related-tools
  // call when the tool has no category — saves a needless DB round-trip.
  const [category, relatedTools] = await Promise.all([
    tool.category_id ? getCategoryByIdServer(tool.category_id) : Promise.resolve(null),
    tool.category_id
      ? getRelatedToolsServer(tool.category_id, tool.id)
      : Promise.resolve([] as Awaited<ReturnType<typeof getRelatedToolsServer>>),
  ]);

  const faqs = extractFAQs(tool.faqs_html);
  const breadcrumbs = [
    { name: 'Directory', url: '/' },
    { name: category?.name ?? 'Category', url: `/category/${category?.slug ?? ''}` },
    { name: tool.name, url: `/tools/${tool.slug}` },
  ];
  const schema = toolPageSchema({
    tool,
    category: category ?? undefined,
    faqs,
    breadcrumbs,
  });
  const indexability = isToolIndexable(tool);

  return (
    <ToolPageClient
      tool={tool}
      category={category}
      relatedTools={relatedTools}
      schema={schema}
      indexability={indexability}
      breadcrumbs={breadcrumbs}
    />
  );
}
