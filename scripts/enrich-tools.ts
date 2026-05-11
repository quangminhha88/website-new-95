
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { generateToolContent } from '../src/services/geminiService';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function enrichTools() {
  console.log("🛠️ Starting tool enrichment process...");

  // 1. Fetch tools that don't have full_description yet
  const { data: tools, error: toolsError } = await supabase
    .from('tools')
    .select('*, categories(name)')
    .is('full_description', null);

  if (toolsError) {
    console.error("Error fetching tools:", toolsError);
    return;
  }

  console.log(`Found ${tools?.length || 0} tools to enrich.`);

  for (const tool of (tools || [])) {
    try {
      console.log(`✨ Enriching ${tool.name}...`);
      
      const categoryData = tool.categories;
      const categoryName = Array.isArray(categoryData) 
        ? (categoryData[0]?.name || 'SaaS Tool') 
        : ((categoryData as any)?.name || 'SaaS Tool');
        
      const enrichedData = await generateToolContent(tool.name, categoryName);

      const { error: updateError } = await supabase
        .from('tools')
        .update({
          description: enrichedData.description,
          full_description: enrichedData.full_description,
          features: enrichedData.features,
          pros: enrichedData.pros,
          cons: enrichedData.cons,
          use_cases: enrichedData.use_cases,
          pricing_model: enrichedData.pricing_summary, // Mapping summary to model for now
          updated_at: new Date().toISOString()
        })
        .eq('id', tool.id);

      if (updateError) {
        console.error(`Failed to update ${tool.name}:`, updateError.message);
      } else {
        console.log(`✅ ${tool.name} enriched successfully.`);
      }

      // Add a small delay to avoid rate limits if needed
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (err) {
      console.error(`Error processing ${tool.name}:`, err);
    }
  }

  console.log("🏁 Enrichment complete!");
}

enrichTools();
