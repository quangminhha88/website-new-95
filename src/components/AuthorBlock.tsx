import { ShieldCheck, Calendar } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DEFAULT_AUTHOR } from '@/seo/config';

interface AuthorBlockProps {
  /** ISO date string. Defaults to today if omitted. */
  lastUpdated?: string;
  authorName?: string;
  authorJobTitle?: string;
  variant?: 'compact' | 'full';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * E-E-A-T trust block: "Reviewed by X · Last updated Y · Verified".
 *
 * Refactored to use shadcn primitives:
 *   - <Card> for the full variant (semantic surface tokens, dark-mode-ready)
 *   - <Tooltip> on the verification shield (explains why it's verified)
 *   - design-token colours so theme changes flow through automatically
 */
export default function AuthorBlock({
  lastUpdated,
  authorName = DEFAULT_AUTHOR.name,
  authorJobTitle = DEFAULT_AUTHOR.jobTitle,
  variant = 'compact',
}: AuthorBlockProps) {
  const date = formatDate(lastUpdated ?? new Date().toISOString());

  if (variant === 'compact') {
    return (
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <ShieldCheck
                  className="h-3.5 w-3.5 text-success cursor-help"
                  aria-label="Verified by editorial team"
                />
              </TooltipTrigger>
              <TooltipContent>Hand-reviewed by our editorial team</TooltipContent>
            </Tooltip>
            Reviewed by{' '}
            <a
              href={DEFAULT_AUTHOR.url}
              className="font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              {authorName}
            </a>{' '}
            — {authorJobTitle}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" aria-hidden />
            <span>
              <span className="sr-only">Last updated:</span> {date}
            </span>
          </span>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <Card className="flex items-start gap-4 p-4">
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
        aria-hidden
      >
        <ShieldCheck className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">
          Reviewed by{' '}
          <a
            href={DEFAULT_AUTHOR.url}
            className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            {authorName}
          </a>
        </p>
        <p className="text-xs text-muted-foreground">{authorJobTitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">{DEFAULT_AUTHOR.bio}</p>
        <p className="mt-2 text-xs font-medium text-muted-foreground/80">
          Last updated {date}
        </p>
      </div>
    </Card>
  );
}
