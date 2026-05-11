/**
 * POST /api/recommend
 * Body: { query: string, limit?: number, excludeSlug?: string }
 * Hybrid: Gemini embedding → match_tools_semantic RPC.
 * Falls back to keyword-only FTS if embedding fails.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getSupabaseAdmin } from './_lib/supabase';
import { rateLimit } from './_lib/rateLimit';
import { embedText } from '../src/lib/embeddings';

const bodySchema = z.object({
  query: z.string().min(2).max(500),
  limit: z.number().int().min(1).max(20).optional(),
  excludeSlug: z.string().max(200).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? 'unknown';
  const ok = await rateLimit(`rec:${ip}`, 30, 60);
  if (!ok) return res.status(429).json({ error: 'rate_limited' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  const { query, limit = 8, excludeSlug } = parsed.data;

  const supabase = getSupabaseAdmin();
  let excludeId: string | null = null;
  if (excludeSlug) {
    const { data } = await supabase.from('tools').select('id').eq('slug', excludeSlug).single();
    excludeId = data?.id ?? null;
  }

  let results: unknown[] = [];
  try {
    const embedding = await embedText(query);
    const { data, error } = await supabase.rpc('match_tools_semantic', {
      query_embedding: embedding,
      query_text: query,
      match_threshold: 0.4,
      match_count: limit,
      exclude_id: excludeId,
    });
    if (error) throw error;
    results = data ?? [];
  } catch {
    const { data } = await supabase.rpc('search_tools_fts', {
      query_text: query,
      match_count: limit,
    });
    results = (data ?? []).filter((r: { slug: string }) => r.slug !== excludeSlug);
  }

  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  return res.status(200).json({ results });
}
