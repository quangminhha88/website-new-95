import { type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Wrench,
  Layers,
  FileText,
  GitCompare,
  ShieldCheck,
  BarChart3,
  LogOut,
  ExternalLink,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Mark active only on exact match (vs. prefix) — used for the Dashboard root. */
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/tools', label: 'Tools', icon: Wrench },
  { href: '/admin/categories', label: 'Categories', icon: Layers },
  { href: '/admin/niche-pages', label: 'Niche Pages', icon: FileText },
  { href: '/admin/comparisons', label: 'Comparisons', icon: GitCompare },
  { href: '/admin/review', label: 'Review Queue', icon: ShieldCheck },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.role);
  const signOut = useAuthStore((s) => s.signOut);
  const router = useRouter();
  const pathname = usePathname() ?? '';

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-16 items-center border-b border-gray-100 px-6">
          <Link href="/admin" className="text-lg font-bold text-gray-900">
            Admin
          </Link>
          <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
            {role}
          </span>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            // next/link has no NavLink isActive — derive from usePathname()
            const isActive = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-gray-100 p-3">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          >
            <ExternalLink className="h-4 w-4" />
            View site
          </a>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          <div className="lg:hidden">
            <Link href="/admin" className="text-lg font-bold text-gray-900">
              Admin
            </Link>
          </div>
          <div className="flex flex-1 items-center justify-end gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">{user?.email}</div>
              <div className="text-xs uppercase tracking-wide text-gray-500">{role}</div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                router.push('/admin/login');
              }}
              className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
