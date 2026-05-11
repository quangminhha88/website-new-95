import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigErrorBanner } from '@/components/ConfigErrorBanner';
import CookieBanner from '@/components/CookieBanner';
import { useAuthStore } from '@/stores/auth';

// Public
const HomePage = lazy(() => import('@/views/HomePage'));
const SmartFinderPage = lazy(() => import('@/views/finder/SmartFinderPage'));
const StackBuilderPage = lazy(() => import('@/views/finder/StackBuilderPage'));
const ToolPage = lazy(() => import('@/views/tools/ToolPage'));
const AlternativesPage = lazy(() => import('@/views/tools/AlternativesPage'));
const PricingPage = lazy(() => import('@/views/tools/PricingPage'));
const BestPage = lazy(() => import('@/views/BestPage'));
const UseCasePage = lazy(() => import('@/views/for/UseCasePage'));
const CategoryPage = lazy(() => import('@/views/category/CategoryPage'));
const ComparisonPage = lazy(() => import('@/views/vs/ComparisonPage'));
const RedirectPage = lazy(() => import('@/views/go/RedirectPage'));
const MonitoringTestPage = lazy(() => import('@/views/MonitoringTestPage'));
const AccountPage = lazy(() => import('@/views/account/AccountPage'));

// Legal
const PrivacyPage = lazy(() => import('@/views/legal/LegalPages').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('@/views/legal/LegalPages').then((m) => ({ default: m.TermsPage })));
const DisclosurePage = lazy(() =>
  import('@/views/legal/LegalPages').then((m) => ({ default: m.DisclosurePage })),
);

// Admin
const AdminLayout = lazy(() => import('@/views/admin/AdminLayout'));
const AdminHome = lazy(() => import('@/views/admin/AdminHome'));
const AdminTools = lazy(() => import('@/views/admin/AdminTools'));
const AdminReview = lazy(() => import('@/views/admin/AdminReview'));
const AdminAnalytics = lazy(() => import('@/views/admin/AdminAnalytics'));
const AdminRevenue = lazy(() => import('@/views/admin/AdminRevenue'));
const AdminNichePages = lazy(() => import('@/views/admin/AdminNichePages'));

function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div
        className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"
        role="status"
        aria-label="Loading page"
      />
    </div>
  );
}

export default function App() {
  const initAuth = useAuthStore((s) => s.init);
  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-white font-sans text-gray-900">
        <ConfigErrorBanner />
        <Suspense fallback={<PageFallback />}>
          <Routes>
            {/* Public */}
            <Route path="/" element={<HomePage />} />
            <Route path="/finder" element={<SmartFinderPage />} />
            <Route path="/stack-builder" element={<StackBuilderPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/monitoring-test" element={<MonitoringTestPage />} />
            <Route path="/tools/:slug" element={<ToolPage />} />
            <Route path="/tools/:slug/alternatives" element={<AlternativesPage />} />
            <Route path="/tools/:slug/pricing" element={<PricingPage />} />
            <Route path="/best/:slug" element={<BestPage />} />
            <Route path="/for/:usecase" element={<UseCasePage />} />
            <Route path="/category/:slug" element={<CategoryPage />} />
            <Route path="/vs/:slug" element={<ComparisonPage />} />
            <Route path="/go/:slug" element={<RedirectPage />} />

            {/* Legal */}
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/disclosure" element={<DisclosurePage />} />

            {/* Admin */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminHome />} />
              <Route path="tools" element={<AdminTools />} />
              <Route path="niche-pages" element={<AdminNichePages />} />
              <Route path="review" element={<AdminReview />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="revenue" element={<AdminRevenue />} />
            </Route>
          </Routes>
        </Suspense>
        <CookieBanner />
      </div>
    </BrowserRouter>
  );
}
