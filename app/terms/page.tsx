'use client';

/**
 * Stage 3 client re-export — see LegacyRouterShim for rationale.
 * src/views/legal/LegalPages.tsx exports three named components;
 * Stage 5 will split them into separate files.
 */
import { TermsPage } from '@/views/legal/LegalPages';
import LegacyRouterShim from '@/components/LegacyRouterShim';

export default function Page() {
  return (
    <LegacyRouterShim>
      <TermsPage />
    </LegacyRouterShim>
  );
}
