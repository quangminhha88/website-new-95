import { cn } from '@/lib/utils';

/**
 * shadcn primitive Skeleton.
 *
 * The pre-shadcn `Skeleton.tsx` in `src/components/` provides richer
 * variants (SkeletonCard, SkeletonText, SkeletonTable, SkeletonPage) used
 * across pages. They both render the same animation; pick whichever import
 * is more convenient at the call site.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

export { Skeleton };
