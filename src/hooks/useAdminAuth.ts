/**
 * Admin auth hook.
 *
 * Wraps useAuthStore + a TanStack Query that fetches the user's profile
 * row to determine their role. Returns:
 *
 *   { user, profile, role, isAdmin, isEditor, isLoading }
 *
 * Used by <AdminGuard> to gate the /admin section, and by individual
 * admin pages to conditionally render.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import type { Profile } from '@/types/tool';

interface AdminAuthResult {
  user: { id: string; email: string | null } | null;
  profile: Profile | null;
  role: Profile['role'] | null;
  isAdmin: boolean;
  isEditor: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

export function useAdminAuth(): AdminAuthResult {
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);
  const signOut = useAuthStore((s) => s.signOut);

  const profileQuery = useQuery<Profile | null>({
    queryKey: ['profile', user?.id],
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (error) {
        // Profile may not exist yet (auto-create trigger missed) — return null
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data as Profile;
    },
  });

  const role = profileQuery.data?.role ?? null;

  return {
    user,
    profile: profileQuery.data ?? null,
    role,
    isAdmin: role === 'admin',
    isEditor: role === 'editor' || role === 'admin',
    isLoading: authLoading || (!!user && profileQuery.isPending),
    signOut,
  };
}
