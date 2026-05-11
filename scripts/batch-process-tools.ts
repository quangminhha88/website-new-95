
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { 
  generateToolContent, 
  generateFullPageSEO, 
  generateAlternativesSEO,
  addInternalLinksToContent
} from '../src/services/geminiService';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function batchProcessTools() {
  console.log("🚀 Starting Absolute Batch Processor (Target: 50 Tools)...");

  // 1. Fetch 50 tools that are least "processed"
  // We'll prioritize ones missing full descriptions or SEO content
  const { data: tools, error: toolsError } = await supabase
    .from('tools')
    .select('*, categories(name)')
    .limit(50);

  if (toolsError) {
    console.error("Error fetching tools:", toolsError);
    return;
  }

  console.log(`Processing batch of ${tools?.length || 0} tools.`);

  const results = [];

  for (const tool of (tools || [])) {
    try {
      console.log(`\n--- Processing [${tool.name}] ---`);
      
      const categoryData = tool.categories;
      const categoryName = Array.isArray(categoryData) 
        ? (categoryData[0]?.name || 'SaaS Tool') 
        : ((categoryData as any)?.name || 'SaaS Tool');

      // Step 1: Enrichment (if missing)
      let enrichedData = {
        description: tool.description,
        full_description: tool.full_description,
        features: tool.features,
        pros: tool.pros,
        cons: tool.cons,
        use_cases: tool.use_cases,
        pricing_summary: tool.pricing_model
      };

      if (!tool.full_description) {
        console.log("  ↳ Enriching basic data...");
        const aiEnrichment = await generateToolContent(tool.name, categoryName);
        enrichedData = { ...aiEnrichment };
      }

      // Step 2: SEO Page Content
      console.log("  ↳ Generating main SEO page...");
      const seoPage = await generateFullPageSEO({ ...tool, ...enrichedData, categoryName });

      // Step 3: Alternatives Page
      console.log("  ↳ Generating Alternatives SEO...");
      const { data: alternatives } = await supabase
        .from('tools')
        .select('name, slug')
        .eq('category_id', tool.category_id)
        .neq('id', tool.id)
        .limit(5);
      
      let alternativesSeo = null;
      if (alternatives && alternatives.length > 0) {
        alternativesSeo = await generateAlternativesSEO(tool, alternatives);
      }

      // Step 4: Internal Linking (NEW)
      console.log("  ↳ Injecting internal links into content...");
      const { data: relatedForLinks } = await supabase
        .from('tools')
        .select('name, slug')
        .eq('category_id', tool.category_id)
        .neq('id', tool.id)
        .limit(10);
      
      let finalContentHtml = seoPage.content_html;
      if (relatedForLinks && relatedForLinks.length > 0) {
        finalContentHtml = await addInternalLinksToContent(tool.name, tool.slug, relatedForLinks, seoPage.content_html);
      }

      // Step 5: Database Update
      const { error: updateError } = await supabase
        .from('tools')
        .update({
          // Enrichment
          description: enrichedData.description,
          full_description: enrichedData.full_description,
          features: enrichedData.features,
          pros: enrichedData.pros,
          cons: enrichedData.cons,
          use_cases: enrichedData.use_cases,
          // SEO Main
          seo_title: seoPage.title,
          seo_meta_description: seoPage.meta_description,
          seo_content_html: finalContentHtml,
          // SEO Alternatives
          alternatives_seo_title: alternativesSeo?.title,
          alternatives_seo_meta: alternativesSeo?.meta_description,
          alternatives_seo_content: alternativesSeo?.content_html,
          updated_at: new Date().toISOString()
        })
        .eq('id', tool.id);

      if (updateError) throw updateError;
      
      console.log(`✅ Fully processed ${tool.name}`);
      results.push({ tool: tool.name, status: 'success' });

      // Throttle to respect API limits
      await new Promise(resolve => setTimeout(resolve, 1500));

    } catch (err) {
      console.error(`❌ Error processing ${tool.name}:`, err);
      results.push({ tool: tool.name, status: 'failed', error: String(err) });
    }
  }

  console.log("\n🏁 Batch Process Finished.");
  console.table(results);
}

batchProcessTools();
