import { Info } from 'lucide-react';

interface AffiliateDisclosureProps {
  variant?: 'banner' | 'inline' | 'compact';
  className?: string;
}

/**
 * FTC-compliant affiliate disclosure.
 *
 * The FTC requires "clear and conspicuous" disclosure on any page that
 * contains affiliate links. Three variants:
 *
 *   - banner  : at top of tool/comparison pages
 *   - inline  : within content (e.g. before a product table)
 *   - compact : footer of pages with sparse affiliate content
 */
export default function AffiliateDisclosure({
  variant = 'banner',
  className = '',
}: AffiliateDisclosureProps) {
  if (variant === 'compact') {
    return (
      <p className={`text-xs text-gray-500 ${className}`}>
        Some links on this page are affiliate links — we may earn a commission at no extra
        cost to you. <a href="/disclosure" className="underline">Full disclosure</a>.
      </p>
    );
  }

  if (variant === 'inline') {
    return (
      <div className={`my-6 rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600 ${className}`}>
        <span className="font-semibold text-gray-900">Affiliate disclosure:</span> We may earn
        a commission when you purchase through links on this page.{' '}
        <a href="/disclosure" className="text-indigo-600 hover:underline">
          How we make money
        </a>
        .
      </div>
    );
  }

  // banner
  return (
    <div className={`flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-900 ${className}`}>
      <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <p>
        <strong>Affiliate disclosure:</strong> We may earn a commission when you sign up via
        links on this page, at no extra cost to you. Recommendations are independent.{' '}
        <a href="/disclosure" className="font-semibold underline hover:no-underline">
          Read more
        </a>
        .
      </p>
    </div>
  );
}
