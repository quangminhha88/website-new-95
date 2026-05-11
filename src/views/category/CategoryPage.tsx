import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion } from 'motion/react';
import { ArrowLeft, Layers } from 'lucide-react';
import SEO from '@/components/SEO';
import Breadcrumbs from '@/components/Breadcrumbs';
import { sanitizeHTML } from '@/utils/sanitize';
import { useCategoryBySlug } from '@/hooks';

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: category, isLoading, error } = useCategoryBySlug(slug);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div
          className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent shadow-xl"
          role="status"
          aria-label="Loading category"
        />
      </div>
    );
  }

  if (error || !category) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center bg-gray-50">
        <h2 className="text-2xl font-bold text-gray-900">Category Not Found</h2>
        <p className="mt-2 text-gray-600">
          The category you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link href="/" className="mt-6 text-blue-600 hover:underline">
          ← Back to Directory
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <SEO
        title={category.seo_title || `Best ${category.name} Tools`}
        description={
          category.seo_meta_description ||
          `Discover top-rated ${category.name} software, expert reviews, and curated recommendations.`
        }
        canonical={`/category/${category.slug}`}
      />

      <nav className="sticky top-0 z-20 border-b border-gray-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Directory
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 pt-12 sm:px-6 lg:px-8">
        <Breadcrumbs
          items={[
            { label: 'Directory', href: '/' },
            { label: category.name, href: `/category/${category.slug}`, current: true },
          ]}
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <Layers className="h-6 w-6" />
            </div>
            <span className="text-sm font-bold uppercase tracking-widest text-blue-600">
              Category Hub
            </span>
          </div>

          <h1 className="text-4xl font-black tracking-tight text-gray-900 sm:text-5xl leading-tight">
            {category.name}
          </h1>

          {category.description && (
            <p className="mt-4 text-lg text-gray-600 leading-relaxed">{category.description}</p>
          )}

          {category.seo_content_html && (
            <div
              className="mt-12 prose prose-blue max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeHTML(category.seo_content_html) }}
            />
          )}
        </motion.div>
      </main>
    </div>
  );
}
