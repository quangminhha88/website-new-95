/**
 * SEO event ingestion endpoint.
 * POST /api/seo/track  →  204 (fire-and-forget)
 *
 * Validates payload via Zod, then writes to seo_metrics.
 * Failures never bubble to the client — analytics must never break the page.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getSupabaseAdmin } from '../_lib/supabase';

const trackSchema = z.object({
  type: z.enum(['impression', 'dwell', 'affiliate_click']),
  pagePath: z.string().min(1).max(500),
  pageType: z.enum(['tool', 'niche', 'comparison', 'category', 'home', 'other']).default('other'),
  variantIndex: z.number().int().min(0).max(20).optional(),
  resourceSlug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/i).optional(),
  durationMs: z.number().int().min(0).max(60 * 60 * 1000).optional(), // cap at 1h
  targetSlug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/i).optional(),
  visitorId: z.string().min(8).max(64),
  referrer: z.string().max(500).optional(),
  timestamp: z.number().int().positive().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  let parsed: z.infer<typeof trackSchema>;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const result = trackSchema.safeParse(body);
    if (!result.success) {
      return res.status(400).json({ error: 'invalid_payload' });
    }
    parsed = result.data;
  } catch {
    return res.status(400).json({ error: 'invalid_json' });
  }

  // Fire-and-forget — return 204 immediately so the page never waits
  try {
    const supabase = getSupabaseAdmin();
    void supabase.from('seo_metrics').insert({
      event_type: parsed.type,
      page_path: parsed.pagePath,
      page_type: parsed.pageType,
      variant_index: parsed.variantIndex ?? null,
      resource_slug: parsed.resourceSlug ?? null,
      duration_ms: parsed.durationMs ?? null,
      target_slug: parsed.targetSlug ?? null,
      visitor_id: parsed.visitorId,
      referrer: parsed.referrer ?? null,
      meta: parsed.meta ?? null,
      created_at: new Date(parsed.timestamp ?? Date.now()).toISOString(),
    });
  } catch {
    // Swallow — analytics must never break the user's experience
  }

  return res.status(204).end();
}
