'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';

/**
 * Mount-only `BrowserRouter` wrapper.
 *
 * Stage 3 of the Next.js migration leaves the legacy SPA pages
 * (src/views/*) using react-router-dom internally — `<Link>`,
 * `useNavigate`, `<Outlet/>`. Those APIs need a Router context above
 * them, and `<BrowserRouter>` itself uses `window.history` so it can't
 * render on the server.
 *
 * This shim returns `null` during SSR and the initial client render
 * pass (so prerendering doesn't crash on `useContext(NavigationContext)`),
 * then mounts `BrowserRouter` once `window` is available.
 *
 * Removed in Stage 5 once every legacy view has been swapped to
 * `next/link` + `next/navigation`.
 */
export default function LegacyRouterShim({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return <BrowserRouter>{children}</BrowserRouter>;
}
