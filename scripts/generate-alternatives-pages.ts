
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { generateAlternativesSEO } from '../src/services/geminiService';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function generateAlternativesPages() {
  console.log("🔗 Starting Alternatives SEO page generation...");

  // 1. Fetch all tools with their category peers
  const { data: tools, error: toolsError } = await supabase
    .from('tools')
    .select('*, categories(name)');

  if (toolsError) {
    console.error("Error fetching tools:", toolsError);
    return;
  }

  for (const tool of (tools || [])) {
    try {
      console.log(`🧐 Finding alternatives for ${tool.name}...`);
      
      // Get peer tools in the same category
      const { data: alternatives } = await supabase
        .from('tools')
        .select('name, slug')
        .eq('category_id', tool.category_id)
        .neq('id', tool.id)
        .limit(5);

      if (!alternatives || alternatives.length === 0) {
        console.log(`Skipping ${tool.name}: No alternatives found.`);
        continue;
      }

      console.log(`✍️ Generating SEO for Alternatives to ${tool.name}...`);
      const seoData = await generateAlternativesSEO(tool, alternatives);

      const { error: updateError } = await supabase
        .from('tools')
        .update({
          alternatives_seo_title: seoData.title,
          alternatives_seo_meta: seoData.meta_description,
          alternatives_seo_content: seoData.content_html,
          updated_at: new Date().toISOString()
        })
        .eq('id', tool.id);

      if (updateError) {
        console.error(`Failed to update ${tool.name}:`, updateError.message);
      } else {
        console.log(`✅ Alternatives page data seeded for ${tool.name}.`);
      }

      // Respect rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`Error processing ${tool.name}:`, err);
    }
  }

  console.log("🏁 Generation complete!");
}

generateAlternativesPages();
