/**
 * Add internal links to existing tool/niche pages.
 *
 * Uses src/seo/internal-linking.ts to build a link plan, then prompts
 * Gemini to weave them into the page body — no random HTML injection,
 * no bare URL dumps. Pages already at link cap are skipped.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { addInternalLinksToContent } from '../src/services/geminiService';
import {
  buildLinkPlan,
  countInternalLinks,
  planAsLLMInstruction,
} from '../src/seo/internal-linking';
import type { Tool, Category } from '../src/types/tool';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

interface ToolRow extends Tool {}

async function loadCandidates(): Promise<{
  tools: ToolRow[];
  categories: Category[];
  niches: { slug: string; niche_name: string }[];
}> {
  const [toolsRes, catsRes, nichesRes] = await Promise.all([
    supabase
      .from('tools')
      .select('id, slug, name, tagline, category_id, commission_estimate, avg_rating'),
    supabase.from('categories').select('id, slug, name'),
    supabase.from('niche_pages').select('slug, niche_name'),
  ]);

  return {
    tools: (toolsRes.data ?? []) as ToolRow[],
    categories: (catsRes.data ?? []) as Category[],
    niches: nichesRes.data ?? [],
  };
}

async function main() {
  console.log('🔗 Internal linking pass — building plans for all tools...');
  const candidates = await loadCandidates();
  console.log(`   Pool: ${candidates.tools.length} tools, ${candidates.categories.length} categories`);

  const { data: tools, error } = await supabase
    .from('tools')
    .select('id, name, slug, category_id, full_description, alternatives_seo_content')
    .not('full_description', 'is', null);
  if (error) throw error;

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const tool of tools ?? []) {
    const content = tool.full_description ?? '';
    const audit = countInternalLinks(content);

    // Skip pages already healthy
    if (audit.withinRange && audit.count >= 7) {
      console.log(`   ⏭  ${tool.name} — ${audit.count} links (already healthy)`);
      skipped++;
      continue;
    }

    const plan = buildLinkPlan({
      currentSlug: tool.slug,
      currentType: 'tool',
      currentCategoryId: tool.category_id,
      currentText: content,
      candidates,
    });

    if (plan.total === 0) {
      console.log(`   ⏭  ${tool.name} — no eligible link targets`);
      skipped++;
      continue;
    }

    try {
      const enhanced = await addInternalLinksToContent({
        existingContent: content,
        instructions: planAsLLMInstruction(plan),
        targetUrls: [...plan.required, ...plan.optional].map((t) => t.url),
      });

      // Verify the AI actually added links
      const newAudit = countInternalLinks(enhanced);
      if (newAudit.count < 5) {
        console.log(`   ⚠ ${tool.name} — AI returned only ${newAudit.count} links, skipping save`);
        failed++;
        continue;
      }

      const { error: updErr } = await supabase
        .from('tools')
        .update({ full_description: enhanced, updated_at: new Date().toISOString() })
        .eq('id', tool.id);
      if (updErr) throw updErr;

      console.log(`   ✅ ${tool.name} — ${audit.count} → ${newAudit.count} links`);
      processed++;
    } catch (err) {
      console.error(`   ❌ ${tool.name} — ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }

    // Soft rate-limit
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n📊 Summary: ${processed} updated, ${skipped} skipped, ${failed} failed`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
