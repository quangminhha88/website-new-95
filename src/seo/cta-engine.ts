/**
 * Smart CTA / Monetization Engine.
 *
 * Decides which tool to promote in dynamic CTA slots (sidebar, comparison
 * winner, "you might also like…", finder fallback, etc.) based on:
 *
 *   revenue_score = epc × confidence + commission_estimate × 0.5
 *
 * The `tool_revenue_score` SQL view does most of the work; this module
 * adds intent matching (filter by category/tags) and rotation (pick top-K
 * deterministically per visitor so refresh doesn't shuffle).
 */
import { supabase } from '@/lib/supabase';

export interface CTAOption {
  tool_id: string;
  slug: string;
  name: string;
  commission_estimate: number | null;
  epc: number | null;
  confidence: number | null;
  revenue_score: number;
}

export interface CTAQuery {
  /** Restrict to tools in this category (e.g. for in-context CTAs) */
  categoryId?: string;
  /** Restrict to a specific intent — keyword tokens to match against features */
  intentKeywords?: string[];
  /** How many candidates to consider before picking */
  topK?: number;
  /** Visitor ID for deterministic rotation (so the same visitor gets the same CTA) */
  visitorId?: string;
  /** Exclude these tool slugs (e.g. don't recommend the tool the user is already on) */
  exclude?: string[];
}

/**
 * Pick the highest-revenue tool that fits the intent.
 * Returns null if no candidates qualify.
 */
export async function pickBestCTA(query: CTAQuery): Promise<CTAOption | null> {
  const candidates = await fetchCandidates(query);
  if (candidates.length === 0) return null;

  // Top-K rotation: pick deterministically from the top K by revenue_score.
  // Avoids always showing the same tool while keeping high-revenue bias.
  const topK = Math.min(query.topK ?? 3, candidates.length);
  const top = candidates.slice(0, topK);

  if (!query.visitorId) return top[0];
  const idx = fnv1a(query.visitorId) % top.length;
  return top[idx];
}

/**
 * Pick N tools for a "recommended for you" rail.
 * Sorted by revenue_score, deduped, intent-filtered.
 */
export async function pickCTARail(query: CTAQuery, n = 4): Promise<CTAOption[]> {
  const candidates = await fetchCandidates(query);
  return candidates.slice(0, n);
}

// ── Internal: fetch + score ────────────────────────────────────────────

async function fetchCandidates(query: CTAQuery): Promise<CTAOption[]> {
  let q = supabase
    .from('tool_revenue_score')
    .select('id, slug, name, commission_estimate, epc, confidence, revenue_score')
    .order('revenue_score', { ascending: false })
    .limit(20);

  if (query.exclude && query.exclude.length > 0) {
    q = q.not('slug', 'in', `(${query.exclude.map((s) => `"${s}"`).join(',')})`);
  }

  const { data, error } = await q;
  if (error) {
    // View may not exist (migration not applied) — fall back to plain tools query
    return fallbackCandidates(query);
  }

  const rows = (data ?? []).map((r: any) => ({
    tool_id: r.id,
    slug: r.slug,
    name: r.name,
    commission_estimate: r.commission_estimate,
    epc: r.epc,
    confidence: r.confidence,
    revenue_score: r.revenue_score ?? 0,
  })) as CTAOption[];

  if (!query.intentKeywords?.length) return rows;
  return await filterByIntent(rows, query.intentKeywords);
}

async function fallbackCandidates(query: CTAQuery): Promise<CTAOption[]> {
  let q = supabase
    .from('tools')
    .select('id, slug, name, commission_estimate, category_id')
    .eq('moderation_status', 'approved')
    .order('commission_estimate', { ascending: false, nullsFirst: false })
    .limit(20);

  if (query.categoryId) q = q.eq('category_id', query.categoryId);
  if (query.exclude && query.exclude.length > 0) {
    q = q.not('slug', 'in', `(${query.exclude.map((s) => `"${s}"`).join(',')})`);
  }

  const { data, error } = await q;
  if (error || !data) return [];

  return data.map((r) => ({
    tool_id: r.id,
    slug: r.slug,
    name: r.name,
    commission_estimate: r.commission_estimate,
    epc: null,
    confidence: null,
    revenue_score: r.commission_estimate ?? 0,
  }));
}

async function filterByIntent(
  candidates: CTAOption[],
  keywords: string[],
): Promise<CTAOption[]> {
  const slugs = candidates.map((c) => c.slug);
  const { data: details } = await supabase
    .from('tools')
    .select('slug, features, description, tagline')
    .in('slug', slugs);

  if (!details) return candidates;

  const keywordSet = new Set(keywords.map((k) => k.toLowerCase()));
  const scored = candidates
    .map((c) => {
      const detail = details.find((d) => d.slug === c.slug);
      const text = [detail?.description, detail?.tagline, ...(detail?.features ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      let intentMatch = 0;
      for (const kw of keywordSet) {
        if (text.includes(kw)) intentMatch++;
      }
      return { ...c, revenue_score: c.revenue_score + intentMatch * 50 };
    })
    .sort((a, b) => b.revenue_score - a.revenue_score);

  return scored;
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}
