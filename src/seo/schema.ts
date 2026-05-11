/**
 * Schema.org JSON-LD generators.
 *
 * One pure function per schema type. They take typed input and return
 * a plain object — no DOM, no React. The component layer (SEO.tsx,
 * ToolSchema.tsx) is responsible for serialising and injecting.
 *
 * Used both at runtime (browser) and at build time (sitemap generator
 * embeds these in pre-rendered HTML).
 */
import type { Tool, Category, NichePage } from '@/types/tool';
import { SITE_CONFIG, DEFAULT_AUTHOR, ORGANIZATION, absoluteUrl } from './config';

// ── Primitive types ─────────────────────────────────────────────────────

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface ReviewItem {
  author: string;
  rating: number;
  body: string;
  datePublished: string; // ISO 8601
}

// ── Schema generators ──────────────────────────────────────────────────

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: ORGANIZATION.name,
    url: ORGANIZATION.url,
    logo: ORGANIZATION.logo,
    sameAs: ORGANIZATION.sameAs,
  };
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_CONFIG.name,
    url: SITE_CONFIG.url,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_CONFIG.url}/finder?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

export function faqSchema(faqs: FAQItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export interface SoftwareApplicationOptions {
  tool: Tool;
  categoryName?: string;
  reviews?: ReviewItem[];
  /** ISO 8601 date string for `dateModified` */
  lastModified?: string;
}

export function softwareApplicationSchema({
  tool,
  categoryName,
  reviews,
  lastModified,
}: SoftwareApplicationOptions) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: tool.name,
    description: tool.description,
    applicationCategory: categoryName ?? 'BusinessApplication',
    operatingSystem: 'Web',
    url: tool.website_url,
    image: tool.logo_url,
  };

  if (tool.pricing_data) {
    schema.offers = {
      '@type': 'Offer',
      price: String(tool.pricing_data.starting_price ?? '0'),
      priceCurrency: tool.pricing_data.currency ?? 'USD',
      availability: 'https://schema.org/InStock',
    };
  }

  if (tool.avg_rating && tool.review_count && tool.review_count > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: tool.avg_rating,
      reviewCount: tool.review_count,
      bestRating: '5',
      worstRating: '1',
    };
  }

  if (reviews && reviews.length > 0) {
    schema.review = reviews.map((r) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: r.author },
      reviewRating: {
        '@type': 'Rating',
        ratingValue: r.rating,
        bestRating: '5',
        worstRating: '1',
      },
      reviewBody: r.body,
      datePublished: r.datePublished,
    }));
  }

  if (lastModified) {
    schema.dateModified = lastModified;
  }

  return schema;
}

/**
 * Standalone Review schema (outside SoftwareApplication context).
 * Used on dedicated review pages.
 */
export function reviewSchema(opts: {
  itemName: string;
  itemUrl?: string;
  reviews: ReviewItem[];
  authorName?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Review',
    itemReviewed: {
      '@type': 'SoftwareApplication',
      name: opts.itemName,
      url: opts.itemUrl,
    },
    author: {
      '@type': 'Person',
      name: opts.authorName ?? DEFAULT_AUTHOR.name,
      jobTitle: DEFAULT_AUTHOR.jobTitle,
      url: DEFAULT_AUTHOR.url,
    },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: average(opts.reviews.map((r) => r.rating)),
      bestRating: '5',
      worstRating: '1',
    },
  };
}

export interface ItemListEntry {
  name: string;
  url: string;
  position?: number;
}

/**
 * ItemList schema — used on category and niche pages where we list tools.
 */
export function itemListSchema(items: ItemListEntry[], listName?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    ...(listName ? { name: listName } : {}),
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: item.position ?? index + 1,
      url: absoluteUrl(item.url),
      name: item.name,
    })),
  };
}

/**
 * Article schema — used on niche/best/blog pages for E-E-A-T signals.
 * Always include `datePublished` and `dateModified` for fresh-content signals.
 */
export interface ArticleSchemaOptions {
  headline: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified: string;
  image?: string;
  authorName?: string;
}

export function articleSchema(opts: ArticleSchemaOptions) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.headline,
    description: opts.description,
    image: opts.image ?? SITE_CONFIG.defaultOgImage,
    datePublished: opts.datePublished,
    dateModified: opts.dateModified,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': absoluteUrl(opts.url),
    },
    author: {
      '@type': 'Person',
      name: opts.authorName ?? DEFAULT_AUTHOR.name,
      jobTitle: DEFAULT_AUTHOR.jobTitle,
      url: DEFAULT_AUTHOR.url,
    },
    publisher: {
      '@type': 'Organization',
      name: ORGANIZATION.name,
      logo: { '@type': 'ImageObject', url: ORGANIZATION.logo },
    },
  };
}

// ── Page-level helpers (compose multiple schemas) ───────────────────────

/**
 * Combine multiple schema objects into a single @graph.
 * Search engines parse the graph as multiple connected entities.
 */
export function combineSchemas(...schemas: Array<Record<string, unknown> | null | undefined>) {
  const valid = schemas.filter((s): s is Record<string, unknown> => !!s);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  return {
    '@context': 'https://schema.org',
    '@graph': valid.map((s) => {
      const { '@context': _ctx, ...rest } = s;
      return rest;
    }),
  };
}

/**
 * Build the full schema graph for a tool page in one call.
 */
export function toolPageSchema(opts: {
  tool: Tool;
  category?: Category;
  faqs?: FAQItem[];
  breadcrumbs: BreadcrumbItem[];
  reviews?: ReviewItem[];
  lastModified?: string;
}) {
  return combineSchemas(
    softwareApplicationSchema({
      tool: opts.tool,
      categoryName: opts.category?.name,
      reviews: opts.reviews,
      lastModified: opts.lastModified,
    }),
    breadcrumbSchema(opts.breadcrumbs),
    opts.faqs && opts.faqs.length > 0 ? faqSchema(opts.faqs) : null,
  );
}

/**
 * Build the full schema graph for a category page.
 */
export function categoryPageSchema(opts: {
  category: Category;
  tools: Pick<Tool, 'name' | 'slug'>[];
  breadcrumbs: BreadcrumbItem[];
}) {
  return combineSchemas(
    itemListSchema(
      opts.tools.map((t) => ({ name: t.name, url: `/tools/${t.slug}` })),
      `Best ${opts.category.name} Tools`,
    ),
    breadcrumbSchema(opts.breadcrumbs),
  );
}

/**
 * Build the full schema graph for a niche/best page.
 */
export function nichePageSchema(opts: {
  page: NichePage;
  tools: Pick<Tool, 'name' | 'slug'>[];
  breadcrumbs: BreadcrumbItem[];
  faqs?: FAQItem[];
  datePublished: string;
  dateModified: string;
}) {
  return combineSchemas(
    articleSchema({
      headline: opts.page.seo_title,
      description: opts.page.seo_meta_description,
      url: `/best/${opts.page.slug}`,
      datePublished: opts.datePublished,
      dateModified: opts.dateModified,
    }),
    itemListSchema(
      opts.tools.map((t) => ({ name: t.name, url: `/tools/${t.slug}` })),
      opts.page.niche_name,
    ),
    breadcrumbSchema(opts.breadcrumbs),
    opts.faqs && opts.faqs.length > 0 ? faqSchema(opts.faqs) : null,
  );
}

// ── Internals ───────────────────────────────────────────────────────────

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2));
}
