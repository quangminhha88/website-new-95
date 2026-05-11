import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion } from 'motion/react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import AffiliateCTA from '@/components/AffiliateCTA';
import { sanitizeHTML } from '@/utils/sanitize';
import { useTool } from '@/hooks';

export default function AlternativesPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: tool, isLoading, error } = useTool(slug);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div
          className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent shadow-xl"
          role="status"
          aria-label="Loading tool"
        />
      </div>
    );
  }

  if (error || !tool || !tool.alternatives_seo_content) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900">Page Not Generated Yet</h2>
        <p className="mt-2 text-gray-600">
          The alternatives page for this tool is still being indexed by our engine.
        </p>
        <Link href={`/tools/${slug}`} className="mt-6 text-blue-600 hover:underline">
          Back to {tool?.name || 'Tool'} profile
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <nav className="sticky top-0 z-20 border-b border-gray-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <Link
            href={`/tools/${tool.slug}`}
            className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to {tool.name}
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 pt-12 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <Sparkles className="h-6 w-6" />
            </div>
            <span className="text-sm font-bold uppercase tracking-widest text-blue-600">
              Expert Comparison
            </span>
          </div>

          <h1 className="text-4xl font-black tracking-tight text-gray-900 sm:text-5xl leading-tight">
            {tool.alternatives_seo_title || `Best Alternatives to ${tool.name} (2026)`}
          </h1>

          <div className="mt-8">
            <AffiliateCTA
              slug={tool.slug}
              name={tool.name}
              variant="featured"
              ctaText={`Voted #1 Choice: Get Started with ${tool.name}`}
            />
          </div>

          <div
            className="mt-12 prose prose-blue max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHTML(tool.alternatives_seo_content) }}
          />
        </motion.div>
      </main>
    </div>
  );
}
