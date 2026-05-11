/**
 * Affiliate redirect handler.
 * GET /api/redirect/:slug?src=...
 *
 *   1. Validate slug + src
 *   2. Look up affiliate_url (or fallback to website_url)
 *   3. Best-effort log click to affiliate_clicks
 *   4. 302 redirect
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getSupabaseAdmin } from '../_lib/supabase';

const slugSchema = z.string().regex(/^[a-z0-9-]+$/, 'Invalid slug format').max(120);
const sourceSchema = z.string().regex(/^[a-z0-9_-]*$/i, 'Invalid source').max(50).default('direct');
const ctaVariantSchema = z
  .enum(['primary', 'secondary', 'featured', 'sticky', 'urgency', 'discount'])
  .optional();
const variantIdxSchema = z.coerce.number().int().min(0).max(20).optional();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const slugResult = slugSchema.safeParse(req.query.slug);
  if (!slugResult.success) {
    return res.status(400).json({ error: 'invalid_slug' });
  }
  const slug = slugResult.data;

  const sourceResult = sourceSchema.safeParse(req.query.src ?? 'direct');
  const source = sourceResult.success ? sourceResult.data : 'direct';
  const ctaVariantType = ctaVariantSchema.safeParse(req.query.cv).data;
  const ctaVariantIndex = variantIdxSchema.safeParse(req.query.vi).data;

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown';
  const ua = (req.headers['user-agent'] as string)?.slice(0, 500) || 'unknown';

  try {
    const supabase = getSupabaseAdmin();

    const { data: tool } = await supabase
      .from('tools')
      .select('id, slug, affiliate_url, website_url, fallback_url')
      .eq('slug', slug)
      .single();

    const destination = tool?.affiliate_url || tool?.website_url || tool?.fallback_url;

    if (!destination) {
      res.setHeader('Location', '/');
      return res.status(302).end();
    }

    // Validate destination is a valid http(s) URL before redirecting
    try {
      const url = new URL(destination);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('non-http protocol');
      }
    } catch {
      res.setHeader('Location', '/');
      return res.status(302).end();
    }

    // Fire-and-forget click logs — both tables, fail silently
    if (tool?.id) {
      void supabase
        .from('affiliate_clicks')
        .insert({
          tool_id: tool.id,
          tool_slug: slug,
          source,
          ip,
          user_agent: ua,
          clicked_at: new Date().toISOString(),
        })
        .then(() => {});

      void supabase
        .from('seo_metrics')
        .insert({
          event_type: 'affiliate_click',
          page_type: 'tool',
          resource_slug: slug,
          cta_variant_index: ctaVariantIndex ?? null,
          cta_variant_type: ctaVariantType ?? null,
          created_at: new Date().toISOString(),
        })
        .then(() => {});
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Location', destination);
    return res.status(302).end();
  } catch {
    res.setHeader('Location', '/');
    return res.status(302).end();
  }
}
