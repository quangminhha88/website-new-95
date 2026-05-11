'use client';

/**
 * Stage 3 admin layout. The source `src/views/admin/AdminLayout.tsx`
 * uses `<Outlet/>` internally and does NOT accept `{children}` — pure
 * re-export means sub-page content never renders.
 *
 * For Stage 3 we just provide router context here. Admin sub-pages
 * render WITHOUT the shared sidebar — known regression. Stage 5 will
 * refactor AdminLayout to accept `{children}` and we'll re-export it
 * properly.
 */
import LegacyRouterShim from '@/components/LegacyRouterShim';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <LegacyRouterShim>{children}</LegacyRouterShim>;
}
