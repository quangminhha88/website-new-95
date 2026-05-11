/**
 * Internal linking engine.
 *
 * Programmatic SEO at scale lives or dies by the link graph. This module
 * decides which 5–15 internal links to inject into a piece of content,
 * based on:
 *   1. Topical relevance (same category, alternatives, comparisons)
 *   2. Authority signals (commission tier, review count)
 *   3. Anchor text variation (avoid over-optimisation penalty)
 *
 * Designed to plug into both:
 *   - Build-time scripts (scripts/add-internal-links.ts)
 *   - Runtime AI prompts (gemini gets a "link these target pages" instruction)
 */
import type { Tool, Category } from '@/types/tool';

export interface LinkTarget {
  url: string;
  /** Surface anchor — what the AI should use as link text */
  anchor: string;
  /** Alternate anchor variations to avoid duplication */
  anchorVariants: string[];
  priority: number; // 0–100; higher = more important to include
  reason: string;
  type: 'tool' | 'alternatives' | 'comparison' | 'category' | 'niche';
}

export interface LinkBuilderInput {
  currentSlug: string;
  currentType: 'tool' | 'category' | 'niche' | 'comparison';
  currentCategoryId?: string;
  currentText?: string; // existing content (used to filter anchors already mentioned)
  candidates: {
    tools: Pick<Tool, 'id' | 'slug' | 'name' | 'tagline' | 'category_id' | 'commission_estimate' | 'avg_rating'>[];
    categories: Pick<Category, 'id' | 'slug' | 'name'>[];
    niches?: { slug: string; niche_name: string }[];
  };
}

export interface LinkPlan {
  required: LinkTarget[]; // must-include (5–7 highest priority)
  optional: LinkTarget[]; // nice-to-have (up to 8 more)
  total: number;
}

const MIN_LINKS = 5;
const MAX_LINKS = 15;
const REQUIRED_LINKS = 7;

/**
 * Build a prioritised link plan for a page.
 * Caller should inject `required` always, and `optional` until total ≤15.
 */
export function buildLinkPlan(input: LinkBuilderInput): LinkPlan {
  const targets: LinkTarget[] = [];
  const { currentSlug, currentType, currentCategoryId, candidates } = input;

  // ── 1. Same-category tools (highest topical relevance) ─────────────
  const sameCategoryTools = candidates.tools
    .filter((t) => t.slug !== currentSlug && t.category_id === currentCategoryId)
    .sort(byAuthority)
    .slice(0, 6);

  for (const t of sameCategoryTools) {
    targets.push({
      url: `/tools/${t.slug}`,
      anchor: t.name,
      anchorVariants: [t.name, `${t.name} review`, `the ${t.name} platform`],
      priority: 70 + Math.min(20, (t.commission_estimate ?? 0) / 5),
      reason: 'Same category — high topical relevance',
      type: 'tool',
    });
  }

  // ── 2. Alternatives pages (huge SEO value: "X alternatives" intent) ──
  if (currentType === 'tool') {
    targets.push({
      url: `/tools/${currentSlug}/alternatives`,
      anchor: `alternatives`,
      anchorVariants: ['alternatives', 'similar tools', 'other options'],
      priority: 95,
      reason: 'Self-alternatives page — captures comparison intent',
      type: 'alternatives',
    });
  }

  // ── 3. Top-revenue tools across all categories ────────────────────
  const moneyMakers = candidates.tools
    .filter((t) => t.slug !== currentSlug)
    .filter((t) => (t.commission_estimate ?? 0) > 30)
    .sort((a, b) => (b.commission_estimate ?? 0) - (a.commission_estimate ?? 0))
    .slice(0, 4);

  for (const t of moneyMakers) {
    if (targets.find((x) => x.url === `/tools/${t.slug}`)) continue;
    targets.push({
      url: `/tools/${t.slug}`,
      anchor: t.name,
      anchorVariants: [t.name, `consider ${t.name}`, `${t.name} as a fit`],
      priority: 60,
      reason: 'High commission — revenue link',
      type: 'tool',
    });
  }

  // ── 4. Comparison pages between top tools ────────────────────────
  if (sameCategoryTools.length >= 2) {
    const [first, second] = sameCategoryTools;
    targets.push({
      url: `/vs/${first.slug}-vs-${second.slug}`,
      anchor: `${first.name} vs ${second.name}`,
      anchorVariants: [
        `${first.name} vs ${second.name}`,
        `compare ${first.name} and ${second.name}`,
        `our ${first.name} vs ${second.name} comparison`,
      ],
      priority: 75,
      reason: 'In-niche comparison — captures vs-intent traffic',
      type: 'comparison',
    });
  }

  // ── 5. Category hub ────────────────────────────────────────────────
  const cat = candidates.categories.find((c) => c.id === currentCategoryId);
  if (cat) {
    targets.push({
      url: `/category/${cat.slug}`,
      anchor: `${cat.name} tools`,
      anchorVariants: [
        `${cat.name} software`,
        `our ${cat.name} category`,
        `top ${cat.name} platforms`,
      ],
      priority: 80,
      reason: 'Category hub — distributes authority',
      type: 'category',
    });
  }

  // ── 6. Related niche/best pages ────────────────────────────────────
  if (cat && candidates.niches) {
    const relatedNiches = candidates.niches
      .filter((n) => n.niche_name.toLowerCase().includes(cat.name.toLowerCase()))
      .slice(0, 2);
    for (const n of relatedNiches) {
      targets.push({
        url: `/best/${n.slug}`,
        anchor: n.niche_name,
        anchorVariants: [n.niche_name, `our guide to ${n.niche_name}`],
        priority: 65,
        reason: 'Related niche guide — long-tail capture',
        type: 'niche',
      });
    }
  }

  // ── Filter: drop anchors already in the existing text (avoid repetition) ─
  const existingText = (input.currentText ?? '').toLowerCase();
  const filtered = targets.filter((t) => {
    // Keep alternatives + category links even if anchor is already used
    if (t.type === 'alternatives' || t.type === 'category') return true;
    return !existingText.includes(t.anchor.toLowerCase());
  });

  // ── Sort by priority, dedupe by URL, slice to caps ────────────────
  const seen = new Set<string>();
  const unique = filtered
    .sort((a, b) => b.priority - a.priority)
    .filter((t) => {
      if (seen.has(t.url)) return false;
      seen.add(t.url);
      return true;
    });

  return {
    required: unique.slice(0, REQUIRED_LINKS),
    optional: unique.slice(REQUIRED_LINKS, MAX_LINKS),
    total: Math.min(unique.length, MAX_LINKS),
  };
}

/**
 * Format a link plan as instructions for an LLM prompt.
 * Use inside content-generator.ts when calling Gemini.
 */
export function planAsLLMInstruction(plan: LinkPlan): string {
  const all = [...plan.required, ...plan.optional];
  if (all.length === 0) return '';

  const lines = all.map((t, i) => {
    const variants = t.anchorVariants.join('", "');
    return `  ${i + 1}. URL: ${t.url} — Anchor (use varied phrasing, e.g. "${variants}")`;
  });

  return `
INTERNAL LINKING REQUIREMENTS (mandatory, ${plan.required.length} of these are REQUIRED):
${lines.join('\n')}

Rules:
- Insert links contextually inside paragraphs — NEVER as a "Related Links" dump.
- Use the suggested anchor variants; do not repeat the same anchor verbatim across links.
- Make the link text feel natural to the surrounding sentence.
- Total internal links per page: minimum ${MIN_LINKS}, maximum ${MAX_LINKS}.
`.trim();
}

/**
 * Count internal links in HTML and validate against the 5-15 rule.
 * Use after generation or in audits.
 */
export function countInternalLinks(html: string): {
  count: number;
  withinRange: boolean;
  urls: string[];
} {
  const matches = Array.from(html.matchAll(/href=["']([^"']+)["']/gi));
  const urls = matches
    .map((m) => m[1])
    .filter((u) => u.startsWith('/') || u.includes('saas-excellence.com'));
  return {
    count: urls.length,
    withinRange: urls.length >= MIN_LINKS && urls.length <= MAX_LINKS,
    urls,
  };
}

// Higher rating + commission = more authoritative target for inbound links
function byAuthority(
  a: { commission_estimate?: number; avg_rating?: number },
  b: { commission_estimate?: number; avg_rating?: number },
) {
  const scoreA = (a.commission_estimate ?? 0) + (a.avg_rating ?? 0) * 20;
  const scoreB = (b.commission_estimate ?? 0) + (b.avg_rating ?? 0) * 20;
  return scoreB - scoreA;
}
