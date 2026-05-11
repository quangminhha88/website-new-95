/**
 * Domain data hooks built on TanStack Query.
 *
 * Return shape kept compatible with the previous custom useQuery so the
 * call sites in pages don't need to change:
 *   { data, isLoading, error, refetch }
 *
 * If you need full TanStack power (mutations, optimistic updates, etc.),
 * use the underlying `useQuery` from '@tanstack/react-query' directly.
 */
import { useQuery as useTanstackQuery } from '@tanstack/react-query';
import { supabase, getToolBySlug, getRelatedTools } from '@/lib/supabase';
import type { Tool, Category, NichePage } from '@/types/tool';

interface CompatResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

function adapt<T>(q: ReturnType<typeof useTanstackQuery<T>>): CompatResult<T> {
  return {
    data: q.data ?? null,
    isLoading: q.isPending && q.fetchStatus !== 'idle',
    error: q.error as Error | null,
    refetch: q.refetch,
  };
}

// ── Tools ────────────────────────────────────────────────────────────────

export function useTool(slug: string | undefined): CompatResult<Tool> {
  return adapt(
    useTanstackQuery<Tool>({
      queryKey: ['tool', slug],
      enabled: !!slug,
      staleTime: 10 * 60 * 1000,
      queryFn: async () => {
        if (!slug) throw new Error('Slug is required');
        return (await getToolBySlug(slug)) as Tool;
      },
    }),
  );
}

export function useFeaturedTools(limit = 8): CompatResult<Tool[]> {
  return adapt(
    useTanstackQuery<Tool[]>({
      queryKey: ['tools', 'featured', limit],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('tools')
          .select('*')
          .order('name')
          .limit(limit);
        if (error) throw error;
        return (data ?? []) as Tool[];
      },
    }),
  );
}

export function useRelatedTools(
  categoryId: string | undefined,
  currentToolId: string | undefined,
): CompatResult<Tool[]> {
  return adapt(
    useTanstackQuery<Tool[]>({
      queryKey: ['tools', 'related', categoryId, currentToolId],
      enabled: !!categoryId && !!currentToolId,
      staleTime: 10 * 60 * 1000,
      queryFn: async () => {
        if (!categoryId || !currentToolId) return [];
        return (await getRelatedTools(categoryId, currentToolId)) as Tool[];
      },
    }),
  );
}

// ── Categories ──────────────────────────────────────────────────────────

export function useCategories(limit = 8): CompatResult<Category[]> {
  return adapt(
    useTanstackQuery<Category[]>({
      queryKey: ['categories', 'list', limit],
      staleTime: 10 * 60 * 1000,
      queryFn: async () => {
        const { data, error } = await supabase
          .from('categories')
          .select('*')
          .order('name')
          .limit(limit);
        if (error) throw error;
        return (data ?? []) as Category[];
      },
    }),
  );
}

export function useCategoryBySlug(slug: string | undefined): CompatResult<Category> {
  return adapt(
    useTanstackQuery<Category>({
      queryKey: ['category', 'slug', slug],
      enabled: !!slug,
      staleTime: 10 * 60 * 1000,
      queryFn: async () => {
        if (!slug) throw new Error('Slug is required');
        const { data, error } = await supabase
          .from('categories')
          .select('*')
          .eq('slug', slug)
          .single();
        if (error) throw error;
        return data as Category;
      },
    }),
  );
}

export function useCategoryById(id: string | undefined): CompatResult<Category> {
  return adapt(
    useTanstackQuery<Category>({
      queryKey: ['category', 'id', id],
      enabled: !!id,
      staleTime: 10 * 60 * 1000,
      queryFn: async () => {
        if (!id) throw new Error('Id is required');
        const { data, error } = await supabase
          .from('categories')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw error;
        return data as Category;
      },
    }),
  );
}

// ── Niche pages ────────────────────────────────────────────────────────

export function useNichePage(slug: string | undefined): CompatResult<NichePage> {
  return adapt(
    useTanstackQuery<NichePage>({
      queryKey: ['niche', slug],
      enabled: !!slug,
      staleTime: 10 * 60 * 1000,
      queryFn: async () => {
        if (!slug) throw new Error('Slug is required');
        const { data, error } = await supabase
          .from('niche_pages')
          .select('*')
          .eq('slug', slug)
          .single();
        if (error) throw error;
        return data as NichePage;
      },
    }),
  );
}

// ── Comparison ──────────────────────────────────────────────────────────

export function useComparisonTools(
  slug: string | undefined,
): CompatResult<{ toolA: Tool | null; toolB: Tool | null }> {
  return adapt(
    useTanstackQuery<{ toolA: Tool | null; toolB: Tool | null }>({
      queryKey: ['comparison', slug],
      enabled: !!slug,
      staleTime: 10 * 60 * 1000,
      queryFn: async () => {
        if (!slug) return { toolA: null, toolB: null };
        const [slugA, slugB] = slug.split('-vs-');
        const { data, error } = await supabase
          .from('tools')
          .select('*')
          .in('slug', [slugA, slugB]);
        if (error) throw error;
        const tools = (data ?? []) as Tool[];
        return {
          toolA: tools.find((t) => t.slug === slugA) ?? null,
          toolB: tools.find((t) => t.slug === slugB) ?? null,
        };
      },
    }),
  );
}
