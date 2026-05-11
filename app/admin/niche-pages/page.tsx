'use client';

/**
 * Stage 3 client re-export. Wrapped in LegacyRouterShim because the
 * source view still uses react-router-dom (Link, useNavigate, Outlet).
 * Stage 5 swaps those for next/link + next/navigation, after which
 * the shim is removed and this becomes a pure re-export.
 */
import AdminNichePages from '@/views/admin/AdminNichePages';
import LegacyRouterShim from '@/components/LegacyRouterShim';

export default function Page() {
  return (
    <LegacyRouterShim>
      <AdminNichePages />
    </LegacyRouterShim>
  );
}
