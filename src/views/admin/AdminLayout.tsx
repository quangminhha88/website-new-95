import { type ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Database,
  ListChecks,
  BarChart3,
  Users,
  Layers,
  FileText,
  LogOut,
  DollarSign,
  Menu,
} from 'lucide-react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import AdminGuard from '@/components/AdminGuard';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  /** Active only on exact match (vs. prefix). Used for the /admin root. */
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { href: '/admin/tools', icon: Database, label: 'Tools' },
  { href: '/admin/categories', icon: Layers, label: 'Categories' },
  { href: '/admin/niche-pages', icon: FileText, label: 'Niche Pages' },
  { href: '/admin/review', icon: ListChecks, label: 'Review Queue' },
  { href: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
  { href: '/admin/revenue', icon: DollarSign, label: 'Revenue' },
  { href: '/admin/users', icon: Users, label: 'Users' },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? '';
  return (
    <nav className="flex-1 space-y-1 p-4">
      {NAV_ITEMS.map((item) => {
        const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserBlock({ onSignOut }: { onSignOut: () => void }) {
  const { user, role } = useAdminAuth();
  return (
    <div className="border-t border-border p-4">
      <div className="rounded-lg bg-muted p-3">
        <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        <p className="text-xs font-semibold text-primary capitalize">{role}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onSignOut}
        className="mt-2 w-full justify-start"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </div>
  );
}

function AdminShell({ children }: { children: ReactNode }) {
  const { signOut } = useAdminAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    router.push('/admin');
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-6">
          <div className="h-8 w-8 rounded-lg bg-primary" />
          <span className="font-bold">Admin</span>
        </div>
        <NavList />
        <UserBlock onSignOut={handleSignOut} />
      </aside>

      <main className="flex-1 min-w-0 overflow-auto">
        {/* ── Mobile top bar with drawer trigger ── */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex flex-col p-0 w-64">
                <SheetTitle className="sr-only">Admin navigation</SheetTitle>
                <div className="flex h-16 items-center gap-2 border-b border-border px-6">
                  <div className="h-8 w-8 rounded-lg bg-primary" />
                  <span className="font-bold">Admin</span>
                </div>
                <NavList onNavigate={() => setMobileOpen(false)} />
                <UserBlock onSignOut={handleSignOut} />
              </SheetContent>
            </Sheet>
            <span className="font-semibold">Admin</span>
          </div>
        </header>

        {/* Next.js layouts use {children} where react-router-dom used <Outlet/> */}
        {children}
      </main>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGuard minRole="editor">
      <AdminShell>{children}</AdminShell>
    </AdminGuard>
  );
}
