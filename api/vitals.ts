/**
 * Web Vitals ingestion endpoint.
 * POST /api/vitals → 204
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getSupabaseAdmin } from './_lib/supabase';

const vitalSchema = z.object({
  name: z.enum(['LCP', 'FID', 'INP', 'CLS', 'TTFB', 'FCP']),
  value: z.number().min(0).max(60_000),
  rating: z.enum(['good', 'needs-improvement', 'poor']),
  pagePath: z.string().min(1).max(500),
  navigationType: z.string().optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const parsed = vitalSchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });

    const supabase = getSupabaseAdmin();
    void supabase.from('web_vitals').insert({
      name: parsed.data.name,
      value: parsed.data.value,
      rating: parsed.data.rating,
      page_path: parsed.data.pagePath,
      navigation_type: parsed.data.navigationType ?? null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Swallow — vitals must never error to the client
  }

  return res.status(204).end();
}
