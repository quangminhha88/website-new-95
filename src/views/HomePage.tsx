import Link from 'next/link';
import { motion } from 'motion/react';
import { Sparkles, ChevronRight, Layers, ArrowRight, Star, Search } from 'lucide-react';
import SEO from '@/components/SEO';
import { useCategories, useFeaturedTools } from '@/hooks';

function CategorySkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100" />
      ))}
    </div>
  );
}

function ToolSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-64 animate-pulse rounded-3xl bg-gray-100" />
      ))}
    </div>
  );
}

export default function HomePage() {
  const { data: categories, isLoading: catLoading, error: catError } = useCategories(8);
  const { data: tools, isLoading: toolLoading } = useFeaturedTools(8);

  return (
    <div className="bg-white">
      <SEO
        title="Best SaaS Tools Directory 2026"
        description="Explore the most complete directory of top-rated SaaS tools, expert reviews, and AI-powered software recommendations for your business stack."
        canonical="/"
        schema={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'SaaS Excellence Hub',
          url: 'https://saas-excellence.com',
          potentialAction: {
            '@type': 'SearchAction',
            target: 'https://saas-excellence.com/finder?q={search_term_string}',
            'query-input': 'required name=search_term_string',
          },
        }}
      />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gray-50 pt-24 pb-32">
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 blur-3xl opacity-20 pointer-events-none">
          <div className="h-96 w-96 rounded-full bg-indigo-600" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-600 mb-8"
            >
              <Sparkles className="h-4 w-4" />
              <span>AI-Powered Tool Matching Engine</span>
            </motion.div>

            <h1 className="text-5xl font-black tracking-tight text-gray-900 sm:text-7xl mb-8 leading-[1.1]">
              The Ultimate Hub for <br />
              <span className="text-indigo-600">SaaS Excellence.</span>
            </h1>

            <p className="mx-auto max-w-2xl text-xl text-gray-600 mb-12 leading-relaxed">
              Discover, compare, and implement the world's best software. Our directory is curated
              by experts and powered by smarter AI search.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/finder"
                className="group relative inline-flex items-center gap-2 rounded-2xl bg-gray-900 px-8 py-5 text-lg font-bold text-white shadow-2xl transition-all hover:bg-black hover:scale-105 active:scale-95"
              >
                <Search className="h-5 w-5" />
                <span>Find Your Stack — AI Match</span>
                <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>

              <Link
                href="/category/marketing"
                className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 bg-white px-8 py-5 text-lg font-bold text-gray-900 transition-all hover:border-indigo-600 hover:text-indigo-600"
              >
                Browse Top Tools
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-24 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h2 className="text-3xl font-black text-gray-900">Browse by Category</h2>
            <p className="mt-2 text-gray-500 font-medium">50+ specialized software categories</p>
          </div>
          <Link
            href="/finder"
            className="text-indigo-600 font-bold hover:underline flex items-center gap-1 group"
          >
            Explore All{' '}
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {catError && (
          <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-red-700 text-sm mb-8">
            Failed to load categories. <a href="/" className="underline">Reload</a>
          </div>
        )}

        {catLoading ? (
          <CategorySkeleton />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(categories ?? []).map((cat, i) => (
              <motion.div
                key={cat.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Link
                  href={`/category/${cat.slug}`}
                  className="group flex flex-col p-6 rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:shadow-xl hover:border-indigo-100 hover:-translate-y-1"
                >
                  <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                    <Layers className="h-6 w-6" />
                  </div>
                  <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                    {cat.name}
                  </h3>
                  <p className="mt-2 text-xs text-gray-500 font-medium line-clamp-1">
                    {cat.description}
                  </p>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Featured Tools */}
      <section className="bg-gray-50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-black uppercase mb-4">
                <Star className="h-3 w-3 fill-orange-700" />
                Expert's Choice
              </div>
              <h2 className="text-4xl font-black text-gray-900 tracking-tight">
                Today's Featured Tools
              </h2>
              <p className="mt-4 text-gray-600 text-lg leading-relaxed">
                Software our experts recommend as the gold standard for performance, UX, and
                scalability in 2026.
              </p>
            </div>
            <Link
              href="/finder"
              className="inline-flex items-center gap-2 text-indigo-600 font-black hover:underline"
            >
              Use AI to find your tool <ArrowRight className="h-5 w-5" />
            </Link>
          </div>

          {toolLoading ? (
            <ToolSkeleton />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {(tools ?? []).map((tool) => (
                <Link
                  key={tool.id}
                  href={`/tools/${tool.slug}`}
                  className="group bg-white rounded-3xl p-8 border border-gray-100 shadow-sm transition-all hover:shadow-2xl hover:border-indigo-100"
                >
                  <div className="aspect-square bg-gray-50 rounded-2xl mb-6 flex items-center justify-center group-hover:scale-105 transition-transform overflow-hidden">
                    {tool.logo_url ? (
                      <img
                        src={tool.logo_url}
                        alt={tool.name}
                        className="h-16 w-16 object-contain"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-16 w-16 flex items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 text-2xl font-black">
                        {tool.name[0]}
                      </div>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{tool.name}</h3>
                  <p className="text-gray-500 text-sm line-clamp-2 leading-relaxed mb-6">
                    {tool.tagline || tool.description}
                  </p>
                  <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      {tool.pricing_model || 'Free Trial'}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-indigo-600 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-gray-100 py-12 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { label: 'SaaS Tools Reviewed', value: '1,200+' },
              { label: 'Software Categories', value: '50+' },
              { label: 'Expert Reviews', value: '800+' },
              { label: 'Monthly Visitors', value: '120K+' },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-3xl font-black text-indigo-600">{stat.value}</div>
                <div className="mt-1 text-sm font-medium text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="bg-indigo-600 py-24 text-center">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-4xl font-black text-white sm:text-6xl mb-8">
            Ready to evolve your stack?
          </h2>
          <p className="text-xl text-indigo-100 mb-12 leading-relaxed">
            Stop guessing. Use our AI to compare pricing, features, and roadmaps across the entire
            SaaS landscape.
          </p>
          <Link
            href="/finder"
            className="inline-flex items-center gap-3 rounded-2xl bg-white px-10 py-5 text-xl font-black text-indigo-600 shadow-2xl transition-all hover:bg-gray-50 hover:scale-105 active:scale-95"
          >
            Launch Smart Finder <Sparkles className="h-6 w-6" />
          </Link>
        </div>
      </section>
    </div>
  );
}
