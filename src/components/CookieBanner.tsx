/**
 * GDPR cookie consent banner.
 *
 * Stores preferences in localStorage. Until the user opts in:
 *   - analytics events still log SEO/dwell (essential for site function)
 *     but the visitor ID becomes ephemeral (per-session only)
 *   - affiliate cookies are NOT set
 *
 * Two-tier consent: "Accept all" or "Essential only". For finer-grained
 * controls (separate analytics/marketing/preferences), extend the modal.
 */
import { useState } from 'react';
import { Cookie, X } from 'lucide-react';
import { useUIStore } from '@/stores/ui';

const STORAGE_KEY = 'sx_consent';

type ConsentState = 'unset' | 'all' | 'essential';

export function getConsent(): ConsentState {
  if (typeof window === 'undefined') return 'unset';
  const v = window.localStorage?.getItem(STORAGE_KEY);
  if (v === 'all' || v === 'essential') return v;
  return 'unset';
}

export function hasAnalyticsConsent(): boolean {
  return getConsent() === 'all';
}

export default function CookieBanner() {
  const [consent, setConsent] = useState<ConsentState>(getConsent());
  const pushToast = useUIStore((s) => s.pushToast);

  if (consent !== 'unset') return null;

  function set(value: 'all' | 'essential') {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // some browsers block storage in private mode — just keep the in-memory state
    }
    setConsent(value);
    pushToast(
      value === 'all' ? 'Cookies accepted' : 'Only essential cookies will be used',
      'success',
    );
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl sm:p-6">
      <div className="flex items-start gap-4">
        <div className="hidden flex-shrink-0 sm:block">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Cookie className="h-5 w-5" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-900">We use cookies</h3>
          <p className="mt-1 text-sm text-gray-600">
            Essential cookies make the site work. Optional analytics help us improve content
            quality. See our{' '}
            <a href="/privacy" className="text-indigo-600 hover:underline">
              privacy policy
            </a>
            .
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => set('all')}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Accept all
            </button>
            <button
              type="button"
              onClick={() => set('essential')}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Essential only
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => set('essential')}
          aria-label="Dismiss"
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
