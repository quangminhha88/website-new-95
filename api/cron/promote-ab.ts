/**
 * Cron: weekly AB winner promotion.
 * Schedule: Mondays at 04:00 UTC.
 *
 * Aggregates 14-day variant performance, runs Z-test, promotes winners.
 * Logic mirrors scripts/promote-ab-winners.ts but as a serverless handler.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin } from '../_lib/supabase';

const MIN_IMPRESSIONS = 200;
const MIN_LIFT = 0.10;
const Z_THRESHOLD = 1.96;

interface VariantStats {
  resource_slug: string;
  variant_index: number;
  impressions: number;
  clicks: number;
  ctr: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const supabase = getSupabaseAdmin();
  const startedAt = Date.now();
  const stats = { promoted: 0, skipped: 0, errors: [] as string[] };

  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: events, error } = await supabase
      .from('seo_metrics')
      .select('resource_slug, variant_index, event_type')
      .gte('created_at', since)
      .not('variant_index', 'is', null)
      .not('resource_slug', 'is', null);
    if (error) throw error;

    const grouped = new Map<string, VariantStats>();
    for (const e of events ?? []) {
      if (!e.resource_slug || e.variant_index === null) continue;
      const key = `${e.resource_slug}::${e.variant_index}`;
      let row = grouped.get(key);
      if (!row) {
        row = {
          resource_slug: e.resource_slug,
          variant_index: e.variant_index,
          impressions: 0,
          clicks: 0,
          ctr: 0,
        };
        grouped.set(key, row);
      }
      if (e.event_type === 'impression') row.impressions++;
      else if (e.event_type === 'affiliate_click') row.clicks++;
    }

    for (const r of grouped.values()) {
      r.ctr = r.impressions > 0 ? r.clicks / r.impressions : 0;
    }

    const bySlug = new Map<string, VariantStats[]>();
    for (const stat of grouped.values()) {
      if (stat.impressions < MIN_IMPRESSIONS) continue;
      const arr = bySlug.get(stat.resource_slug) ?? [];
      arr.push(stat);
      bySlug.set(stat.resource_slug, arr);
    }

    for (const [slug, variants] of bySlug.entries()) {
      if (variants.length < 2) {
        stats.skipped++;
        continue;
      }
      variants.sort((a, b) => b.ctr - a.ctr);
      const winner = variants[0];
      const runnerUp = variants[1];
      const lift = (winner.ctr - runnerUp.ctr) / Math.max(runnerUp.ctr, 0.001);
      if (lift < MIN_LIFT) {
        stats.skipped++;
        continue;
      }

      const z = zTest(winner, runnerUp);
      if (z < Z_THRESHOLD) {
        stats.skipped++;
        continue;
      }

      // Promote — update tools or niche_pages with winning variant's title/meta
      const ok = await promoteWinner(supabase, slug, winner);
      if (ok) stats.promoted++;
      else stats.skipped++;
    }
  } catch (err) {
    stats.errors.push(err instanceof Error ? err.message : String(err));
  }

  return res.status(200).json({
    ok: stats.errors.length === 0,
    duration_ms: Date.now() - startedAt,
    ...stats,
  });
}

interface SeoVariant {
  title: string;
  meta: string;
  score: number;
  template: number;
}

async function promoteWinner(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  slug: string,
  winner: VariantStats,
): Promise<boolean> {
  const { data: tool } = await supabase
    .from('tools')
    .select('id, slug, seo_variants')
    .eq('slug', slug)
    .single();

  const target = tool ? 'tools' : 'niche_pages';
  const { data: niche } = !tool
    ? await supabase
        .from('niche_pages')
        .select('id, slug, seo_variants')
        .eq('slug', slug)
        .single()
    : { data: null };

  const record = (tool ?? niche) as
    | { id: string; slug: string; seo_variants: SeoVariant[] | null }
    | null;
  if (!record) return false;

  const winnerVariant = record.seo_variants?.[winner.variant_index];
  if (!winnerVariant) return false;

  const { error: upd } = await supabase
    .from(target)
    .update({
      seo_title: winnerVariant.title,
      seo_meta_description: winnerVariant.meta,
    })
    .eq('id', record.id);
  if (upd) return false;

  await supabase.from('ab_experiments').upsert(
    {
      resource_type: target === 'tools' ? 'tool' : 'niche_page',
      resource_slug: slug,
      variant_index: winner.variant_index,
      status: 'winner',
      promoted_at: new Date().toISOString(),
      impressions_at_decision: winner.impressions,
      clicks_at_decision: winner.clicks,
      ctr_at_decision: Number((winner.ctr * 100).toFixed(3)),
    },
    { onConflict: 'resource_type,resource_slug,variant_index' },
  );

  return true;
}

function zTest(a: VariantStats, b: VariantStats): number {
  const p1 = a.ctr;
  const p2 = b.ctr;
  const n1 = a.impressions;
  const n2 = b.impressions;
  const pPool = (a.clicks + b.clicks) / (n1 + n2);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  if (se === 0) return 0;
  return (p1 - p2) / se;
}
