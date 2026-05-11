import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';

interface Props {
  children: ReactNode;
  /** Required role. Defaults to admin. */
  role?: 'admin' | 'editor';
}

/**
 * Route guard — redirects unauthenticated users to /admin/login,
 * shows access-denied UI for authenticated users without the required role.
 *
 * The "preserve where user was going" flow now uses a `?from=` query
 * param (Next has no router state object like react-router-dom did).
 */
export default function RequireAdmin({ children, role = 'admin' }: Props) {
  const user = useAuthStore((s) => s.user);
  const userRole = useAuthStore((s) => s.role);
  const isLoading = useAuthStore((s) => s.isLoading);
  const pathname = usePathname() ?? '/admin';
  const router = useRouter();

  // Redirect side effect — runs only when we definitively know the user is unauthenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/admin/login?from=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, user, pathname, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const hasAccess = role === 'admin' ? userRole === 'admin' : userRole === 'admin' || userRole === 'editor';

  if (!hasAccess) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Access Denied</h1>
          <p className="mt-2 text-sm text-gray-600">
            You need the <strong>{role}</strong> role to view this page.
            {user.email && <> Signed in as <strong>{user.email}</strong>.</>}
          </p>
          <button
            type="button"
            onClick={() => useAuthStore.getState().signOut()}
            className="mt-6 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
