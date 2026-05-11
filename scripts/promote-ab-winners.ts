/**
 * Weekly AB winner promotion job.
 *
 * For each (resource, variant) in seo_metrics over the last 14 days:
 *   1. Compute CTR (clicks / impressions)
 *   2. If a variant has ≥ MIN_IMPRESSIONS and is significantly better
 *      than the current control, promote it: write `status=winner` to
 *      ab_experiments and update the resource's `seo_title`/`seo_meta`.
 *
 * Statistical significance check uses a simple Z-test on two proportions
 * (good enough for typical SEO traffic — full Bayesian would be overkill).
 *
 * Run via: `npm run ab:promote` (manual) or schedule weekly via cron.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Missing Supabase credentials');
const supabase = createClient(url, key);

const MIN_IMPRESSIONS = 200;          // need this many before promoting
const MIN_LIFT = 0.10;                // winner must beat control by ≥10%
const Z_THRESHOLD = 1.96;             // 95% confidence

interface VariantStats {
  resource_slug: string;
  variant_index: number;
  impressions: number;
  clicks: number;
  ctr: number;
}

interface SeoVariant {
  title: string;
  meta: string;
  score: number;
  template: number;
}

async function main() {
  console.log('🎯 AB winner promotion — running...');

  // 1. Aggregate variant performance from the last 14 days
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: events, error } = await supabase
    .from('seo_metrics')
    .select('resource_slug, variant_index, event_type')
    .gte('created_at', since)
    .not('variant_index', 'is', null)
    .not('resource_slug', 'is', null);
  if (error) throw error;

  // Group by (slug, variant)
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

  // 2. Group by resource_slug → find best variant per resource
  const bySlug = new Map<string, VariantStats[]>();
  for (const stat of grouped.values()) {
    if (stat.impressions < MIN_IMPRESSIONS) continue;
    const arr = bySlug.get(stat.resource_slug) ?? [];
    arr.push(stat);
    bySlug.set(stat.resource_slug, arr);
  }

  let promoted = 0;
  let skipped = 0;

  for (const [slug, variants] of bySlug.entries()) {
    if (variants.length < 2) {
      skipped++;
      continue;
    }

    variants.sort((a, b) => b.ctr - a.ctr);
    const winner = variants[0];
    const runnerUp = variants[1];

    const lift = (winner.ctr - runnerUp.ctr) / Math.max(runnerUp.ctr, 0.001);
    if (lift < MIN_LIFT) {
      console.log(`⏭  ${slug} — top variant only ${(lift * 100).toFixed(1)}% better, skipping`);
      skipped++;
      continue;
    }

    // Z-test for two proportions
    const z = zTest(winner, runnerUp);
    if (z < Z_THRESHOLD) {
      console.log(`⏭  ${slug} — not statistically significant (z=${z.toFixed(2)})`);
      skipped++;
      continue;
    }

    // 3. Promote winner: update tools/niche_pages with the winning variant's title+meta
    const promotedOk = await promoteWinner(slug, winner);
    if (promotedOk) {
      console.log(
        `✅ ${slug} — promoted variant ${winner.variant_index} ` +
          `(CTR ${(winner.ctr * 100).toFixed(2)}% vs ${(runnerUp.ctr * 100).toFixed(2)}%, z=${z.toFixed(2)})`,
      );
      promoted++;
    } else {
      skipped++;
    }
  }

  console.log(`\n📊 Done: ${promoted} promoted, ${skipped} skipped (insufficient data or no clear winner)`);
}

async function promoteWinner(slug: string, winner: VariantStats): Promise<boolean> {
  // Try tools first, fall back to niche_pages
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
  if (upd) {
    console.error(`  ❌ Update failed: ${upd.message}`);
    return false;
  }

  // Record in ab_experiments
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

/** Two-proportion Z-test. */
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

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
