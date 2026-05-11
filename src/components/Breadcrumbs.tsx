import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  href: string;
  current?: boolean;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * Accessible breadcrumb navigation.
 *
 * Refactored to use:
 *   - design-token colours (text-muted-foreground, hover:text-foreground)
 *     so dark mode + theme tweaks flow through automatically
 *   - cn() helper for class merging
 *   - keyboard focus rings via the design system's --ring token
 *
 * Visual output unchanged from the previous custom-Tailwind version.
 */
export default function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const linkBase =
    'rounded-sm px-1.5 py-0.5 transition-colors ' +
    'hover:text-foreground hover:bg-muted ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('mb-6 flex items-center gap-1.5 text-sm text-muted-foreground', className)}
    >
      <Link href="/" className={cn(linkBase, 'flex items-center gap-1')} aria-label="Home">
        <Home className="h-3.5 w-3.5" aria-hidden />
      </Link>

      {items.map((item, index) => (
        <span key={`${item.href}-${index}`} className="flex items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" aria-hidden />
          {item.current ? (
            <span
              className="font-medium text-foreground truncate max-w-[200px]"
              aria-current="page"
            >
              {item.label}
            </span>
          ) : (
            <Link href={item.href} className={cn(linkBase, 'truncate max-w-[150px]')}>
              {item.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
