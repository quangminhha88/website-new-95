/**
 * Web Vitals reporter.
 *
 * Sends Core Web Vitals (LCP, FID/INP, CLS, TTFB, FCP) to /api/seo/track
 * via sendBeacon. Uses the standardized PerformanceObserver API + the
 * `web-vitals` patterns inlined to avoid an extra dependency.
 *
 * Call once in main.tsx after the app mounts.
 */
import { createLogger } from '@/lib/logger';

const log = createLogger('analytics:vitals');
const ENDPOINT = '/api/vitals';

type MetricName = 'LCP' | 'FID' | 'INP' | 'CLS' | 'TTFB' | 'FCP';

interface VitalReport {
  name: MetricName;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  pagePath: string;
  navigationType?: string;
}

const THRESHOLDS: Record<MetricName, [number, number]> = {
  LCP: [2500, 4000],
  FID: [100, 300],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  TTFB: [800, 1800],
  FCP: [1800, 3000],
};

function rate(name: MetricName, value: number): VitalReport['rating'] {
  const [good, poor] = THRESHOLDS[name];
  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

function send(report: VitalReport): void {
  if (typeof navigator === 'undefined') return;
  const body = JSON.stringify(report);
  if (navigator.sendBeacon) {
    try {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      return;
    } catch {
      // fall through to fetch
    }
  }
  void fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

function report(name: MetricName, value: number): void {
  const r: VitalReport = {
    name,
    value: Math.round(name === 'CLS' ? value * 1000 : value),
    rating: rate(name, value),
    pagePath: typeof location !== 'undefined' ? location.pathname : '/',
  };
  send(r);
  log.debug(`[vitals] ${name} = ${r.value} (${r.rating})`);
}

/**
 * Wire up vitals collection. Idempotent — safe to call from React effects.
 */
export function initWebVitals(): void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;

  // LCP
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
      report('LCP', last.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    /* not supported */
  }

  // FCP
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          report('FCP', entry.startTime);
        }
      }
    }).observe({ type: 'paint', buffered: true });
  } catch {
    /* not supported */
  }

  // CLS — accumulated over the page lifetime
  let clsValue = 0;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput?: boolean }>) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    /* not supported */
  }

  // INP / FID
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { processingStart?: number; duration: number }>) {
        const value = entry.processingStart
          ? entry.processingStart - entry.startTime
          : entry.duration;
        report('INP', value);
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  } catch {
    /* not supported */
  }

  // TTFB
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav) {
      const ttfb = nav.responseStart - nav.requestStart;
      if (ttfb > 0) report('TTFB', ttfb);
    }
  } catch {
    /* not supported */
  }

  // Flush CLS on page hide (CLS keeps accumulating until the page is gone)
  window.addEventListener('pagehide', () => {
    if (clsValue > 0) report('CLS', clsValue);
  });
}
