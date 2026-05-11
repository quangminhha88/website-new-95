
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { generateConversionHook } from '../src/services/geminiService';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function generateConversionHooks() {
  console.log("🪝 Starting Conversion Hook generation for tools...");

  // Fetch tools that don't have a conversion hook yet
  const { data: tools, error: toolsError } = await supabase
    .from('tools')
    .select('id, name, category_id')
    .is('conversion_hook', null);

  if (toolsError) {
    console.error("Error fetching tools:", toolsError);
    return;
  }

  console.log(`Processing ${tools?.length || 0} tools...`);

  for (const tool of (tools || [])) {
    try {
      console.log(`🔍 Finding context for ${tool.name}...`);
      
      // Get alternatives to use as context for the hook
      const { data: alternatives } = await supabase
        .from('tools')
        .select('name')
        .eq('category_id', tool.category_id)
        .neq('id', tool.id)
        .limit(5);

      if (!alternatives || alternatives.length === 0) {
        console.log(`  ↳ No alternatives found for ${tool.name}. Skipping.`);
        continue;
      }

      console.log(`  ↳ Generating hook for ${tool.name}...`);
      const hook = await generateConversionHook(tool.name, alternatives);

      const { error: updateError } = await supabase
        .from('tools')
        .update({
          conversion_hook: hook,
          updated_at: new Date().toISOString()
        })
        .eq('id', tool.id);

      if (updateError) {
        console.error(`  ↳ Failed to update ${tool.name}:`, updateError.message);
      } else {
        console.log(`  ✅ ${tool.name} hook generated.`);
      }

      // Throttle
      await new Promise(resolve => setTimeout(resolve, 1200));
    } catch (err) {
      console.error(`  ↳ Error processing ${tool.name}:`, err);
    }
  }

  console.log("🏁 Conversion Hook generation complete!");
}

generateConversionHooks();
