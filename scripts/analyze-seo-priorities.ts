import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { identifySeoPriorities } from '../src/services/geminiService';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runSeoAnalysis() {
  console.log("📊 Starting SEO Prioritization Analysis...");
  
  const pages: { path: string; title: string }[] = [];

  // Gather Tools
  const { data: tools } = await supabase.from('tools').select('name, slug');
  (tools || []).forEach(t => pages.push({ path: `/tools/${t.slug}`, title: t.name }));

  // Gather Niche Pages (These are usually high potential)
  const { data: niches } = await supabase.from('niche_pages').select('niche_name, slug');
  (niches || []).forEach(n => pages.push({ path: `/best/${n.slug}`, title: n.niche_name }));

  // Gather Comparisons
  const { data: comps } = await supabase.from('comparisons').select('slug');
  (comps || []).forEach(c => pages.push({ path: `/vs/${c.slug}`, title: c.slug.replace(/-/g, ' ') }));

  console.log(`🔍 Total pages collected: ${pages.length}. Running Gemini Analysis...`);

  // Run analysis in chunks to stay within prompt limits
  const chunkSize = 50;
  const allPriorities: any[] = [];
  
  for (let i = 0; i < pages.length; i += chunkSize) {
    const chunk = pages.slice(i, i + chunkSize);
    console.log(`  Processing chunk ${i / chunkSize + 1}...`);
    const results = await identifySeoPriorities(chunk);
    allPriorities.push(...results);
  }

  // Sort by High potential
  const highPotential = allPriorities.filter(p => p.potential === 'High');
  const mediumPotential = allPriorities.filter(p => p.potential === 'Medium');

  console.log("\n🚀 --- HIGH PRIORITY PAGES (Rank Fast Opportunity) ---");
  highPotential.forEach(p => {
    console.log(`[HIGH] ${p.path}`);
    console.log(`  Target Keyword: ${p.keyword}`);
    console.log(`  Why: ${p.reason}`);
    console.log('---');
  });

  console.log("\n📈 --- MEDIUM PRIORITY PAGES ---");
  mediumPotential.forEach(p => {
    console.log(`[MEDIUM] ${p.path}`);
    console.log(`  Target Keyword: ${p.keyword}`);
    console.log('---');
  });

  console.log(`\n✅ Analysis Complete. Identified ${highPotential.length} high-potential "low hanging fruit" pages.`);
}

runSeoAnalysis();
