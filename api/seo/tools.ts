/**
 * GET /api/seo/tools
 *
 * Returns a JSON feed of indexable tools for external integrations
 * (Algolia, Meilisearch, internal search index, etc).
 *
 * Response shape:
 *   { count, tools: [{ slug, name, url, description, category, lastModified }] }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin } from '../_lib/supabase';

const SITE_URL = process.env.APP_URL || 'https://saas-excellence.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = getSupabaseAdmin();

    const { data: tools, error } = await supabase
      .from('tools')
      .select('slug, name, description, tagline, updated_at, category_id, categories(name)')
      .order('updated_at', { ascending: false })
      .limit(1000);

    if (error) {
      return res.status(500).json({ error: 'Failed to load tools', detail: error.message });
    }

    const feed = (tools ?? []).map((t: any) => ({
      slug: t.slug,
      name: t.name,
      url: `${SITE_URL}/tools/${t.slug}`,
      description: t.tagline || t.description,
      category: t.categories?.name ?? null,
      lastModified: t.updated_at ?? new Date().toISOString(),
    }));

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json({ count: feed.length, tools: feed });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
