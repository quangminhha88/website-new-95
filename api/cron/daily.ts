/**
 * Cron: refresh analytics materialized views + recompute EPC.
 * Schedule: daily at 03:00 UTC (vercel.json crons).
 *
 * Vercel sends a x-vercel-cron header — use it as a shared secret to
 * prevent unauthorized invocation.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin } from '../_lib/supabase';

const ASSUMED_CONVERSION_RATE = 0.02;
const CONFIDENCE_HALF_LIFE = 100;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Cron auth — Vercel sends `Authorization: Bearer <CRON_SECRET>`
  const authHeader = req.headers.authorization;
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const supabase = getSupabaseAdmin();
  const startedAt = Date.now();
  const stats = { tools_updated: 0, matviews_refreshed: 0, errors: [] as string[] };

  // 1. Recompute EPC for every approved tool
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: tools, error } = await supabase
      .from('tools')
      .select('id, slug, commission_estimate')
      .eq('moderation_status', 'approved');
    if (error) throw error;

    for (const tool of tools ?? []) {
      const { count } = await supabase
        .from('affiliate_clicks')
        .select('*', { count: 'exact', head: true })
        .eq('tool_id', tool.id)
        .gte('clicked_at', since);

      const clicks = count ?? 0;
      const conversions = Math.round(clicks * ASSUMED_CONVERSION_RATE);
      const revenue = conversions * (tool.commission_estimate ?? 0);
      const epc = clicks > 0 ? revenue / clicks : 0;
      const confidence = 1 - Math.exp(-clicks / CONFIDENCE_HALF_LIFE);

      await supabase.from('tool_epc').upsert(
        {
          tool_id: tool.id,
          tool_slug: tool.slug,
          clicks_30d: clicks,
          conversions_30d: conversions,
          revenue_30d: Number(revenue.toFixed(2)),
          epc: Number(epc.toFixed(4)),
          confidence: Number(confidence.toFixed(3)),
          computed_at: new Date().toISOString(),
        },
        { onConflict: 'tool_id' },
      );
      stats.tools_updated++;
    }
  } catch (err) {
    stats.errors.push(`epc: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Refresh materialized views
  try {
    const { error } = await supabase.rpc('refresh_analytics_matviews');
    if (error) throw error;
    stats.matviews_refreshed = 3;
  } catch (err) {
    stats.errors.push(`matviews: ${err instanceof Error ? err.message : String(err)}`);
  }

  return res.status(200).json({
    ok: stats.errors.length === 0,
    duration_ms: Date.now() - startedAt,
    ...stats,
  });
}
