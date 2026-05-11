/**
 * Auth store — Supabase session + user role.
 *
 * Role is fetched from the `user_roles` table on session change.
 * If no row exists for the user, role is `null` (treat as visitor).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';

const log = createLogger('store:auth');

export type UserRole = 'admin' | 'editor' | 'viewer' | null;

interface AuthUser {
  id: string;
  email: string | null;
}

interface AuthState {
  user: AuthUser | null;
  role: UserRole;
  isLoading: boolean;
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

async function fetchRole(userId: string): Promise<UserRole> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();
    if (error || !data) return null;
    return data.role as UserRole;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      role: null,
      isLoading: true,

      init: async () => {
        try {
          const { data } = await supabase.auth.getSession();
          const u = data.session?.user;
          const user = u ? { id: u.id, email: u.email ?? null } : null;
          const role = u ? await fetchRole(u.id) : null;
          set({ user, role, isLoading: false });

          // React to future auth state changes (token refresh, sign out elsewhere)
          supabase.auth.onAuthStateChange(async (_event, session) => {
            const u2 = session?.user;
            if (!u2) {
              set({ user: null, role: null });
              return;
            }
            const role2 = await fetchRole(u2.id);
            set({ user: { id: u2.id, email: u2.email ?? null }, role: role2 });
          });
        } catch (err) {
          log.warn('Failed to init auth session', err);
          set({ user: null, role: null, isLoading: false });
        }
      },

      signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          log.warn('Sign in failed', error.message);
          return { error: error.message };
        }
        if (data.user) {
          const role = await fetchRole(data.user.id);
          set({
            user: { id: data.user.id, email: data.user.email ?? null },
            role,
          });
        }
        return { error: null };
      },

      signOut: async () => {
        await supabase.auth.signOut();
        set({ user: null, role: null });
      },
    }),
    {
      name: 'saas-directory-auth',
      // Only persist the user shape; role + isLoading must always re-fetch on boot
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
