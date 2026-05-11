
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { improveComparisonContent } from '../src/services/geminiService';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function improveComparisons() {
  console.log("⚔️ Starting Comparison Content Improvement Audit...");

  // Fetch comparisons with their tool names
  const { data: comparisons, error: compError } = await supabase
    .from('comparisons')
    .select('*, tool_a:tool_a_id(name), tool_b:tool_b_id(name)')
    .not('content_html', 'is', null);

  if (compError) {
    console.error("Error fetching comparisons:", compError);
    return;
  }

  console.log(`Auditing ${comparisons?.length || 0} comparisons for conversion...`);

  for (const comp of (comparisons || [])) {
    try {
      const toolAName = (comp.tool_a as any)?.name || 'First Tool';
      const toolBName = (comp.tool_b as any)?.name || 'Second Tool';

      console.log(`✍️ Improving: ${toolAName} vs ${toolBName}...`);
      
      const improvedHtml = await improveComparisonContent(toolAName, toolBName, comp.content_html);

      const { error: updateError } = await supabase
        .from('comparisons')
        .update({
          content_html: improvedHtml,
          updated_at: new Date().toISOString()
        })
        .eq('id', comp.id);

      if (updateError) {
        console.error(`  ↳ Failed to update ${toolAName} vs ${toolBName}:`, updateError.message);
      } else {
        console.log(`  ✅ Successfully updated with high-conversion verdict.`);
      }

      // Throttle for API stability
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (err) {
      console.error(`  ↳ Error processing comparison id ${comp.id}:`, err);
    }
  }

  console.log("🏁 Comparison improvement complete!");
}

improveComparisons();
