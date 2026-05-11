
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * PHASE 6: ADMIN + SCALING
 * Management script for Direct Deals & Partner Overrides.
 */
async function managePartners() {
  const args = process.argv.slice(2);
  const command = args[0]; // e.g. "prioritize"
  const toolSlug = args[1];
  const weight = parseInt(args[2]) || 100;

  if (!command || !toolSlug) {
    console.log("Usage: tsx scripts/manage-partners.ts prioritize <slug> <weight>");
    return;
  }

  if (command === 'prioritize') {
    console.log(`🚀 Setting direct deal priority for ${toolSlug} (Weight: ${weight})...`);
    
    const { error } = await supabase
      .from('tools')
      .update({ monetization_priority_weight: weight })
      .eq('slug', toolSlug);

    if (error) console.error("❌ Failed to update priority:", error.message);
    else console.log(`✅ ${toolSlug} is now prioritized in all rankings.`);
  }
}

managePartners().catch(console.error);
