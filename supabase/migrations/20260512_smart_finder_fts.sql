-- ============================================================================
-- Smart Finder: Full-Text Search infrastructure
--
-- Strategy:
--   1. Materialised tsvector column (auto-updated via trigger) with weights:
--        A: name + tagline    (highest)
--        B: features          (medium)
--        C: description       (lower)
--   2. GIN index on the column for sub-ms lookups
--   3. RPC `search_tools_fts` returns ranked, EPC-boosted matches in one call
--      (no second roundtrip needed for the score join)
-- ============================================================================

-- ── 1. tsvector column + trigger ────────────────────────────────────────
alter table tools
  add column if not exists search_vector tsvector;

-- Recompute on insert/update
create or replace function tools_search_vector_update()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.tagline, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(array_to_string(new.features, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.description, '')), 'C');
  return new;
end;
$$;

drop trigger if exists trg_tools_search_vector on tools;
create trigger trg_tools_search_vector
  before insert or update of name, tagline, features, description
  on tools
  for each row execute function tools_search_vector_update();

-- One-time backfill for existing rows (idempotent)
update tools
set search_vector =
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(tagline, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(array_to_string(features, ' '), '')), 'B') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'C')
where search_vector is null;

create index if not exists idx_tools_search_vector
  on tools using gin (search_vector);

-- ── 2. RPC: search + EPC-aware re-rank in a single query ────────────────
-- Combines:
--   ts_rank_cd          → relevance to query
--   tool_revenue_score  → EPC × confidence + commission × 0.5  (Phase 2)
-- Final score = relevance × 1.0 + revenue_score × 0.05
-- (Tweak weights in one place; callers don't need to know the formula.)
create or replace function search_tools_fts(
  query_text text,
  category_filter uuid default null,
  max_price numeric default null,
  match_count int default 20
)
returns table (
  id uuid,
  slug text,
  name text,
  tagline text,
  description text,
  logo_url text,
  category_id uuid,
  pricing_data jsonb,
  features text[],
  avg_rating numeric,
  relevance real,
  revenue_score numeric,
  final_score numeric
)
language sql stable
as $$
  with query as (
    select websearch_to_tsquery('english', coalesce(query_text, '')) as q
  ),
  matches as (
    select
      t.id,
      t.slug,
      t.name,
      t.tagline,
      t.description,
      t.logo_url,
      t.category_id,
      t.pricing_data,
      t.features,
      t.avg_rating,
      case
        when (select q from query) = ''::tsquery then 0.0
        else ts_rank_cd(t.search_vector, (select q from query))
      end as relevance,
      coalesce(trs.revenue_score, 0)::numeric as revenue_score
    from tools t
    left join tool_revenue_score trs on trs.id = t.id
    where t.moderation_status = 'approved'
      and (
        (select q from query) = ''::tsquery
        or t.search_vector @@ (select q from query)
      )
      and (category_filter is null or t.category_id = category_filter)
      and (
        max_price is null
        or (t.pricing_data->>'starting_price')::numeric <= max_price
        or t.pricing_data is null
      )
  )
  select
    m.*,
    (m.relevance + m.revenue_score * 0.05)::numeric as final_score
  from matches m
  order by final_score desc nulls last, m.avg_rating desc nulls last
  limit match_count;
$$;

-- Allow public to call the RPC (RLS on tools still applies inside)
grant execute on function search_tools_fts to anon, authenticated;
