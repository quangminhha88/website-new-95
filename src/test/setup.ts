/**
 * Vitest setup — runs before every test file.
 *
 * Adds @testing-library/jest-dom matchers, ensures DOM cleanup between tests,
 * and stubs `crypto.randomUUID` if missing in older happy-dom versions.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// Polyfill crypto.randomUUID for analytics tests (visitor IDs)
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      ...globalThis.crypto,
      randomUUID: () => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    },
    configurable: true,
  });
}
