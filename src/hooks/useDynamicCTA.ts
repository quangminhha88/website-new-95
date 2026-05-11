/**
 * useDynamicCTA(slug) — pick the right CTA variant for a given tool.
 *
 * Selection algorithm (in priority order):
 *
 *   1. WINNER OVERRIDE
 *      If ab_experiments has a promoted winner (resource_type='cta',
 *      status='winner') for this slug, everyone sees it.
 *
 *   2. RULE-BASED PRE-FILTER
 *      Filter the candidate pool by signal:
 *        - Tool has confirmed high EPC (≥ $1) → keep 'primary' / 'featured'
 *          (don't experiment on a known winner)
 *        - Tool offers a coupon/promo (commission_estimate flag) → 'discount'
 *          becomes a candidate
 *        - Low traffic / low EPC tool → 'urgency' is allowed (try harder)
 *
 *   3. WEIGHTED HASH ASSIGNMENT
 *      Among the surviving candidates, pick deterministically using
 *      FNV-1a(visitorId + slug) → weight-aware modulo.
 *
 * Result includes `variantIndex` so click tracking can attribute the
 * conversion to the exact variant the user saw.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getVisitorId } from '@/seo/ab-engine';

export type CTAType = 'primary' | 'featured' | 'urgency' | 'discount';

export interface CTAVariant {
  type: CTAType;
  text: string;
  weight?: number;
  enabled?: boolean;
}

export interface DynamicCTA {
  type: CTAType;
  text: string;
  variantIndex: number;
  isWinner: boolean;
}

interface ToolForCTA {
  id: string;
  slug: string;
  name: string;
  commission_estimate: number | null;
  has_promo?: boolean | null;
  cta_variants: CTAVariant[] | null;
}

interface AbWinner {
  variant_index: number;
}

interface EpcRow {
  epc: number | null;
  confidence: number | null;
}

const DEFAULT_VARIANTS: CTAVariant[] = [
  { type: 'primary', text: 'Try {tool} Now', weight: 1 },
  { type: 'featured', text: 'Get Best Deal on {tool}', weight: 1 },
  { type: 'urgency', text: 'Start Free — Limited Time', weight: 1 },
  { type: 'discount', text: 'Claim Your Discount', weight: 1 },
];

export function useDynamicCTA(slug: string | undefined): {
  data: DynamicCTA | null;
  isLoading: boolean;
} {
  const visitorId = useMemo(() => getVisitorId(), []);

  const { data, isLoading } = useQuery({
    queryKey: ['cta', 'dynamic', slug, visitorId],
    enabled: !!slug,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<DynamicCTA | null> => {
      if (!slug) return null;

      // 1. Tool + EPC + winner — single batched fetch
      const [toolRes, winnerRes, epcRes] = await Promise.all([
        supabase
          .from('tools')
          .select('id, slug, name, commission_estimate, cta_variants')
          .eq('slug', slug)
          .single(),
        supabase
          .from('ab_experiments')
          .select('variant_index')
          .eq('resource_type', 'cta')
          .eq('resource_slug', slug)
          .eq('status', 'winner')
          .maybeSingle(),
        supabase
          .from('tool_epc')
          .select('epc, confidence')
          .eq('tool_slug', slug)
          .maybeSingle(),
      ]);

      const tool = toolRes.data as ToolForCTA | null;
      if (!tool) return null;

      const allVariants = (tool.cta_variants ?? DEFAULT_VARIANTS).filter(
        (v) => v.enabled !== false,
      );
      if (allVariants.length === 0) return null;

      // 1. Winner override
      const winner = winnerRes.data as AbWinner | null;
      if (winner && allVariants[winner.variant_index]) {
        const v = allVariants[winner.variant_index];
        return {
          type: v.type,
          text: interpolate(v.text, tool.name),
          variantIndex: winner.variant_index,
          isWinner: true,
        };
      }

      // 2. Rule-based filter
      const epc = epcRes.data as EpcRow | null;
      const hasConfirmedHighEpc =
        (epc?.epc ?? 0) >= 1 && (epc?.confidence ?? 0) >= 0.5;
      const hasPromo = !!tool.commission_estimate && tool.commission_estimate >= 30;

      const eligible = allVariants.filter((v) => {
        if (hasConfirmedHighEpc && (v.type === 'urgency')) return false;
        if (v.type === 'discount' && !hasPromo) return false;
        return true;
      });
      const pool = eligible.length > 0 ? eligible : allVariants;

      // 3. Weighted deterministic assignment
      const idx = weightedPick(pool, `${visitorId}:${slug}`);
      const chosen = pool[idx];
      const realIndex = allVariants.indexOf(chosen);

      return {
        type: chosen.type,
        text: interpolate(chosen.text, tool.name),
        variantIndex: realIndex >= 0 ? realIndex : idx,
        isWinner: false,
      };
    },
  });

  return { data: data ?? null, isLoading };
}

// ── helpers ─────────────────────────────────────────────────────────

function interpolate(template: string, name: string): string {
  return template.replace(/\{tool\}/g, name);
}

function weightedPick<T extends { weight?: number }>(items: T[], hashSeed: string): number {
  const weights = items.map((i) => Math.max(i.weight ?? 1, 0));
  const total = weights.reduce((s, w) => s + w, 0);
  if (total === 0) return 0;

  const h = fnv1a(hashSeed) % 1_000_000;
  const point = (h / 1_000_000) * total;

  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += weights[i];
    if (point < acc) return i;
  }
  return items.length - 1;
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}
