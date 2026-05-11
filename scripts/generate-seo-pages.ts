
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { generateFullPageSEO } from '../src/services/geminiService';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function generateSEOPages() {
  console.log("📄 Starting full SEO page generation...");

  // Fetch tools that have been enriched but don't have SEO content yet
  const { data: tools, error: toolsError } = await supabase
    .from('tools')
    .select('*, categories(name)')
    .not('full_description', 'is', null);

  if (toolsError) {
    console.error("Error fetching tools:", toolsError);
    return;
  }

  console.log(`Processing ${tools?.length || 0} tools for full SEO pages...`);

  for (const tool of (tools || [])) {
    try {
      console.log(`✍️ Generating SEO page for ${tool.name}...`);
      
      const seoData = await generateFullPageSEO(tool);

      // We might need a separate table for SEO pages or add columns to tools
      // For now, let's assume we add it to the tools table or log it
      const { error: updateError } = await supabase
        .from('tools')
        .update({
          seo_title: seoData.title,
          seo_meta_description: seoData.meta_description,
          seo_content_html: seoData.content_html,
          updated_at: new Date().toISOString()
        })
        .eq('id', tool.id);

      if (updateError) {
        console.error(`Failed to update SEO for ${tool.name}:`, updateError.message);
      } else {
        console.log(`✅ SEO page generated for ${tool.name}.`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`Error processing SEO for ${tool.name}:`, err);
    }
  }

  console.log("🏁 SEO Page generation complete!");
}

generateSEOPages();
