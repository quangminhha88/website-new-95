
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { auditPageContent } from '../src/services/geminiService';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runAudit() {
  console.log("🔍 Starting SEO Quality Audit...");
  const lowQualityPages: any[] = [];

  // 1. Audit Tools
  console.log("--- Auditing Tools ---");
  const { data: tools } = await supabase.from('tools').select('id, name, full_description, faqs_html');
  for (const tool of (tools || [])) {
    const content = `${tool.full_description || ''} ${tool.faqs_html || ''}`;
    if (content.length < 100) {
      lowQualityPages.push({ type: 'Tool', name: tool.name, reason: 'Critically thin content' });
      continue;
    }
    
    try {
      const result = await auditPageContent(tool.name, content);
      if (result.score < 60) {
        lowQualityPages.push({ type: 'Tool', name: tool.name, score: result.score, issues: result.issues, rec: result.recommendation });
        console.log(`  ❌ ${tool.name} flagged (Score: ${result.score})`);
      } else {
        console.log(`  ✅ ${tool.name} passed (Score: ${result.score})`);
      }
    } catch (e) {
      console.error(`  ⚠️ Failed to audit ${tool.name}`);
    }
  }

  // 2. Audit Comparisons
  console.log("\n--- Auditing Comparisons ---");
  const { data: comps } = await supabase.from('comparisons').select('id, slug, content_html');
  for (const comp of (comps || [])) {
    try {
      const result = await auditPageContent(comp.slug, comp.content_html || '');
      if (result.score < 60) {
        lowQualityPages.push({ type: 'Comparison', name: comp.slug, score: result.score, issues: result.issues, rec: result.recommendation });
        console.log(`  ❌ ${comp.slug} flagged (Score: ${result.score})`);
      } else {
        console.log(`  ✅ ${comp.slug} passed (Score: ${result.score})`);
      }
    } catch (e) {
      console.error(`  ⚠️ Failed to audit ${comp.slug}`);
    }
  }

  // 3. Audit Niche Pages
  console.log("\n--- Auditing Niche Pages ---");
  const { data: niches } = await supabase.from('niche_pages').select('id, niche_name, seo_content_html');
  for (const niche of (niches || [])) {
    try {
      const result = await auditPageContent(niche.niche_name, niche.seo_content_html || '');
      if (result.score < 60) {
        lowQualityPages.push({ type: 'Niche Page', name: niche.niche_name, score: result.score, issues: result.issues, rec: result.recommendation });
        console.log(`  ❌ ${niche.niche_name} flagged (Score: ${result.score})`);
      } else {
        console.log(`  ✅ ${niche.niche_name} passed (Score: ${result.score})`);
      }
    } catch (e) {
      console.error(`  ⚠️ Failed to audit ${niche.niche_name}`);
    }
  }

  console.log("\n--- Audit Summary ---");
  if (lowQualityPages.length === 0) {
    console.log("🎉 No low-quality pages detected! Your content is solid.");
  } else {
    console.log(`⚠️ Found ${lowQualityPages.length} pages that need attention:\n`);
    lowQualityPages.forEach(p => {
      console.log(`[${p.type}] ${p.name}`);
      console.log(`  Reason/Score: ${p.reason || p.score}`);
      if (p.issues) console.log(`  Issues: ${p.issues.join(', ')}`);
      if (p.rec) console.log(`  Fix: ${p.rec}`);
      console.log('---');
    });
  }
}

runAudit();
