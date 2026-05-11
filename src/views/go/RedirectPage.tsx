import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';

export default function RedirectPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const searchParams = useSearchParams();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) {
      setError(true);
      return;
    }

    const src = searchParams.get('src') || 'direct';
    // Hit the serverless API route which handles tracking + actual redirect
    const apiUrl = `/api/redirect/${slug}?src=${src}`;

    // Slight delay for UX, then navigate
    const timer = setTimeout(() => {
      window.location.href = apiUrl;
    }, 500);

    return () => clearTimeout(timer);
  }, [slug, searchParams]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6">
        <p className="text-lg font-medium text-red-600">Invalid redirect link.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-indigo-50">
          <div className="absolute h-full w-full animate-ping rounded-full bg-indigo-100 opacity-60" />
          <ExternalLink className="h-8 w-8 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Taking you there…</h1>
          <p className="mt-2 text-gray-500">
            Connecting you to <span className="font-semibold text-indigo-600">{slug}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-gray-50 px-4 py-2 text-sm text-gray-400">
          <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          Verifying affiliate link…
        </div>
      </div>
    </div>
  );
}
