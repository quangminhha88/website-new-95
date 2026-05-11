/**
 * Indexability rules.
 *
 * Centralised so SEO.tsx, the sitemap generator, and any other crawler-
 * facing surface use the *same* logic. Keeps thin pages out of the index
 * and stops dupes from cannibalising rankings.
 */
import type { Tool, NichePage, Category } from '@/types/tool';

export interface IndexabilityVerdict {
  shouldIndex: boolean;
  reason?: string;
}

const MIN_TOOL_DESCRIPTION = 200; // chars
const MIN_NICHE_CONTENT = 1000;
const MIN_CATEGORY_DESCRIPTION = 80;

/**
 * Should a tool page be indexed by search engines?
 */
export function isToolIndexable(tool: Tool | null | undefined): IndexabilityVerdict {
  if (!tool) return { shouldIndex: false, reason: 'Tool not found' };
  const desc = tool.full_description ?? tool.description ?? '';
  if (desc.length < MIN_TOOL_DESCRIPTION) {
    return { shouldIndex: false, reason: `Thin content (${desc.length} chars)` };
  }
  if (!tool.features || tool.features.length === 0) {
    return { shouldIndex: false, reason: 'No features listed' };
  }
  return { shouldIndex: true };
}

export function isNicheIndexable(page: NichePage | null | undefined): IndexabilityVerdict {
  if (!page) return { shouldIndex: false, reason: 'Niche page not found' };
  if (!page.seo_content_html || page.seo_content_html.length < MIN_NICHE_CONTENT) {
    return {
      shouldIndex: false,
      reason: `Thin content (${page.seo_content_html?.length ?? 0} chars)`,
    };
  }
  if (!page.seo_title || !page.seo_meta_description) {
    return { shouldIndex: false, reason: 'Missing SEO title or description' };
  }
  return { shouldIndex: true };
}

export function isCategoryIndexable(category: Category | null | undefined): IndexabilityVerdict {
  if (!category) return { shouldIndex: false, reason: 'Category not found' };
  if (!category.description || category.description.length < MIN_CATEGORY_DESCRIPTION) {
    return { shouldIndex: false, reason: 'Thin category description' };
  }
  return { shouldIndex: true };
}

/**
 * Build the robots meta content string from a verdict.
 * Pass to the SEO component or render in a <meta name="robots"> tag.
 */
export function robotsContent(verdict: IndexabilityVerdict): string {
  if (verdict.shouldIndex) return 'index, follow, max-image-preview:large, max-snippet:-1';
  return 'noindex, follow';
}
