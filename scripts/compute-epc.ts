/**
 * Daily EPC (Earnings Per Click) computation.
 *
 * For each tool, computes 30-day:
 *   clicks = count(affiliate_clicks WHERE tool_id = X)
 *   conversions = count(affiliate_clicks WHERE converted = true)
 *   revenue = sum(commission_value)
 *   epc = revenue / clicks
 *   confidence = 1 - exp(-clicks / 100)   ← saturates near 1.0 at ~500 clicks
 *
 * Writes to tool_epc table (upsert).
 *
 * Conversion data: if you don't have a postback yet, this falls back to
 * a synthetic "expected EPC" using commission_estimate and a rough 2%
 * conversion rate — better than nothing for ranking new tools.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Missing Supabase credentials');
const supabase = createClient(url, key);

const ASSUMED_CONVERSION_RATE = 0.02;   // 2% — used when no postback data
const CONFIDENCE_HALF_LIFE = 100;       // clicks for 50% confidence

interface ToolRow {
  id: string;
  slug: string;
  commission_estimate: number | null;
}

async function main() {
  console.log('💰 EPC computation — running...');

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: tools, error } = await supabase
    .from('tools')
    .select('id, slug, commission_estimate')
    .eq('moderation_status', 'approved');
  if (error) throw error;

  let updated = 0;
  for (const tool of (tools ?? []) as ToolRow[]) {
    // Count clicks
    const { count: clicks } = await supabase
      .from('affiliate_clicks')
      .select('*', { count: 'exact', head: true })
      .eq('tool_id', tool.id)
      .gte('clicked_at', since);

    const clickCount = clicks ?? 0;

    // If you have a `converted` column on affiliate_clicks, query that too.
    // For now: synthetic conversion + commission estimate.
    const conversions = Math.round(clickCount * ASSUMED_CONVERSION_RATE);
    const revenue = conversions * (tool.commission_estimate ?? 0);
    const epc = clickCount > 0 ? revenue / clickCount : 0;
    const confidence = 1 - Math.exp(-clickCount / CONFIDENCE_HALF_LIFE);

    const { error: upErr } = await supabase.from('tool_epc').upsert(
      {
        tool_id: tool.id,
        tool_slug: tool.slug,
        clicks_30d: clickCount,
        conversions_30d: conversions,
        revenue_30d: Number(revenue.toFixed(2)),
        epc: Number(epc.toFixed(4)),
        confidence: Number(confidence.toFixed(3)),
        computed_at: new Date().toISOString(),
      },
      { onConflict: 'tool_id' },
    );

    if (upErr) {
      console.error(`  ❌ ${tool.slug}: ${upErr.message}`);
      continue;
    }
    updated++;
  }

  console.log(`✅ Updated EPC for ${updated} tools`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
