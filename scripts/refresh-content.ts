import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { refreshContent } from '../src/services/geminiService';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function refreshStaleContent() {
  console.log("♻️ Starting Content Refresh Cycle...");

  // Let's refresh Niche Pages as they have the most bulk content
  console.log("\n--- Refreshing Niche Pages ---");
  const { data: niches } = await supabase
    .from('niche_pages')
    .select('id, niche_name, seo_content_html')
    .limit(10); // Batching to 10 for safety

  for (const niche of (niches || [])) {
    try {
      if (!niche.seo_content_html) continue;
      
      console.log(`  🔄 Refreshing: ${niche.niche_name}...`);
      const updatedHtml = await refreshContent(niche.niche_name, niche.seo_content_html);
      
      const { error } = await supabase
        .from('niche_pages')
        .update({
          seo_content_html: updatedHtml,
          updated_at: new Date().toISOString()
        })
        .eq('id', niche.id);

      if (error) throw error;
      console.log(`    ✅ Refresh complete.`);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {
      console.error(`    ❌ Failed to refresh ${niche.niche_name}:`, e);
    }
  }

  // Also refresh Comparisons
  console.log("\n--- Refreshing Comparisons ---");
  const { data: comps } = await supabase
    .from('comparisons')
    .select('id, slug, content_html')
    .limit(5);

  for (const comp of (comps || [])) {
    try {
      if (!comp.content_html) continue;

      console.log(`  🔄 Refreshing Comparison: ${comp.slug}...`);
      const updatedHtml = await refreshContent(comp.slug.replace(/-/g, ' '), comp.content_html);

      await supabase
        .from('comparisons')
        .update({
          content_html: updatedHtml,
          updated_at: new Date().toISOString()
        })
        .eq('id', comp.id);
      
      console.log(`    ✅ Refresh complete.`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {
      console.error(`    ❌ Failed to refresh ${comp.slug}:`, e);
    }
  }

  console.log("\n🏁 Content Refresh Cycle Complete!");
}

refreshStaleContent();
