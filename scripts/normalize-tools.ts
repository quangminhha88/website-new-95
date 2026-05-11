import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { normalizeToolData } from '../src/services/geminiService';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function normalizeAllTools() {
  console.log("🧹 Starting Data Normalization (Cleaning up features & pricing)...");

  const { data: tools } = await supabase
    .from('tools')
    .select('id, name, description, features');

  for (const tool of (tools || [])) {
    try {
      console.log(`  🔍 Normalizing: ${tool.name}...`);
      
      const normalized = await normalizeToolData(tool.description, tool.features || []);
      
      // Update with structured data
      // We assume the DB has columns for complexity and pricing_summary
      await supabase.from('tools').update({
        features: normalized.features,
        pricing_summary: normalized.pricing,
        complexity: normalized.complexity,
        updated_at: new Date().toISOString()
      }).eq('id', tool.id);
      
      console.log(`    ✅ Standardized.`);
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (e) {
      console.error(`    ❌ Failed:`, e);
    }
  }

  console.log("\n🏁 Normalization complete. All tools are now comparable.");
}

normalizeAllTools();
