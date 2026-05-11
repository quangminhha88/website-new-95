
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * REVENUE-FOCUSED INTERNAL LINKING
 * Strategy:
 * 1. Alternatives -> Comparison Pages (e.g. "HeyGen Alternatives" links to "HeyGen vs Synthesia")
 * 2. Comparisons -> High Payout Tools (Direct affiliate links)
 * 3. All Tool Pages -> Comparison hubs
 */
async function buildRevenueLinks() {
  console.log("🔗 Starting Revenue-Focused Internal Linking Engine...");

  // 1. Fetch all tool pages to see what we can link
  const { data: tools } = await supabase.from('tools').select('id, name, slug');
  if (!tools) return;

  // 2. Fetch all niche pages
  const { data: nichePages } = await supabase.from('niche_pages').select('id, slug, niche_name');
  if (!nichePages) return;

  console.log(`Processing ${nichePages.length} pages for intelligent linking...`);

  for (const page of nichePages) {
    const context = page.niche_name.toLowerCase();
    
    // logic: If a niche page is an "Alternative" page, link to the "Comparison" page of high payout tools
    if (context.includes('alternative') || context.includes('best')) {
      // Find high payout tools related to this niche
      // (Simplified logic: finding tools whose name matches words in the niche)
      const keyword = context.split(' ')[0];
      const relatedTools = tools.filter(t => t.name.toLowerCase().includes(keyword));
      
      if (relatedTools.length > 0) {
        console.log(`💡 Suggested Link for "${page.slug}": Point to comparison involving ${relatedTools[0].name}`);
        // In a real system, we would inject these as structured 'Recommendations' in the 'niche_pages' column
      }
    }
  }

  console.log("✅ Revenue Linking Strategy Mapped.");
}

buildRevenueLinks().catch(console.error);
