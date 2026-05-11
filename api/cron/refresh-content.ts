/**
 * POST /api/cron/refresh-content
 *
 * Picks up to BATCH_SIZE tools meeting any refresh trigger:
 *   STALE        — last update > 30 days ago
 *   LOW_CTR      — CTR < 1% with ≥ 200 impressions in 14 days
 *   LOW_QUALITY  — quality_score < 70
 *
 * Regenerates full_description / faqs_html / conversion_hook via Gemini
 * Flash, writes back with moderation_status='pending_review' so a human
 * approves before public visibility. Per-item failures are isolated.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin } from '../_lib/supabase';
import { aiContent } from '../../src/services/aiContentService';

const BATCH_SIZE = 8;
const STALE_DAYS = 30;
const LOW_CTR_THRESHOLD = 0.01;
const MIN_IMPRESSIONS = 200;
const LOW_QUALITY_THRESHOLD = 70;
const MODEL = 'gemini-2.0-flash';

interface ToolForRefresh {
  id: string;
  slug: string;
  name: string;
  category_id: string | null;
  description: string | null;
  features: string[] | null;
  pricing_data: Record<string, unknown> | null;
  updated_at: string;
}

interface ToolCandidate extends ToolForRefresh {
  reason: 'stale' | 'low_ctr' | 'low_quality';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization;
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const startedAt = Date.now();
  const supabase = getSupabaseAdmin();
  const stats = {
    candidates: 0,
    refreshed: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    const candidates = await pickCandidates(supabase);
    stats.candidates = candidates.length;
    console.log(`📝 ${candidates.length} candidates selected`);

    for (const tool of candidates) {
      const jobStart = Date.now();
      const { data: job } = await supabase
        .from('content_refresh_jobs')
        .insert({
          resource_type: 'tool',
          resource_id: tool.id,
          resource_slug: tool.slug,
          reason: tool.reason,
          status: 'running',
          started_at: new Date().toISOString(),
          ai_model: MODEL,
        })
        .select('id')
        .single();

      try {
        // Hybrid: refreshContent regenerates only the listed fields, each
        // with optimal model routing (Gemini draft / Claude polish / etc.)
        const refreshed = await aiContent.refreshContent(
          {
            name: tool.name,
            description: tool.description ?? undefined,
            features: tool.features ?? undefined,
            resourceSlug: tool.slug,
          },
          ['description', 'faqs', 'conversion_hook'],
        );

        if (!refreshed.data.description || !refreshed.data.faqs || !refreshed.data.conversion_hook) {
          throw new Error('Hybrid service returned incomplete payload');
        }

        const faqs_html = refreshed.data.faqs
          .map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`)
          .join('\n');

        const { error: upErr } = await supabase
          .from('tools')
          .update({
            full_description: refreshed.data.description,
            faqs_html,
            conversion_hook: refreshed.data.conversion_hook,
            moderation_status: 'pending_review', // human review gate
            updated_at: new Date().toISOString(),
          })
          .eq('id', tool.id);
        if (upErr) throw upErr;

        await supabase
          .from('content_refresh_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - jobStart,
            fields_updated: ['full_description', 'faqs_html', 'conversion_hook'],
            ai_model: refreshed.meta.polished ? 'hybrid' : 'gemini',
          })
          .eq('id', job!.id);

        await supabase.from('content_audit_logs').insert({
          resource_type: 'tool',
          resource_id: tool.id,
          resource_slug: tool.slug,
          action: 'regenerated',
          actor_email: 'cron@refresh-content',
          notes: `Refresh reason: ${tool.reason} · cost: $${refreshed.meta.costUsd.toFixed(4)}`,
        });

        stats.refreshed++;
        console.log(`✅ ${tool.slug} (${tool.reason}) cost $${refreshed.meta.costUsd.toFixed(4)}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stats.failed++;
        stats.errors.push(`${tool.slug}: ${message}`);
        await supabase
          .from('content_refresh_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - jobStart,
            error_message: message.slice(0, 500),
          })
          .eq('id', job!.id);
        console.error(`❌ ${tool.slug}: ${message}`);
      }
    }
  } catch (err) {
    stats.errors.push(`fatal: ${err instanceof Error ? err.message : String(err)}`);
  }

  return res.status(200).json({
    ok: stats.errors.length === 0,
    duration_ms: Date.now() - startedAt,
    ...stats,
  });
}

async function pickCandidates(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<ToolCandidate[]> {
  const staleThreshold = new Date(
    Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Low quality (highest priority — broken content out of public view)
  const lowQuality = await supabase
    .from('tools')
    .select('id, slug, name, category_id, description, features, pricing_data, updated_at')
    .eq('moderation_status', 'approved')
    .lt('quality_score', LOW_QUALITY_THRESHOLD)
    .order('quality_score', { ascending: true })
    .limit(BATCH_SIZE);

  const tagged: ToolCandidate[] = (lowQuality.data ?? []).map((t) => ({
    ...(t as ToolForRefresh),
    reason: 'low_quality' as const,
  }));
  if (tagged.length >= BATCH_SIZE) return tagged;

  // 2. Stale content
  const stale = await supabase
    .from('tools')
    .select('id, slug, name, category_id, description, features, pricing_data, updated_at')
    .eq('moderation_status', 'approved')
    .lt('updated_at', staleThreshold)
    .order('updated_at', { ascending: true })
    .limit(BATCH_SIZE - tagged.length);

  for (const t of stale.data ?? []) {
    if (!tagged.find((x) => x.id === (t as ToolForRefresh).id)) {
      tagged.push({ ...(t as ToolForRefresh), reason: 'stale' });
    }
  }
  if (tagged.length >= BATCH_SIZE) return tagged;

  // 3. Low CTR — compute from seo_metrics
  const { data: metrics } = await supabase
    .from('seo_metrics')
    .select('resource_slug, event_type')
    .gte('created_at', fourteenDaysAgo)
    .eq('page_type', 'tool')
    .not('resource_slug', 'is', null);

  const counts = new Map<string, { imp: number; clk: number }>();
  for (const m of metrics ?? []) {
    if (!m.resource_slug) continue;
    const c = counts.get(m.resource_slug) ?? { imp: 0, clk: 0 };
    if (m.event_type === 'impression') c.imp++;
    else if (m.event_type === 'affiliate_click') c.clk++;
    counts.set(m.resource_slug, c);
  }

  const lowCtrSlugs = Array.from(counts.entries())
    .filter(([, c]) => c.imp >= MIN_IMPRESSIONS && c.clk / c.imp < LOW_CTR_THRESHOLD)
    .map(([slug]) => slug)
    .filter((s) => !tagged.find((t) => t.slug === s))
    .slice(0, BATCH_SIZE - tagged.length);

  if (lowCtrSlugs.length > 0) {
    const { data: lowCtrTools } = await supabase
      .from('tools')
      .select('id, slug, name, category_id, description, features, pricing_data, updated_at')
      .in('slug', lowCtrSlugs);
    for (const t of lowCtrTools ?? []) {
      tagged.push({ ...(t as ToolForRefresh), reason: 'low_ctr' });
    }
  }

  return tagged;
}
