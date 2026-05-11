'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { ConfigErrorBanner } from '@/components/ConfigErrorBanner';
import CookieBanner from '@/components/CookieBanner';
import AuthInit from '@/components/AuthInit';

/**
 * All client-side providers in one place. Pulled out of the root
 * layout so the layout itself stays a Server Component (cheaper +
 * gets the static metadata treatment).
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthInit />
      <ConfigErrorBanner />
      {children}
      <CookieBanner />
    </QueryClientProvider>
  );
}
