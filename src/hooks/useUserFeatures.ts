/**
 * User feature hooks — saved tools, collections, search history.
 *
 * All require an authenticated session. RLS on the underlying tables
 * enforces user_id = auth.uid() so the queries are safe even if the
 * client tries to query someone else's data.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import type { Tool } from '@/types/tool';

// ── Saved tools (bookmarks) ────────────────────────────────────────────

export interface SavedTool {
  id: number;
  user_id: string;
  tool_id: string;
  saved_at: string;
  notes: string | null;
  tool: Pick<Tool, 'id' | 'name' | 'slug' | 'logo_url' | 'tagline'>;
}

export function useSavedTools() {
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery<SavedTool[]>({
    queryKey: ['user', userId, 'saved-tools'],
    enabled: !!userId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_saved_tools')
        .select('id, user_id, tool_id, saved_at, notes, tool:tools(id, name, slug, logo_url, tagline)')
        .order('saved_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SavedTool[];
    },
  });
}

export function useToggleSavedTool() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const pushToast = useUIStore((s) => s.pushToast);

  return useMutation({
    mutationFn: async ({ toolId, save }: { toolId: string; save: boolean }) => {
      if (!userId) throw new Error('Not authenticated');
      if (save) {
        const { error } = await supabase
          .from('user_saved_tools')
          .insert({ user_id: userId, tool_id: toolId });
        if (error && error.code !== '23505') throw error; // ignore duplicate
      } else {
        const { error } = await supabase
          .from('user_saved_tools')
          .delete()
          .eq('user_id', userId)
          .eq('tool_id', toolId);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      pushToast(vars.save ? 'Saved to your collection' : 'Removed from collection', 'success');
      qc.invalidateQueries({ queryKey: ['user', userId, 'saved-tools'] });
    },
    onError: (err) => {
      pushToast(err instanceof Error ? err.message : 'Action failed', 'error');
    },
  });
}

export function useIsToolSaved(toolId: string | undefined) {
  const { data } = useSavedTools();
  return !!data?.find((s) => s.tool_id === toolId);
}

// ── Collections ───────────────────────────────────────────────────────

export interface Collection {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  share_slug: string | null;
  created_at: string;
  updated_at: string;
}

export function useCollections() {
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery<Collection[]>({
    queryKey: ['user', userId, 'collections'],
    enabled: !!userId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_collections')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Collection[];
    },
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: async (input: { name: string; description?: string; isPublic?: boolean }) => {
      if (!userId) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('user_collections')
        .insert({
          user_id: userId,
          name: input.name,
          description: input.description ?? null,
          is_public: input.isPublic ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Collection;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user', userId, 'collections'] }),
  });
}

export function useAddToCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ collectionId, toolId }: { collectionId: string; toolId: string }) => {
      const { error } = await supabase
        .from('user_collection_items')
        .insert({ collection_id: collectionId, tool_id: toolId });
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['collection', vars.collectionId, 'items'] });
    },
  });
}

// ── Search history ────────────────────────────────────────────────────

export function useSearchHistory(limit = 10) {
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery({
    queryKey: ['user', userId, 'search-history', limit],
    enabled: !!userId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_search_history')
        .select('id, query, searched_at, result_count, clicked_slugs')
        .order('searched_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRecordSearch() {
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: async ({
      query,
      resultCount,
      clickedSlugs,
    }: {
      query: string;
      resultCount?: number;
      clickedSlugs?: string[];
    }) => {
      if (!userId) return; // anonymous searches aren't recorded
      await supabase.from('user_search_history').insert({
        user_id: userId,
        query,
        result_count: resultCount ?? null,
        clicked_slugs: clickedSlugs ?? null,
      });
    },
  });
}
