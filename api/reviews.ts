/**
 * POST /api/reviews
 *
 * Public review submission endpoint. Always lands in moderation_status='pending';
 * an admin or the (later) email-verification flow will approve.
 *
 * Rate-limited 3 req / 10 min per IP — combats spam without blocking legit
 * users who edit-and-resubmit.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSupabaseAdmin } from './_lib/supabase';
import { rateLimit } from './_lib/rateLimit';

const schema = z.object({
  tool_id: z.string().uuid(),
  author_name: z.string().trim().min(2).max(80),
  author_email: z.string().trim().toLowerCase().email().max(254),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(30).max(5000),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? 'unknown';
  const allowed = await rateLimit(`review:${ip}`, 3, 10 * 60);
  if (!allowed) return res.status(429).json({ error: 'rate_limited' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_payload',
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('tool_reviews').insert({
    tool_id: parsed.data.tool_id,
    author_name: parsed.data.author_name,
    author_email: parsed.data.author_email,
    rating: parsed.data.rating,
    title: parsed.data.title ?? null,
    body: parsed.data.body,
    verification_token: randomUUID(),
    token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    moderation_status: 'pending',
  });

  if (error) {
    return res.status(500).json({ error: 'insert_failed', detail: error.message });
  }

  return res.status(201).json({ message: 'Review submitted. Pending moderation.' });
}
