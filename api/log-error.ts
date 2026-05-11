/**
 * POST /api/log-error  — ingestion endpoint for client-side errors.
 *
 * Validates payload with Zod, rate-limits per IP, dedupes via fingerprint,
 * inserts into error_logs. Always returns 204 (never errors back to the
 * client — error logging must not cause more errors).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getSupabaseAdmin } from './_lib/supabase';
import { rateLimit } from './_lib/rateLimit';

const errorSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(20_000).optional(),
  componentStack: z.string().max(10_000).optional(),
  source: z.enum(['render', 'event', 'async', 'api', 'query']),
  url: z.string().max(2000).optional(),
  pagePath: z.string().max(500).optional(),
  userAgent: z.string().max(500).optional(),
  visitorId: z.string().max(100).optional(),
  appVersion: z.string().max(50).optional(),
  environment: z.enum(['development', 'preview', 'production']).optional(),
  context: z.record(z.unknown()).optional(),
  fingerprint: z.string().max(100).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? 'unknown';
    const allowed = await rateLimit(`err:${ip}`, 30, 60); // 30/minute
    if (!allowed) return res.status(204).end();

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const parsed = errorSchema.safeParse(body);
    if (!parsed.success) return res.status(204).end();

    const supabase = getSupabaseAdmin();
    void supabase.from('error_logs').insert({
      message: parsed.data.message,
      stack: parsed.data.stack ?? null,
      component_stack: parsed.data.componentStack ?? null,
      source: parsed.data.source,
      url: parsed.data.url ?? null,
      page_path: parsed.data.pagePath ?? null,
      user_agent: parsed.data.userAgent ?? null,
      visitor_id: parsed.data.visitorId ?? null,
      app_version: parsed.data.appVersion ?? null,
      environment: parsed.data.environment ?? 'production',
      context: parsed.data.context ?? null,
      fingerprint: parsed.data.fingerprint ?? null,
    });
  } catch {
    // Swallow — endpoint must never throw to the client
  }

  return res.status(204).end();
}
