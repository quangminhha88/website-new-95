
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function generateComparisons() {
  console.log("🔍 Fetching tools to generate comparisons...");

  // 1. Fetch all tools and categories
  const { data: tools, error: toolsError } = await supabase
    .from('tools')
    .select('id, name, slug, category_id');

  if (toolsError) {
    console.error("Error fetching tools:", toolsError);
    return;
  }

  // 2. Group tools by category
  const toolsByCategory: Record<string, typeof tools> = {};
  tools.forEach(tool => {
    if (!toolsByCategory[tool.category_id]) {
      toolsByCategory[tool.category_id] = [];
    }
    toolsByCategory[tool.category_id].push(tool);
  });

  const comparisonPairs: any[] = [];

  // 3. Generate pairs for each category
  Object.values(toolsByCategory).forEach(categoryTools => {
    if (categoryTools.length < 2) return;

    for (let i = 0; i < categoryTools.length; i++) {
      for (let j = i + 1; j < categoryTools.length; j++) {
        const toolA = categoryTools[i];
        const toolB = categoryTools[j];

        // Ensure consistent slug order (alphabetical)
        const [first, second] = [toolA, toolB].sort((a, b) => a.slug.localeCompare(b.slug));
        const slug = `${first.slug}-vs-${second.slug}`;

        comparisonPairs.push({
          tool_a_id: first.id,
          tool_b_id: second.id,
          slug: slug
        });
      }
    }
  });

  console.log(`✨ Generated ${comparisonPairs.length} comparison pairs.`);

  if (comparisonPairs.length === 0) {
    console.log("No comparisons to insert.");
    return;
  }

  // 4. Insert into comparisons table
  const { error: insertError } = await supabase
    .from('comparisons')
    .upsert(comparisonPairs, { onConflict: 'slug' });

  if (insertError) {
    console.error("Error inserting comparisons:", insertError.message);
  } else {
    console.log("✅ Comparisons seeded successfully!");
  }
}

generateComparisons();
