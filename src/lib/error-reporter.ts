/**
 * Unified error reporter.
 *
 * Single funnel for every error in the app. Sends to:
 *   1. Sentry (if VITE_SENTRY_DSN is set — already in lib/sentry.ts)
 *   2. Supabase error_logs via /api/log-error (always)
 *   3. Toast via useUIStore (opt-in per call)
 *
 * Source taxonomy for easier triage in the dashboard:
 *   render  → caught by ErrorBoundary
 *   query   → React Query / data-fetching failures
 *   api     → /api/* call failures
 *   event   → onClick/onSubmit handlers
 *   async   → setTimeout, promise chains, anything else
 */
import { captureError as sentryCapture } from './sentry';
import { useUIStore } from '@/stores/ui';
import { createLogger } from './logger';

const log = createLogger('error-reporter');

export type ErrorSource = 'render' | 'event' | 'async' | 'api' | 'query';

export interface ReportOptions {
  source: ErrorSource;
  componentStack?: string;
  context?: Record<string, unknown>;
  /** If true, push a toast via useUIStore (default: false — boundary handles render errors with the fallback UI) */
  toast?: boolean;
  /** Override the toast message — defaults to a friendly message */
  toastMessage?: string;
}

/** In-memory dedupe — prevents the same error firing 100 times in a render loop */
const recentFingerprints = new Map<string, number>();
const DEDUPE_WINDOW_MS = 60 * 1000;

/**
 * Report an error to Sentry, Supabase, and optionally the toast queue.
 * Use this everywhere — never call sentry.captureError or fetch /api/log-error directly.
 */
export function reportError(err: unknown, options: ReportOptions): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const fingerprint = makeFingerprint(error, options.source);

  // Dedupe
  const lastSeen = recentFingerprints.get(fingerprint);
  if (lastSeen && Date.now() - lastSeen < DEDUPE_WINDOW_MS) {
    return;
  }
  recentFingerprints.set(fingerprint, Date.now());

  // 1. Sentry
  sentryCapture(error, { source: options.source, ...options.context });

  // 2. Supabase
  void postToSupabase(error, fingerprint, options).catch((logErr) => {
    log.warn('Failed to send to error_logs', logErr);
  });

  // 3. Toast (opt-in)
  if (options.toast) {
    const message = options.toastMessage ?? friendlyMessage(error);
    useUIStore.getState().pushToast(message, 'error');
  }

  // 4. Local console in dev
  if ((process.env.NODE_ENV !== "production")) {
    log.error(`[${options.source}] ${error.message}`, { context: options.context });
  }
}

async function postToSupabase(
  error: Error,
  fingerprint: string,
  options: ReportOptions,
): Promise<void> {
  if (typeof window === 'undefined') return;

  const payload = {
    message: error.message,
    stack: error.stack,
    componentStack: options.componentStack,
    source: options.source,
    url: window.location.href,
    pagePath: window.location.pathname,
    userAgent: navigator.userAgent,
    visitorId: getVisitorId(),
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown',
    environment: (process.env.NODE_ENV ?? "development"),
    context: options.context,
    fingerprint,
  };

  // sendBeacon for unload safety; fall back to fetch with keepalive
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    try {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/log-error', blob)) return;
    } catch {
      // fall through
    }
  }

  await fetch('/api/log-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

function makeFingerprint(error: Error, source: ErrorSource): string {
  // First non-trivial stack frame + message gives a stable group key
  const firstFrame = (error.stack ?? '').split('\n').slice(1, 4).join('|');
  const sig = `${source}::${error.message.slice(0, 100)}::${firstFrame.slice(0, 200)}`;
  // Tiny hash to keep fingerprints short
  let h = 0;
  for (let i = 0; i < sig.length; i++) {
    h = (h * 31 + sig.charCodeAt(i)) | 0;
  }
  return `${source}-${Math.abs(h).toString(36)}`;
}

function getVisitorId(): string | undefined {
  try {
    const m = document.cookie.match(/sx_ab=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : undefined;
  } catch {
    return undefined;
  }
}

/** Convert an arbitrary error into a user-safe message. */
function friendlyMessage(error: Error): string {
  const msg = error.message;
  if (/network|fetch|failed to fetch/i.test(msg)) return 'Network error — check your connection and try again.';
  if (/permission|unauthor/i.test(msg)) return 'You don\'t have permission to do that.';
  if (/timeout/i.test(msg)) return 'That took too long. Please try again.';
  return (process.env.NODE_ENV !== "production") ? msg : 'Something went wrong. Please try again.';
}

/**
 * React hook: report an error from an event handler with a toast.
 *
 * @example
 *   const reportEvent = useErrorReporter();
 *   const handleSubmit = async () => {
 *     try { await save() } catch (e) { reportEvent(e, 'event', { intent: 'save-form' }) }
 *   };
 */
export function useErrorReporter() {
  return (err: unknown, source: ErrorSource = 'event', context?: Record<string, unknown>) =>
    reportError(err, { source, context, toast: true });
}
