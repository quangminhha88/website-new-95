
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { generateToolFAQ } from '../src/services/geminiService';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function generateToolFAQs() {
  console.log("❓ Starting FAQ generation for tools...");

  const { data: tools, error: toolsError } = await supabase
    .from('tools')
    .select('id, name')
    .is('faqs_html', null);

  if (toolsError) {
    console.error("Error fetching tools:", toolsError);
    return;
  }

  console.log(`Generating FAQs for ${tools?.length || 0} tools...`);

  for (const tool of (tools || [])) {
    try {
      console.log(`✍️ Generating FAQ for ${tool.name}...`);
      
      const faqHtml = await generateToolFAQ(tool.name);

      const { error: updateError } = await supabase
        .from('tools')
        .update({
          faqs_html: faqHtml,
          updated_at: new Date().toISOString()
        })
        .eq('id', tool.id);

      if (updateError) {
        console.error(`  ↳ Failed to update ${tool.name}:`, updateError.message);
      } else {
        console.log(`  ✅ ${tool.name} FAQ generated.`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`  ↳ Error processing ${tool.name}:`, err);
    }
  }

  console.log("🏁 FAQ generation process complete!");
}

generateToolFAQs();
