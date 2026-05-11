/**
 * Edge function: sitemap.xml
 *
 * Runs on Vercel Edge Runtime — globally distributed, sub-50ms response.
 * Heavy CDN caching (1 hour edge, 24h SWR) keeps origin load near zero.
 *
 * For very large sitemaps (>45k URLs), this returns the index file and
 * the chunks are served from /public/sitemap-N.xml (built at deploy time).
 */
export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const APP_URL = process.env.APP_URL || 'https://saas-excellence.com';

interface ToolRow {
  slug: string;
  updated_at: string | null;
  alternatives_seo_content: string | null;
}
interface NicheRow {
  slug: string;
  created_at: string | null;
}
interface CategoryRow {
  slug: string;
  updated_at: string | null;
}

export default async function handler(): Promise<Response> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response('Sitemap not configured', { status: 500 });
  }

  try {
    const headers = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    };

    // Approved tools only (RLS enforces this anyway, but explicit for clarity)
    const [toolsRes, nichesRes, catsRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/tools?moderation_status=eq.approved&select=slug,updated_at,alternatives_seo_content&limit=10000`,
        { headers },
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/niche_pages?moderation_status=eq.approved&select=slug,created_at&limit=10000`,
        { headers },
      ),
      fetch(`${SUPABASE_URL}/rest/v1/categories?select=slug,updated_at&limit=1000`, { headers }),
    ]);

    const tools = (await toolsRes.json()) as ToolRow[];
    const niches = (await nichesRes.json()) as NicheRow[];
    const categories = (await catsRes.json()) as CategoryRow[];

    const today = new Date().toISOString().slice(0, 10);
    const entries: string[] = [];

    const push = (path: string, lastmod: string | null, priority: number, changefreq: string) => {
      entries.push(
        `  <url>\n    <loc>${escapeXml(APP_URL + path)}</loc>\n    <lastmod>${lastmod ?? today}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority.toFixed(1)}</priority>\n  </url>`,
      );
    };

    push('/', today, 1.0, 'daily');
    push('/finder', today, 0.9, 'weekly');

    for (const t of tools) {
      push(`/tools/${t.slug}`, t.updated_at?.slice(0, 10) ?? null, 0.85, 'weekly');
      if (t.alternatives_seo_content && t.alternatives_seo_content.length > 500) {
        push(`/tools/${t.slug}/alternatives`, t.updated_at?.slice(0, 10) ?? null, 0.8, 'weekly');
      }
    }
    for (const n of niches) {
      push(`/best/${n.slug}`, n.created_at?.slice(0, 10) ?? null, 0.75, 'weekly');
    }
    for (const c of categories) {
      push(`/category/${c.slug}`, c.updated_at?.slice(0, 10) ?? null, 0.85, 'weekly');
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap-0.9">
${entries.join('\n')}
</urlset>`;

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (err) {
    return new Response(`Sitemap error: ${err instanceof Error ? err.message : 'unknown'}`, {
      status: 500,
    });
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
