/**
 * Sitemap entry types + XML builder.
 *
 * Shared between two consumers:
 *   1. scripts/generate-sitemap.ts — produces /public/sitemap.xml at build time
 *      (best for SEO: stable file, served from CDN)
 *   2. api/sitemap.ts — serves a fresh sitemap on demand for new content
 *      between builds (still indexable; Google fetches it on a schedule)
 *
 * For 100k+ URLs, see `buildSitemapIndex` which splits into chunks of 50k
 * (Google's per-sitemap limit).
 */
import { absoluteUrl } from './config';

export type ChangeFreq =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never';

export interface SitemapEntry {
  /** Path or absolute URL. Will be normalised to absolute. */
  url: string;
  /** ISO 8601. Defaults to today if omitted. */
  lastmod?: string;
  changefreq?: ChangeFreq;
  /** 0.0–1.0. Higher = more important. */
  priority?: number;
}

const SITEMAP_URL_LIMIT = 45_000; // safe under Google's 50k cap

/**
 * Build a single sitemap.xml document.
 * Throws if entries exceed the per-sitemap limit — caller should split first.
 */
export function buildSitemapXml(entries: SitemapEntry[]): string {
  if (entries.length > SITEMAP_URL_LIMIT) {
    throw new Error(
      `Sitemap has ${entries.length} entries, exceeds limit of ${SITEMAP_URL_LIMIT}. ` +
        `Use buildSitemapIndex() to split into chunks.`,
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const urls = entries
    .map((entry) => {
      const loc = absoluteUrl(entry.url);
      const lastmod = entry.lastmod ?? today;
      const parts = [
        '  <url>',
        `    <loc>${escapeXml(loc)}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
      ];
      if (entry.changefreq) parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
      if (entry.priority !== undefined) {
        parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
      }
      parts.push('  </url>');
      return parts.join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap-0.9">
${urls}
</urlset>`;
}

/**
 * Split a large entry list into multiple sitemaps + an index document.
 * Returns:
 *   - `index`: the sitemap_index.xml content
 *   - `sitemaps`: { filename, content }[] — write each to /public/
 */
export function buildSitemapIndex(
  entries: SitemapEntry[],
  baseFilename = 'sitemap',
): { index: string; sitemaps: { filename: string; content: string }[] } {
  const chunks: SitemapEntry[][] = [];
  for (let i = 0; i < entries.length; i += SITEMAP_URL_LIMIT) {
    chunks.push(entries.slice(i, i + SITEMAP_URL_LIMIT));
  }

  const today = new Date().toISOString().slice(0, 10);
  const sitemaps = chunks.map((chunk, i) => ({
    filename: `${baseFilename}-${i + 1}.xml`,
    content: buildSitemapXml(chunk),
  }));

  const indexBody = sitemaps
    .map(
      (s) =>
        `  <sitemap>\n    <loc>${absoluteUrl(`/${s.filename}`)}</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`,
    )
    .join('\n');

  const index = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap-0.9">
${indexBody}
</sitemapindex>`;

  return { index, sitemaps };
}

/**
 * Default priority/changefreq map by URL pattern.
 * Tweak these centrally rather than at each call site.
 */
export function defaultsForPath(path: string): { priority: number; changefreq: ChangeFreq } {
  if (path === '/' || path === '') return { priority: 1.0, changefreq: 'daily' };
  if (path.startsWith('/finder')) return { priority: 0.9, changefreq: 'weekly' };
  if (path.startsWith('/category/')) return { priority: 0.85, changefreq: 'weekly' };
  if (path.startsWith('/tools/') && path.endsWith('/alternatives')) {
    return { priority: 0.8, changefreq: 'weekly' };
  }
  if (path.startsWith('/tools/')) return { priority: 0.85, changefreq: 'weekly' };
  if (path.startsWith('/best/')) return { priority: 0.75, changefreq: 'weekly' };
  if (path.startsWith('/vs/')) return { priority: 0.7, changefreq: 'monthly' };
  return { priority: 0.5, changefreq: 'monthly' };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
