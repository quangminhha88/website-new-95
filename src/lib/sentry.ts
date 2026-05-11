/**
 * Optional Sentry integration.
 *
 * Lazy-loaded — Sentry only activates if VITE_SENTRY_DSN is set, and the
 * package is dynamically imported so opt-out users pay no bundle cost.
 *
 * Usage:
 *   await initSentry();             // once in main.tsx
 *   captureError(err, { context }); // wherever you handle an error
 */
import { createLogger } from './logger';

const log = createLogger('lib:sentry');

interface SentryShim {
  init(options: object): void;
  captureException(err: unknown, options?: object): void;
  captureMessage(msg: string, level?: string): void;
  setUser(user: { id?: string } | null): void;
}

let sentry: SentryShim | null = null;
let initialized = false;

/**
 * Initialize Sentry if VITE_SENTRY_DSN is configured.
 * Safe to call multiple times — only initializes once.
 */
export async function initSentry(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN as string | undefined;
  if (!dsn) {
    log.debug('VITE_SENTRY_DSN not set — Sentry disabled');
    return;
  }

  try {
    // Use a variable so Rollup doesn't try to bundle/resolve this optional dep.
    // The package is loaded only at runtime if installed.
    const sentryPackage = '@sentry/react';
    const mod: any = await import(/* @vite-ignore */ sentryPackage).catch(() => null);
    if (!mod) {
      log.warn('@sentry/react not installed; run `npm i @sentry/react` to enable error tracking');
      return;
    }

    mod.init({
      dsn,
      environment: (process.env.NODE_ENV ?? "development"),
      tracesSampleRate: (process.env.NODE_ENV === "production") ? 0.1 : 1.0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: (process.env.NODE_ENV === "production") ? 1.0 : 0,
      beforeSend(event: { request?: { url?: string } }) {
        // Strip query strings to avoid leaking visitor IDs in URLs
        if (event.request?.url) {
          event.request.url = event.request.url.split('?')[0];
        }
        return event;
      },
    });

    sentry = mod as SentryShim;
    log.info('Sentry initialized');
  } catch (err) {
    log.warn('Sentry init failed', err instanceof Error ? err.message : err);
  }
}

/** Report an error to Sentry. Falls back to logger if Sentry is disabled. */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (sentry) {
    sentry.captureException(err, { extra: context });
  } else {
    log.error('Captured error', { err, context });
  }
}

/** Report a message to Sentry at the given severity level. */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
): void {
  if (sentry) {
    sentry.captureMessage(message, level);
  } else if (level === 'error') {
    log.error(message);
  } else if (level === 'warning') {
    log.warn(message);
  } else {
    log.info(message);
  }
}

/** Tag the current user for error context. Pass null to clear. */
export function setSentryUser(user: { id: string } | null): void {
  sentry?.setUser(user);
}
