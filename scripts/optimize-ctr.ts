/**
 * CTR optimization batch.
 *
 * Generates fresh title + meta variants for every tool and niche page
 * using the template library in src/seo/ctr-optimizer.ts, then writes
 * the top variant + alternates to Supabase.
 *
 * The `seo_variants` JSONB column stores all candidates so the runtime
 * A/B selector (selectVariantForVisitor) can pick deterministically per
 * visitor. The aggregator script (analyze-ctr-experiments.ts) reads
 * impression/click data from `seo_metrics` table and promotes winners.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { generateVariants, type TitleVariant } from '../src/seo/ctr-optimizer';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

async function processTools() {
  console.log('📈 CTR optimization — tools...');
  const { data: tools, error } = await supabase
    .from('tools')
    .select('id, name, categories(name), pricing_data');
  if (error) throw error;

  let updated = 0;
  for (const tool of tools ?? []) {
    const categoryName = (tool as any).categories?.name as string | undefined;
    const price = (tool as any).pricing_data?.starting_price?.toString() ?? '0';

    const variants = generateVariants(
      'tool',
      { tool: tool.name, category: categoryName ?? 'SaaS', price },
      { keywords: [tool.name, 'review', 'pricing', categoryName ?? ''].filter(Boolean) },
    );

    if (variants.length === 0) continue;
    const winner = variants[0];

    const { error: upd } = await supabase
      .from('tools')
      .update({
        seo_title: winner.title,
        seo_meta_description: winner.meta,
        seo_variants: variants.map(toStored),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tool.id);

    if (upd) {
      console.error(`   ❌ ${tool.name}: ${upd.message}`);
      continue;
    }
    console.log(`   ✅ ${tool.name} — score ${winner.score.toFixed(0)} — "${winner.title}"`);
    updated++;
  }
  console.log(`   ${updated}/${tools?.length ?? 0} tools updated`);
}

async function processNiches() {
  console.log('📈 CTR optimization — niche pages...');
  const { data: niches, error } = await supabase
    .from('niche_pages')
    .select('id, niche_name');
  if (error) throw error;

  let updated = 0;
  for (const n of niches ?? []) {
    const variants = generateVariants(
      'niche',
      { niche: n.niche_name },
      { keywords: [n.niche_name, 'best', 'top'] },
    );
    if (variants.length === 0) continue;
    const winner = variants[0];

    const { error: upd } = await supabase
      .from('niche_pages')
      .update({
        seo_title: winner.title,
        seo_meta_description: winner.meta,
        seo_variants: variants.map(toStored),
      })
      .eq('id', n.id);

    if (upd) {
      console.error(`   ❌ ${n.niche_name}: ${upd.message}`);
      continue;
    }
    console.log(`   ✅ ${n.niche_name} — "${winner.title}"`);
    updated++;
  }
  console.log(`   ${updated}/${niches?.length ?? 0} niches updated`);
}

function toStored(v: TitleVariant) {
  return {
    title: v.title,
    meta: v.meta,
    score: v.score,
    template: v.templateIndex,
  };
}

async function main() {
  await processTools();
  await processNiches();
  console.log('\n✅ CTR optimization batch complete');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
