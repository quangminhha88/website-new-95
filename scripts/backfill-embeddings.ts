/**
 * Backfill embeddings for all approved tools that don't have one yet.
 *
 * Run: npm run embed:backfill
 *
 * Safe to re-run — only processes rows where embedding is null OR
 * embedding_updated_at is older than the tool's updated_at (so edits
 * trigger re-embedding on the next run).
 *
 * Rate-limit: Gemini free tier is ~150 req/min. We sleep 500ms between
 * calls to stay well under that.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { embedText } from '../src/lib/embeddings';

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(url, key);
const SLEEP_MS = 500;

interface ToolRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  features: string[] | null;
  updated_at: string | null;
  embedding_updated_at: string | null;
}

function buildText(t: ToolRow): string {
  return [
    t.name,
    t.tagline,
    t.description,
    (t.features ?? []).join('. '),
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 8000);
}

async function main() {
  console.log('🔍 Backfilling embeddings...');

  const { data: tools, error } = await supabase
    .from('tools')
    .select('id, slug, name, tagline, description, features, updated_at, embedding_updated_at')
    .eq('moderation_status', 'approved')
    .or('embedding_updated_at.is.null');
  if (error) throw error;

  console.log(`Found ${tools?.length ?? 0} tools needing embeddings`);

  let done = 0;
  let failed = 0;
  for (const tool of (tools ?? []) as ToolRow[]) {
    try {
      const text = buildText(tool);
      if (!text.trim()) continue;
      const embedding = await embedText(text);
      const { error: upErr } = await supabase
        .from('tools')
        .update({ embedding, embedding_updated_at: new Date().toISOString() })
        .eq('id', tool.id);
      if (upErr) throw upErr;
      done++;
      if (done % 10 === 0) console.log(`  ${done} done...`);
    } catch (err) {
      failed++;
      console.error(`  ❌ ${tool.slug}: ${err instanceof Error ? err.message : err}`);
    }
    await new Promise((r) => setTimeout(r, SLEEP_MS));
  }

  console.log(`✅ Embedded ${done} tools, ${failed} failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
