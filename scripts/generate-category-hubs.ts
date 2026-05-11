
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { generateCategoryHubSEO } from '../src/services/aiService';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function generateCategoryHubs() {
  console.log("📂 Starting Category Hub Page Generation...");

  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('*');

  if (catError) {
    console.error("Error fetching categories:", catError);
    return;
  }

  console.log(`Processing ${categories?.length || 0} categories...`);

  for (const category of (categories || [])) {
    try {
      console.log(`\n🔍 Category: ${category.name}...`);
      
      // Fetch all tools in this category
      const { data: tools } = await supabase
        .from('tools')
        .select('name, slug')
        .eq('category_id', category.id);

      if (!tools || tools.length === 0) {
        console.log(`  ↳ No tools found for this category. Skipping.`);
        continue;
      }

      console.log(`  ↳ Generating hub content with ${tools.length} internal links...`);
      const hubData = await generateCategoryHubSEO(category.name, tools);

      const { error: updateError } = await supabase
        .from('categories')
        .update({
          seo_title: hubData.title,
          seo_meta_description: hubData.meta_description,
          seo_content_html: hubData.content_html,
          updated_at: new Date().toISOString()
        })
        .eq('id', category.id);

      if (updateError) {
        console.error(`  ↳ Error updating category: ${updateError.message}`);
      } else {
        console.log(`  ✅ Hub page for "${category.name}" updated successfully.`);
      }

      // Throttle
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      console.error(`  ↳ Error processing category ${category.name}:`, err);
    }
  }

  console.log("\n🏁 Category hub generation complete!");
}

generateCategoryHubs();
