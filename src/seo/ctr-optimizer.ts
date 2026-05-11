/**
 * CTR Optimization Engine.
 *
 * Three responsibilities:
 *   1. Generate multiple title/meta variants from proven templates
 *   2. Score candidates (keyword presence, length, emotional triggers)
 *   3. A/B testing selector — picks variant deterministically per visitor
 *
 * Template library is calibrated on ~30 SERP-winning patterns in the
 * SaaS niche. Update by editing `TITLE_TEMPLATES` only.
 */

const CURRENT_YEAR = new Date().getFullYear();

// ── Title templates ────────────────────────────────────────────────────

export interface TitleTemplate {
  pattern: (vars: Record<string, string>) => string;
  /** Required vars — generation skipped if any missing */
  vars: string[];
  /** Use cases this template fits */
  appliesTo: TemplatePageType[];
  /** Bias for re-ranking (1.0 = neutral, >1 = favoured) */
  weight: number;
}

export type TemplatePageType = 'tool' | 'niche' | 'comparison' | 'alternatives' | 'category';

export const TITLE_TEMPLATES: TitleTemplate[] = [
  // Tool review pages
  {
    pattern: (v) => `${v.tool} Review ${CURRENT_YEAR}: Pricing, Features & Verdict`,
    vars: ['tool'],
    appliesTo: ['tool'],
    weight: 1.0,
  },
  {
    pattern: (v) => `${v.tool} Review: Is It Worth It in ${CURRENT_YEAR}?`,
    vars: ['tool'],
    appliesTo: ['tool'],
    weight: 1.1,
  },
  {
    pattern: (v) => `${v.tool} Pricing & Features (${CURRENT_YEAR} Hands-On Review)`,
    vars: ['tool'],
    appliesTo: ['tool'],
    weight: 0.95,
  },
  // Niche / "best X" pages — highest CTR templates
  {
    pattern: (v) => `Best ${v.niche} in ${CURRENT_YEAR} (Tested & Ranked)`,
    vars: ['niche'],
    appliesTo: ['niche'],
    weight: 1.3,
  },
  {
    pattern: (v) => `${v.count ?? '7'} Best ${v.niche} for ${v.audience ?? 'Teams'} (${CURRENT_YEAR})`,
    vars: ['niche'],
    appliesTo: ['niche'],
    weight: 1.25,
  },
  {
    pattern: (v) => `Top ${v.niche} ${CURRENT_YEAR}: Compared Side-by-Side`,
    vars: ['niche'],
    appliesTo: ['niche'],
    weight: 1.1,
  },
  // Comparison
  {
    pattern: (v) => `${v.toolA} vs ${v.toolB}: Which Is Better in ${CURRENT_YEAR}?`,
    vars: ['toolA', 'toolB'],
    appliesTo: ['comparison'],
    weight: 1.2,
  },
  {
    pattern: (v) => `${v.toolA} vs ${v.toolB} (${CURRENT_YEAR}): Honest Comparison`,
    vars: ['toolA', 'toolB'],
    appliesTo: ['comparison'],
    weight: 1.0,
  },
  // Alternatives
  {
    pattern: (v) => `${v.count ?? '10'} Best ${v.tool} Alternatives in ${CURRENT_YEAR} (Free & Paid)`,
    vars: ['tool'],
    appliesTo: ['alternatives'],
    weight: 1.3,
  },
  {
    pattern: (v) => `Top ${v.tool} Alternatives ${CURRENT_YEAR}: Tested by Experts`,
    vars: ['tool'],
    appliesTo: ['alternatives'],
    weight: 1.15,
  },
  // Category
  {
    pattern: (v) => `Best ${v.category} Software in ${CURRENT_YEAR}: Curated by Experts`,
    vars: ['category'],
    appliesTo: ['category'],
    weight: 1.1,
  },
];

// ── Meta description templates ─────────────────────────────────────────

export const META_TEMPLATES: Record<TemplatePageType, (v: Record<string, string>) => string> = {
  tool: (v) =>
    `Honest ${v.tool} review for ${CURRENT_YEAR}: features, pricing from ${v.price ?? '$0'}/mo, pros, cons, and how it compares. Read before you buy.`,
  niche: (v) =>
    `We tested the top ${v.niche} for ${CURRENT_YEAR}. Side-by-side feature, pricing, and use-case comparison — picks for every team size and budget.`,
  comparison: (v) =>
    `${v.toolA} vs ${v.toolB} compared head-to-head: pricing, features, integrations & verdicts. Find which one fits your workflow in ${CURRENT_YEAR}.`,
  alternatives: (v) =>
    `Looking for a ${v.tool} alternative? We ranked the top options for ${CURRENT_YEAR} by features, pricing, and ease of use. Includes free picks.`,
  category: (v) =>
    `Top ${v.category} software in ${CURRENT_YEAR}, ranked. Curated by SaaS analysts based on real testing — pricing, features, and migration ease compared.`,
};

// ── Variant generation ─────────────────────────────────────────────────

export interface TitleVariant {
  title: string;
  meta: string;
  templateIndex: number;
  score: number;
  reasons: string[];
}

/**
 * Generate up to N title/meta candidates for a page.
 * Sorted by computed CTR score (best first).
 */
export function generateVariants(
  type: TemplatePageType,
  vars: Record<string, string>,
  options: { keywords?: string[]; max?: number } = {},
): TitleVariant[] {
  const max = options.max ?? 5;
  const eligible = TITLE_TEMPLATES.filter((t) => {
    if (!t.appliesTo.includes(type)) return false;
    return t.vars.every((v) => vars[v]);
  });

  const candidates: TitleVariant[] = eligible.map((t) => {
    const title = t.pattern(vars);
    const meta = META_TEMPLATES[type](vars);
    const { score, reasons } = scoreTitle(title, options.keywords ?? []);
    return {
      title,
      meta,
      templateIndex: TITLE_TEMPLATES.indexOf(t),
      score: score * t.weight,
      reasons,
    };
  });

  return candidates.sort((a, b) => b.score - a.score).slice(0, max);
}

// ── Scoring ────────────────────────────────────────────────────────────

const POWER_WORDS = [
  'best',
  'top',
  'tested',
  'ranked',
  'expert',
  'honest',
  'compared',
  'verdict',
  'guide',
  'ultimate',
];

const EMOTIONAL = ['really', 'truly', 'actually', 'finally', 'better', 'worth'];

function scoreTitle(title: string, keywords: string[]): { score: number; reasons: string[] } {
  let score = 50;
  const reasons: string[] = [];
  const lower = title.toLowerCase();

  // Length sweet spot: 50-60 chars
  const len = title.length;
  if (len >= 50 && len <= 60) {
    score += 15;
    reasons.push('Optimal length 50-60');
  } else if (len > 65) {
    score -= 10;
    reasons.push(`Too long (${len})`);
  } else if (len < 40) {
    score -= 5;
    reasons.push(`Too short (${len})`);
  }

  // Power words
  const powerHits = POWER_WORDS.filter((w) => lower.includes(w));
  if (powerHits.length > 0) {
    score += powerHits.length * 5;
    reasons.push(`Power words: ${powerHits.join(', ')}`);
  }

  // Year mention (freshness signal)
  if (lower.includes(String(CURRENT_YEAR))) {
    score += 8;
    reasons.push('Year mentioned');
  }

  // Number presence ("7 Best…", "Top 10…")
  if (/\b\d+\b/.test(title)) {
    score += 6;
    reasons.push('Includes number');
  }

  // Emotional triggers
  if (EMOTIONAL.some((w) => lower.includes(w))) {
    score += 4;
    reasons.push('Emotional trigger');
  }

  // Keyword presence (target queries)
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      score += 8;
      reasons.push(`Keyword: ${kw}`);
    }
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

// ── A/B testing selector ───────────────────────────────────────────────

/**
 * Deterministically pick a variant for a given visitor.
 * Uses FNV-1a hash on (slug + visitorId) so the same visitor sees the
 * same variant on repeat visits — required for valid CTR measurement.
 *
 * Track impressions/clicks against `variantIndex` in Supabase; pick winners
 * weekly via `improve-ctr-batch.ts`.
 */
export function selectVariantForVisitor(
  variants: TitleVariant[],
  visitorId: string,
  pageSlug: string,
): TitleVariant {
  if (variants.length === 0) {
    throw new Error('No variants provided');
  }
  if (variants.length === 1) return variants[0];

  const hash = fnv1a(`${pageSlug}::${visitorId}`);
  const idx = hash % variants.length;
  return variants[idx];
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}
