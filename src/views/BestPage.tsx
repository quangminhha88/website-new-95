import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getNichePage, getSupabaseClient } from '@/lib/supabase';
import { NichePage, Tool } from '@/types/tool';
import { motion } from 'motion/react';
import { ArrowLeft, Sparkles, CheckCircle2, ExternalLink, Trophy } from 'lucide-react';
import AffiliateCTA from '@/components/AffiliateCTA';
import revenueService from '@/services/revenueService';
import { sanitizeHTML } from '@/utils/sanitize';

export default function BestPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<NichePage | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!slug) return;
      try {
        setLoading(true);
        const data = await getNichePage(slug);
        setPage(data as NichePage);

        // Fetch tools in this niche
        const sb = getSupabaseClient();
        const keyword = data?.niche_name?.split(' ')[0] || '';
        const { data: toolsData } = await sb
          .from('tools')
          .select('*')
          .or(`description.ilike.%${keyword}%,name.ilike.%${keyword}%`)
          .limit(10);
        
        if (toolsData) {
          // REVENUE OPTIMIZATION: Rank tools by EPC before displaying
          const ranked = revenueService.rankToolsByProfitability(toolsData);
          setTools(ranked.slice(0, 5));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [slug]);

  // Helper to render comparison table
  const renderComparisonTable = () => {
    if (!tools.length) return null;
    return (
      <div className="my-12 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm not-prose">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50/50">
            <tr>
              <th className="px-6 py-4 font-bold text-gray-900 border-b border-gray-100">Tool</th>
              <th className="px-6 py-4 font-bold text-gray-900 border-b border-gray-100">Key Benefit</th>
              <th className="px-6 py-4 font-bold text-gray-900 border-b border-gray-100 text-right">Link</th>
            </tr>
          </thead>
          <tbody>
            {tools.map((tool, index) => (
              <tr key={tool.id} className={index === 0 ? 'bg-indigo-50/30' : ''}>
                <td className="px-6 py-4 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <div className="font-bold text-gray-900">{tool.name}</div>
                    {index === 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-700">
                        <Trophy size={10} /> Winner
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 border-b border-gray-50">
                  {tool.tagline}
                </td>
                <td className="px-6 py-4 border-b border-gray-50 text-right">
                  <Link href={`/go/${tool.slug}`} className="text-indigo-600 font-bold hover:underline flex items-center justify-end group">
                    View Deal <ExternalLink size={14} className="ml-1 transition-transform group-hover:translate-x-1" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const parseContent = (html: string) => {
    if (!html) return null;
    
    // Replace [COMPARISON_TABLE] with a div that we will replace or handle
    // For simplicity with dangerouslySetInnerHTML, we can't easily inject components
    // So we split the content
    const parts = html.split('[COMPARISON_TABLE]');
    
    return (
      <>
        {parts.map((part, index) => {
          // Handle CTA Buttons within parts if needed, but for now just process comparison table
          // A better way is to use a library, but let's do safe split rendering
          return (
            <div key={index}>
              <div dangerouslySetInnerHTML={{ __html: sanitizeHTML(part) }} />
              {index < parts.length - 1 && renderComparisonTable()}
            </div>
          );
        })}
      </>
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent shadow-xl"></div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900">Oops! Guide Not Found</h2>
        <p className="mt-2 text-gray-600">We couldn't find the expert guide you're looking for.</p>
        <Link href="/" className="mt-6 text-blue-600 hover:underline">
          Back to Directory
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Search/Nav Header */}
      <nav className="sticky top-0 z-20 border-b border-gray-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Directory
          </Link>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-xs font-bold text-gray-900 uppercase tracking-tighter">Verified Review 2026</span>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                <Sparkles className="h-6 w-6" />
              </div>
              <span className="text-sm font-bold uppercase tracking-widest text-indigo-600">Premium Buy Guide</span>
            </div>

            <h1 className="text-4xl font-black tracking-tight text-gray-900 sm:text-6xl leading-tight">
              {page.seo_title}
            </h1>
            
            {/* ABOVE THE FOLD CTA for specific high-value keyword */}
            {slug === 'best-ai-video-generator-alternatives' && (
              <div className="mt-8">
                <AffiliateCTA 
                  slug="heygen" 
                  name="HeyGen" 
                  variant="featured" 
                  ctaText="Get Started with HeyGen" 
                />
              </div>
            )}

            <p className="mt-6 text-xl text-gray-600 leading-relaxed max-w-3xl">
              Maximize your efficiency with the best {page.niche_name} options. We analyzed the top and lower-tier tools to find the highest value for you.
            </p>
          </motion.div>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 pt-12 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          {/* Main Content Rendered from HTML */}
          <div className="seo-content prose prose-slate prose-lg max-w-none 
            prose-h2:text-3xl prose-h2:font-black prose-h2:tracking-tight prose-h2:mt-16 prose-h2:mb-8
            prose-h3:text-2xl prose-h3:font-bold prose-h3:text-indigo-700 prose-h3:mt-12 prose-h3:mb-4
            prose-p:text-gray-700 prose-p:leading-relaxed
            prose-ul:my-8 prose-li:my-2
            prose-a:text-indigo-600 prose-a:font-bold prose-a:no-underline hover:prose-a:underline">
            {parseContent(page.seo_content_html)}
            
            {/* MID-CONTENT CTA */}
            {slug === 'best-ai-video-generator-alternatives' && (
              <div className="my-12 flex justify-center">
                <AffiliateCTA 
                  slug="synthesia" 
                  name="Synthesia" 
                  variant="secondary" 
                  ctaText="Try Synthesia Free" 
                />
              </div>
            )}
          </div>

          {/* END OF CONTENT CTA */}
          {slug === 'best-ai-video-generator-alternatives' && (
            <div className="mt-16 p-8 border-2 border-dashed border-indigo-200 rounded-3xl bg-indigo-50/50 text-center">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Final Verdict for Professional Audio</h3>
              <p className="text-gray-600 mb-6">Need the best AI voice generator to pair with your videos?</p>
              <AffiliateCTA 
                slug="elevenlabs" 
                name="ElevenLabs" 
                variant="secondary" 
                ctaText="View Deal for ElevenLabs" 
              />
            </div>
          )}

          {/* Sticky CTA Card */}
          <div className="mt-20 rounded-[2.5rem] bg-indigo-900 p-8 text-white shadow-2xl sm:p-16 relative overflow-hidden">
            <div className="relative z-10 text-center">
              <h2 className="text-3xl font-black sm:text-5xl mb-6">Ready to Scale Your ${page.niche_name}?</h2>
              <p className="mt-6 text-xl text-indigo-100 max-w-2xl mx-auto mb-10">
                Don't waste time on tools that don't convert. Choose from our vetted list and start growing today.
              </p>
              <div className="flex justify-center">
                <AffiliateCTA slug={tools[0]?.slug || ''} name={tools[0]?.name || page.niche_name} variant="featured" ctaText="Get Started with Our #1 Choice" />
              </div>
            </div>
            {/* Decal decoration */}
            <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
            <div className="absolute left-0 bottom-0 h-48 w-48 rounded-full bg-white/5 blur-2xl"></div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
