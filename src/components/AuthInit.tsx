'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth';

/**
 * Mount-once side effect that hydrates the auth store from Supabase's
 * persisted session and subscribes to auth changes. Renders nothing —
 * it just bootstraps client state.
 */
export default function AuthInit() {
  const init = useAuthStore((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);
  return null;
}
