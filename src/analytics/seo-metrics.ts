/**
 * Browser-side SEO metrics tracker.
 *
 * Reports three signals to /api/seo/track:
 *   1. impression — page rendered (sent on mount)
 *   2. dwell — visible time before unload (sent via sendBeacon)
 *   3. affiliate_click — outbound to /go/:slug (handled in AffiliateCTA)
 *
 * Every event carries the variant index (from selectVariantForVisitor)
 * so weekly aggregation can compute CTR per variant for A/B winners.
 *
 * Visitor ID is a 90-day localStorage UUID — no PII, no cookies.
 */
import { createLogger } from '@/lib/logger';

const log = createLogger('analytics:seo');
const VISITOR_KEY = 'sx_vid';
const TRACK_ENDPOINT = '/api/seo/track';

export type EventType = 'impression' | 'dwell' | 'affiliate_click';

export interface SEOEvent {
  type: EventType;
  pagePath: string;
  pageType: 'tool' | 'niche' | 'comparison' | 'category' | 'home' | 'other';
  variantIndex?: number;
  /** Tool/niche slug for grouping */
  resourceSlug?: string;
  /** dwell type only — milliseconds */
  durationMs?: number;
  /** affiliate_click only — destination tool slug */
  targetSlug?: string;
  /** Free-form metadata (e.g. CTA position) */
  meta?: Record<string, unknown>;
}

function getVisitorId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = window.localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `v${Date.now()}-${Math.random().toString(36).slice(2)}`);
    window.localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

interface TrackPayload extends SEOEvent {
  visitorId: string;
  timestamp: number;
  referrer?: string;
}

function send(payload: TrackPayload): void {
  if (typeof window === 'undefined') return;

  const body = JSON.stringify(payload);

  // Use sendBeacon for unload-safe delivery (dwell time)
  if (payload.type === 'dwell' && navigator.sendBeacon) {
    try {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(TRACK_ENDPOINT, blob);
      return;
    } catch {
      // fall through to fetch
    }
  }

  // keepalive: true so impression/click events survive navigation
  void fetch(TRACK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch((err) => log.warn('track failed', err));
}

/** Fire an impression event. Call once on page mount. */
export function trackImpression(event: Omit<SEOEvent, 'type'>): void {
  send({
    type: 'impression',
    visitorId: getVisitorId(),
    timestamp: Date.now(),
    referrer: typeof document !== 'undefined' ? document.referrer : undefined,
    ...event,
  });
}

/** Fire an affiliate click event. Call before navigating to /go/:slug. */
export function trackAffiliateClick(event: Omit<SEOEvent, 'type'>): void {
  send({
    type: 'affiliate_click',
    visitorId: getVisitorId(),
    timestamp: Date.now(),
    ...event,
  });
}

/**
 * Start dwell-time tracking on mount; returns a cleanup that fires the
 * dwell event with elapsed visible time. Call from useEffect:
 *
 *   useEffect(() => startDwellTracking({...}), [pagePath]);
 */
export function startDwellTracking(event: Omit<SEOEvent, 'type' | 'durationMs'>): () => void {
  if (typeof window === 'undefined') return () => {};

  const startTime = Date.now();
  let visibleMs = 0;
  let lastVisibleStart = startTime;
  let isVisible = !document.hidden;

  const onVisibilityChange = () => {
    if (document.hidden && isVisible) {
      visibleMs += Date.now() - lastVisibleStart;
      isVisible = false;
    } else if (!document.hidden && !isVisible) {
      lastVisibleStart = Date.now();
      isVisible = true;
    }
  };

  const flush = () => {
    if (isVisible) visibleMs += Date.now() - lastVisibleStart;
    if (visibleMs < 1000) return; // ignore bounces under 1s

    send({
      type: 'dwell',
      visitorId: getVisitorId(),
      timestamp: Date.now(),
      durationMs: visibleMs,
      ...event,
    });
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', flush);

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', flush);
    flush();
  };
}
