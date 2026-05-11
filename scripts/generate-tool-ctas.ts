
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { generateToolCTA } from '../src/services/geminiService';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function generateToolCTAs() {
  console.log("⚡ Starting CTA generation for tools...");

  const { data: tools, error: toolsError } = await supabase
    .from('tools')
    .select('id, name, slug')
    .is('cta_html', null);

  if (toolsError) {
    console.error("Error fetching tools:", toolsError);
    return;
  }

  console.log(`Generating CTAs for ${tools?.length || 0} tools...`);

  for (const tool of (tools || [])) {
    try {
      console.log(`✍️ Generating CTA for ${tool.name}...`);
      
      const ctaHtml = await generateToolCTA(tool.name, tool.slug);

      const { error: updateError } = await supabase
        .from('tools')
        .update({
          cta_html: ctaHtml,
          updated_at: new Date().toISOString()
        })
        .eq('id', tool.id);

      if (updateError) {
        console.error(`  ↳ Failed to update ${tool.name}:`, updateError.message);
      } else {
        console.log(`  ✅ ${tool.name} CTA generated.`);
      }

      await new Promise(resolve => setTimeout(resolve, 800));
    } catch (err) {
      console.error(`  ↳ Error processing ${tool.name}:`, err);
    }
  }

  console.log("🏁 CTA generation process complete!");
}

generateToolCTAs();
