/**
 * Vercel serverless sitemap endpoint.
 *
 * Use this for fresh content between deploys — the static /sitemap.xml
 * generated at build time is the primary source. This endpoint is mainly
 * useful when you publish new tools/niches between deploys and want them
 * crawlable immediately.
 *
 * Cache: 1 hour CDN, 30 minutes browser.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  buildSitemapXml,
  buildSitemapIndex,
  defaultsForPath,
  type SitemapEntry,
} from '../src/seo/sitemap';
import {
  isToolIndexable,
  isNicheIndexable,
  isCategoryIndexable,
} from '../src/seo/indexability';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';

const STATIC_PAGES: SitemapEntry[] = [
  { url: '/', priority: 1.0, changefreq: 'daily' },
  { url: '/finder', priority: 0.9, changefreq: 'weekly' },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).send('Sitemap not configured');
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const entries: SitemapEntry[] = [...STATIC_PAGES];

    const [toolsRes, catsRes, nichesRes, comparisonsRes] = await Promise.all([
      supabase
        .from('tools')
        .select('slug, description, full_description, features, updated_at, alternatives_seo_content'),
      supabase.from('categories').select('slug, description, updated_at'),
      supabase
        .from('niche_pages')
        .select('slug, seo_title, seo_meta_description, seo_content_html, created_at'),
      supabase.from('comparisons').select('slug, created_at'),
    ]);

    for (const t of toolsRes.data ?? []) {
      if (!isToolIndexable(t as any).shouldIndex) continue;
      const lastmod = t.updated_at?.slice(0, 10);
      const path = `/tools/${t.slug}`;
      entries.push({ url: path, lastmod, ...defaultsForPath(path) });

      if (t.alternatives_seo_content && t.alternatives_seo_content.length > 500) {
        const alt = `/tools/${t.slug}/alternatives`;
        entries.push({ url: alt, lastmod, ...defaultsForPath(alt) });
      }
    }

    for (const c of catsRes.data ?? []) {
      if (!isCategoryIndexable(c as any).shouldIndex) continue;
      const path = `/category/${c.slug}`;
      entries.push({ url: path, lastmod: c.updated_at?.slice(0, 10), ...defaultsForPath(path) });
    }

    for (const n of nichesRes.data ?? []) {
      if (!isNicheIndexable(n as any).shouldIndex) continue;
      const path = `/best/${n.slug}`;
      entries.push({ url: path, lastmod: n.created_at?.slice(0, 10), ...defaultsForPath(path) });
    }

    for (const c of comparisonsRes.data ?? []) {
      const path = `/vs/${c.slug}`;
      entries.push({ url: path, lastmod: c.created_at?.slice(0, 10), ...defaultsForPath(path) });
    }

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400');

    if (entries.length <= 45_000) {
      return res.status(200).send(buildSitemapXml(entries));
    }
    const { index } = buildSitemapIndex(entries);
    return res.status(200).send(index);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).send(`Sitemap generation failed: ${msg}`);
  }
}
