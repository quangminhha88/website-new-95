/**
 * Server-only Supabase client + cached fetchers.
 *
 * SERVER-ONLY. Don't import from any 'use client' file — React's `cache()`
 * is a Server Components feature, and `SUPABASE_SERVICE_ROLE_KEY` should
 * never end up in a client bundle. Bundler will error if you try.
 *
 * Each fetcher is wrapped in `cache()` so identical calls inside one
 * render pass deduplicate to a single HTTP request to Supabase. That's
 * how a page can call `getCategoryByIdServer(id)` from both
 * `generateMetadata` and the page body without paying twice.
 *
 * Signature parity with src/lib/supabase.ts
 * ═════════════════════════════════════════
 *   Client                          Server
 *   ────────────────────────        ───────────────────────────────
 *   getToolBySlug(slug)        →    getToolBySlugServer(slug)
 *   getRelatedTools(cat, id)   →    getRelatedToolsServer(cat, id)
 *   getNichePage(slug)         →    getNichePageServer(slug)
 *   (useCategoryById hook)     →    getCategoryByIdServer(id)
 *   (useCategoryBySlug hook)   →    getCategoryBySlugServer(slug)
 *
 * Each pair uses the SAME `select(...)` projection as the client so
 * downstream code can drop in either.
 *
 * One deliberate divergence — moderation filter
 * ─────────────────────────────────────────────
 * The client uses the anon key + RLS policies to hide unapproved tools
 * (RLS policy `tools_public_read_approved` filters to
 * `moderation_status = 'approved'`). The server uses the service-role
 * key, which bypasses RLS. Without an explicit filter here, every
 * server-rendered tool page would serve drafts/rejected rows publicly.
 *
 * So: tool fetchers add `.eq('moderation_status', 'approved')`.
 * Behaviourally identical to the client; structurally one extra clause.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cache } from 'react';

/**
 * Returns the Supabase service-role client, or `null` during `next build`
 * when env vars aren't set (the build phase doesn't always have prod
 * env wired). At production runtime, missing env still throws — that's
 * a real misconfiguration that should fail loudly.
 */
const getClient = cache((): SupabaseClient | null => {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) {
    if (process.env.NEXT_PHASE === 'phase-production-build') return null;
    throw new Error(
      'supabase-server: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the server environment',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});

// ── Tools ──────────────────────────────────────────────────────────────

/**
 * Mirrors `getToolBySlug` in src/lib/supabase.ts.
 * Same `select('*')`, same `.eq('slug', slug).single()`.
 * Adds `moderation_status='approved'` because service-role bypasses RLS.
 * Returns `null` instead of throwing on miss (server pages call notFound()).
 */
export const getToolBySlugServer = cache(async (slug: string) => {
  const client = getClient();
  if (!client) return null;
  const { data, error } = await client
    .from('tools')
    .select('*')
    .eq('slug', slug)
    .eq('moderation_status', 'approved')
    .single();
  if (error) return null;
  return data;
});

/**
 * Mirrors `getRelatedTools` in src/lib/supabase.ts.
 * Same narrow column projection: id, name, slug, logo_url, tagline, category_id.
 * Same `.neq('id', currentToolId).limit(4)`.
 * Parameter name matches client: `currentToolId` (not `excludeId`).
 */
export const getRelatedToolsServer = cache(
  async (categoryId: string, currentToolId: string) => {
    const client = getClient();
    if (!client) return [];
    const { data } = await client
      .from('tools')
      .select('id, name, slug, logo_url, tagline, category_id')
      .eq('category_id', categoryId)
      .eq('moderation_status', 'approved')
      .neq('id', currentToolId)
      .limit(4);
    return data ?? [];
  },
);

/**
 * Server-only utility — drives `generateStaticParams` for /tools/[slug].
 * No client equivalent (client never needs the full slug list).
 */
export const getAllToolSlugsServer = cache(async () => {
  const client = getClient();
  if (!client) return [];
  const { data } = await client
    .from('tools')
    .select('slug')
    .eq('moderation_status', 'approved');
  return ((data ?? []) as Array<{ slug: string }>).map((r) => r.slug);
});

/**
 * Like getAllToolSlugsServer but capped — used by generateStaticParams
 * for /tools/[slug]. Returns the top-N tools ordered by avg_rating desc
 * so they get prerendered at build time; the rest fall back to ISR via
 * `revalidate = 3600` on the page itself.
 */
export const getTopToolSlugsServer = cache(async (limit = 200) => {
  const client = getClient();
  if (!client) return [];
  const { data } = await client
    .from('tools')
    .select('slug')
    .eq('moderation_status', 'approved')
    .order('avg_rating', { ascending: false, nullsFirst: false })
    .limit(limit);
  return ((data ?? []) as Array<{ slug: string }>).map((r) => r.slug);
});

// ── Categories ─────────────────────────────────────────────────────────

/**
 * Mirrors the `useCategoryById` hook query in src/hooks/useTools.ts.
 * Same `.select('*').eq('id', id).single()`.
 */
export const getCategoryByIdServer = cache(async (id: string) => {
  const client = getClient();
  if (!client) return null;
  const { data } = await client
    .from('categories')
    .select('*')
    .eq('id', id)
    .single();
  return data ?? null;
});

/**
 * Mirrors the `useCategoryBySlug` hook query in src/hooks/useTools.ts.
 * Same `.select('*').eq('slug', slug).single()`.
 */
export const getCategoryBySlugServer = cache(async (slug: string) => {
  const client = getClient();
  if (!client) return null;
  const { data } = await client
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .single();
  return data ?? null;
});

// ── Niche pages ────────────────────────────────────────────────────────

/**
 * Mirrors `getNichePage` in src/lib/supabase.ts.
 * Same `.select('*').eq('slug', slug).single()`.
 */
export const getNichePageServer = cache(async (slug: string) => {
  const client = getClient();
  if (!client) return null;
  const { data } = await client
    .from('niche_pages')
    .select('*')
    .eq('slug', slug)
    .single();
  return data ?? null;
});

/**
 * Server-only utility — drives `generateStaticParams` for /best/[slug].
 */
export const getAllNicheSlugsServer = cache(async () => {
  const client = getClient();
  if (!client) return [];
  const { data } = await client.from('niche_pages').select('slug');
  return ((data ?? []) as Array<{ slug: string }>).map((r) => r.slug);
});
