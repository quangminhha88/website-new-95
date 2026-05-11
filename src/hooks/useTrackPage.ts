/**
 * Page tracking hook: fires impression on mount, dwell on unmount.
 *
 * Usage:
 *   useTrackPage({ pageType: 'tool', resourceSlug: tool.slug, variantIndex });
 */
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackImpression, startDwellTracking } from '@/analytics/seo-metrics';
import type { SEOEvent } from '@/analytics/seo-metrics';

interface TrackPageOptions {
  pageType: SEOEvent['pageType'];
  resourceSlug?: string;
  variantIndex?: number;
  enabled?: boolean;
}

export function useTrackPage(opts: TrackPageOptions) {
  const pathname = usePathname() ?? '/';
  const { pageType, resourceSlug, variantIndex, enabled = true } = opts;

  useEffect(() => {
    if (!enabled) return;
    trackImpression({ pagePath: pathname, pageType, resourceSlug, variantIndex });
    return startDwellTracking({ pagePath: pathname, pageType, resourceSlug, variantIndex });
  }, [pathname, pageType, resourceSlug, variantIndex, enabled]);
}
