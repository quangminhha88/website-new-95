/**
 * Supabase client for browser components.
 * For serverless API functions, use api/_lib/supabase.ts (admin client).
 *
 * All read operations are wrapped in `withRetry` for resilience against
 * transient network/5xx failures.
 */
import { createClient } from '@supabase/supabase-js';
import { env, isConfigValid } from '@/config/env';
import { createLogger } from './logger';
import { withRetry } from './retry';

const log = createLogger('lib:supabase');

if (!isConfigValid() && !env.VITE_MOCK_SERVICES) {
  log.warn(
    'Supabase config invalid — using placeholder values. ' +
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.',
  );
}

export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Back-compat helper. Prefer importing `supabase` directly. */
export const getSupabaseClient = () => supabase;

// ── Retry-wrapped fetchers (used by hooks/useTools.ts) ──────────────────

export async function getTools() {
  return withRetry(
    async () => {
      const { data, error } = await supabase
        .from('tools')
        .select('*, categories(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    { label: 'getTools' },
  );
}

export async function getToolBySlug(slug: string) {
  return withRetry(
    async () => {
      const { data, error } = await supabase
        .from('tools')
        .select('*')
        .eq('slug', slug)
        .single();
      if (error) throw error;
      return data;
    },
    { label: `getToolBySlug:${slug}` },
  );
}

export async function getRelatedTools(categoryId: string, currentToolId: string) {
  return withRetry(
    async () => {
      const { data, error } = await supabase
        .from('tools')
        .select('id, name, slug, logo_url, tagline, category_id')
        .eq('category_id', categoryId)
        .neq('id', currentToolId)
        .limit(4);
      if (error) {
        log.warn('Failed to fetch related tools', error.message);
        return [];
      }
      return data ?? [];
    },
    { label: 'getRelatedTools' },
  );
}

export async function getNichePage(slug: string) {
  return withRetry(
    async () => {
      const { data, error } = await supabase
        .from('niche_pages')
        .select('*')
        .eq('slug', slug)
        .single();
      if (error) throw error;
      return data;
    },
    { label: `getNichePage:${slug}` },
  );
}
