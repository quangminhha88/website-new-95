
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { improveContentUniqueness } from '../src/services/geminiService';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function auditSEO() {
  console.log("🔍 Starting SEO Audit & Content Uniqueness Improvement...");

  // Fetch tools with content that hasn't been "audited" yet (we can use a flag or just target ones with content)
  const { data: tools, error: toolsError } = await supabase
    .from('tools')
    .select('id, name, seo_content_html')
    .not('seo_content_html', 'is', null);

  if (toolsError) {
    console.error("Error fetching tools:", toolsError);
    return;
  }

  console.log(`Auditing ${tools?.length || 0} pages...`);

  for (const tool of (tools || [])) {
    try {
      console.log(`✍️ Auditing content for ${tool.name}...`);
      
      const improvedHtml = await improveContentUniqueness(tool.seo_content_html);

      const { error: updateError } = await supabase
        .from('tools')
        .update({
          seo_content_html: improvedHtml,
          updated_at: new Date().toISOString()
        })
        .eq('id', tool.id);

      if (updateError) {
        console.error(`Failed to update ${tool.name}:`, updateError.message);
      } else {
        console.log(`✅ ${tool.name} uniqueness improved.`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`Error auditing ${tool.name}:`, err);
    }
  }

  console.log("🏁 Audit process complete!");
}

auditSEO();
