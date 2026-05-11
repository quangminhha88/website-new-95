-- ============================================================================
-- Semantic Recommendations — pgvector hybrid search
--
-- Replaces the 768d embedding from 20260510 with 1536d (matches
-- gemini-embedding-001 with MRL output, or OpenAI text-embedding-3-small).
-- ============================================================================

-- Drop old 768d column + index (never backfilled)
drop index if exists idx_tools_embedding;
drop index if exists idx_niche_pages_embedding;
drop function if exists semantic_search_tools(vector, float, int);

alter table tools drop column if exists embedding;
alter table niche_pages drop column if exists embedding;

-- Re-add as 1536d
alter table tools
  add column embedding vector(1536),
  add column if not exists embedding_updated_at timestamptz;

alter table niche_pages
  add column embedding vector(1536),
  add column if not exists embedding_updated_at timestamptz;

create index if not exists idx_tools_embedding
  on tools using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create index if not exists idx_niche_pages_embedding
  on niche_pages using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- ── match_tools_semantic ────────────────────────────────────────────────
-- Hybrid scoring:
--   final = 0.65 × cosine_similarity
--         + 0.20 × ts_rank (zero if no query_text passed)
--         + 0.15 × normalised_revenue_score
-- Tunable in one place; callers don't need to know the formula.
create or replace function match_tools_semantic(
  query_embedding vector(1536),
  query_text text default null,
  match_threshold float default 0.5,
  match_count int default 10,
  exclude_id uuid default null
)
returns table (
  id uuid,
  slug text,
  name text,
  tagline text,
  logo_url text,
  category_id uuid,
  similarity float,
  text_rank float,
  revenue_score numeric,
  final_score float
)
language sql stable
as $$
  with q as (
    select case
      when query_text is null or query_text = '' then null
      else websearch_to_tsquery('english', query_text)
    end as ts
  ),
  scored as (
    select
      t.id,
      t.slug,
      t.name,
      t.tagline,
      t.logo_url,
      t.category_id,
      (1 - (t.embedding <=> query_embedding))::float as similarity,
      coalesce(
        case when (select ts from q) is null then 0
             else ts_rank_cd(t.search_vector, (select ts from q))
        end, 0
      )::float as text_rank,
      coalesce(trs.revenue_score, 0)::numeric as revenue_score
    from tools t
    left join tool_revenue_score trs on trs.id = t.id
    where t.embedding is not null
      and t.moderation_status = 'approved'
      and (exclude_id is null or t.id <> exclude_id)
      and (1 - (t.embedding <=> query_embedding)) > match_threshold
  )
  select
    id, slug, name, tagline, logo_url, category_id,
    similarity, text_rank, revenue_score,
    (similarity * 0.65 + least(text_rank, 1.0) * 0.20 + least(revenue_score / 100.0, 1.0)::float * 0.15)::float
      as final_score
  from scored
  order by final_score desc
  limit match_count;
$$;

grant execute on function match_tools_semantic to anon, authenticated;
