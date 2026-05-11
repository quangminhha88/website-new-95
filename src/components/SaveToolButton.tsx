import { Bookmark, BookmarkCheck, LogIn } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';
import { useIsToolSaved, useToggleSavedTool } from '@/hooks/useUserFeatures';

interface SaveToolButtonProps {
  toolId: string;
  className?: string;
  variant?: 'icon' | 'button';
}

/**
 * Bookmark a tool. Shows a sign-in prompt for anonymous users.
 *
 * Refactored to use the shadcn <Button>. Only the layout/style classes
 * for "saved/unsaved" colour swap are kept inline; everything else
 * inherits from the design system.
 */
export default function SaveToolButton({
  toolId,
  className,
  variant = 'button',
}: SaveToolButtonProps) {
  const user = useAuthStore((s) => s.user);
  const isSaved = useIsToolSaved(toolId);
  const toggle = useToggleSavedTool();

  // ── Anonymous: prompt sign-in ──
  if (!user) {
    return (
      <Button
        asChild
        variant="outline"
        size={variant === 'icon' ? 'icon' : 'default'}
        className={className}
      >
        <Link href="/account" aria-label="Sign in to save">
          {variant === 'icon' ? <Bookmark /> : <><LogIn /> Sign in to save</>}
        </Link>
      </Button>
    );
  }

  // ── Authenticated: toggle saved state ──
  const Icon = isSaved ? BookmarkCheck : Bookmark;
  return (
    <Button
      type="button"
      variant={isSaved ? 'secondary' : 'outline'}
      size={variant === 'icon' ? 'icon' : 'default'}
      onClick={() => toggle.mutate({ toolId, save: !isSaved })}
      disabled={toggle.isPending}
      aria-label={isSaved ? 'Remove from saved' : 'Save tool'}
      aria-pressed={isSaved}
      className={className}
    >
      <Icon />
      {variant === 'button' && (isSaved ? 'Saved' : 'Save')}
    </Button>
  );
}
