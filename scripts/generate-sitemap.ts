/**
 * Build-time sitemap generator.
 *
 * Run via `npm run sitemap` (or as part of vercel-build).
 * Output: /public/sitemap.xml + /public/sitemap-N.xml chunks if large.
 *
 * This is the *primary* sitemap path — Google fetches it from the CDN, no
 * Function invocations, no Supabase load. The /api/sitemap endpoint exists
 * only for previewing fresh content between deploys.
 *
 * Filters out non-indexable pages (thin tools, missing niches, etc) using
 * the same rules as the SEO component, so robots-blocked pages don't bloat
 * the index file.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'fs';
import path from 'path';
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
import type { Tool, Category, NichePage } from '../src/types/tool';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const STATIC_PAGES: SitemapEntry[] = [
  { url: '/', priority: 1.0, changefreq: 'daily' },
  { url: '/finder', priority: 0.9, changefreq: 'weekly' },
];

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const all: T[] = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function buildEntries(): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = [...STATIC_PAGES];

  // ── Tools ─────────────────────────────────────────────────────────
  const tools = await fetchAll<
    Pick<Tool, 'slug' | 'description' | 'full_description' | 'features' | 'updated_at' | 'alternatives_seo_content'>
  >('tools', 'slug, description, full_description, features, updated_at, alternatives_seo_content');

  let skippedTools = 0;
  for (const t of tools) {
    const verdict = isToolIndexable(t as unknown as Tool);
    if (!verdict.shouldIndex) {
      skippedTools++;
      continue;
    }
    const lastmod = t.updated_at ? t.updated_at.slice(0, 10) : undefined;
    const path = `/tools/${t.slug}`;
    entries.push({ url: path, lastmod, ...defaultsForPath(path) });

    // Alternatives page (only if content exists)
    if (t.alternatives_seo_content && t.alternatives_seo_content.length > 500) {
      const altPath = `/tools/${t.slug}/alternatives`;
      entries.push({ url: altPath, lastmod, ...defaultsForPath(altPath) });
    }
  }
  console.log(`✅ Tools: ${tools.length - skippedTools} indexable, ${skippedTools} skipped`);

  // ── Categories ────────────────────────────────────────────────────
  const categories = await fetchAll<Category>(
    'categories',
    'slug, name, description, updated_at',
  );
  let skippedCats = 0;
  for (const c of categories) {
    if (!isCategoryIndexable(c).shouldIndex) {
      skippedCats++;
      continue;
    }
    const lastmod = c.updated_at?.slice(0, 10);
    const path = `/category/${c.slug}`;
    entries.push({ url: path, lastmod, ...defaultsForPath(path) });
  }
  console.log(`✅ Categories: ${categories.length - skippedCats} indexable, ${skippedCats} skipped`);

  // ── Niche pages ───────────────────────────────────────────────────
  const niches = await fetchAll<NichePage>(
    'niche_pages',
    'slug, seo_title, seo_meta_description, seo_content_html, created_at',
  );
  let skippedNiches = 0;
  for (const n of niches) {
    if (!isNicheIndexable(n).shouldIndex) {
      skippedNiches++;
      continue;
    }
    const lastmod = n.created_at?.slice(0, 10);
    const path = `/best/${n.slug}`;
    entries.push({ url: path, lastmod, ...defaultsForPath(path) });
  }
  console.log(`✅ Niche pages: ${niches.length - skippedNiches} indexable, ${skippedNiches} skipped`);

  // ── Comparisons ───────────────────────────────────────────────────
  try {
    const comparisons = await fetchAll<{ slug: string; created_at?: string }>(
      'comparisons',
      'slug, created_at',
    );
    for (const c of comparisons) {
      const lastmod = c.created_at?.slice(0, 10);
      const path = `/vs/${c.slug}`;
      entries.push({ url: path, lastmod, ...defaultsForPath(path) });
    }
    console.log(`✅ Comparisons: ${comparisons.length} indexable`);
  } catch {
    console.log('⚠ Skipping comparisons (table may not exist)');
  }

  return entries;
}

async function main() {
  console.log('🗺  Building sitemap...');
  const entries = await buildEntries();
  console.log(`📊 Total: ${entries.length} URLs`);

  const publicDir = path.resolve(process.cwd(), 'public');
  if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

  // Wipe old sitemap-*.xml files so stale chunks don't linger
  for (const f of readdirSync(publicDir)) {
    if (/^sitemap(-\d+)?\.xml$/.test(f) || f === 'sitemap_index.xml') {
      rmSync(path.join(publicDir, f));
    }
  }

  const SPLIT_THRESHOLD = 45_000;
  if (entries.length <= SPLIT_THRESHOLD) {
    const xml = buildSitemapXml(entries);
    writeFileSync(path.join(publicDir, 'sitemap.xml'), xml, 'utf8');
    console.log(`✅ Wrote /public/sitemap.xml (${entries.length} URLs)`);
  } else {
    const { index, sitemaps } = buildSitemapIndex(entries);
    writeFileSync(path.join(publicDir, 'sitemap.xml'), index, 'utf8');
    for (const s of sitemaps) {
      writeFileSync(path.join(publicDir, s.filename), s.content, 'utf8');
    }
    console.log(`✅ Wrote sitemap index + ${sitemaps.length} chunks`);
  }
}

main().catch((err) => {
  console.error('❌ Sitemap generation failed:', err);
  process.exit(1);
});
