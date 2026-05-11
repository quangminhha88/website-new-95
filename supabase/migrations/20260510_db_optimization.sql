-- ============================================================================
-- Phase 3: Scale & Enterprise — DB Optimization
--   - Hot-path indexes for SEO + analytics queries
--   - Materialized views for expensive aggregations
--   - pgvector for semantic search
-- ============================================================================

-- ── 1. Hot-path indexes ───────────────────────────────────────────────────

-- Tools: most queries filter by moderation_status + sort by some metric
create index if not exists idx_tools_approved_rating
  on tools (avg_rating desc nulls last)
  where moderation_status = 'approved';

create index if not exists idx_tools_approved_commission
  on tools (commission_estimate desc nulls last)
  where moderation_status = 'approved';

create index if not exists idx_tools_category_approved
  on tools (category_id, moderation_status)
  where moderation_status = 'approved';

create index if not exists idx_tools_slug_approved
  on tools (slug)
  where moderation_status = 'approved';

create index if not exists idx_tools_updated
  on tools (updated_at desc);

-- Niche pages: same pattern
create index if not exists idx_niche_pages_approved_slug
  on niche_pages (slug)
  where moderation_status = 'approved';

-- Affiliate clicks: time-series queries dominate (revenue dashboards)
create index if not exists idx_affiliate_clicks_tool_time
  on affiliate_clicks (tool_id, clicked_at desc);

create index if not exists idx_affiliate_clicks_source_time
  on affiliate_clicks (source, clicked_at desc);

create index if not exists idx_affiliate_clicks_recent
  on affiliate_clicks (clicked_at desc);

-- SEO metrics: heavy on aggregation by (slug, variant, event_type, day)
-- Existing indexes from earlier migrations cover (path, event, time) and
-- (resource_slug, variant_index, event_type). Add a slug-only index for
-- daily aggregates without variant breakdown:
create index if not exists idx_seo_metrics_resource_time
  on seo_metrics (resource_slug, created_at desc)
  where resource_slug is not null;

-- Categories: lookups by slug
create index if not exists idx_categories_slug on categories (slug);

-- ── 2. Materialized views ────────────────────────────────────────────────

-- mv_daily_traffic — last 30 days, one row per (day, resource_slug, event_type)
-- Used by /admin/analytics. Refresh nightly.
drop materialized view if exists mv_daily_traffic cascade;
create materialized view mv_daily_traffic as
select
  date_trunc('day', created_at)::date as day,
  resource_slug,
  page_type,
  event_type,
  count(*) as event_count,
  count(distinct visitor_id) as unique_visitors
from seo_metrics
where created_at > now() - interval '30 days'
  and resource_slug is not null
group by 1, 2, 3, 4;

create unique index if not exists idx_mv_daily_traffic
  on mv_daily_traffic (day, resource_slug, page_type, event_type);

-- mv_top_pages_30d — pre-aggregated for the dashboard "top pages" widget
drop materialized view if exists mv_top_pages_30d cascade;
create materialized view mv_top_pages_30d as
select
  resource_slug,
  page_type,
  count(*) filter (where event_type = 'impression') as impressions,
  count(*) filter (where event_type = 'affiliate_click') as clicks,
  case
    when count(*) filter (where event_type = 'impression') > 0
    then round(
      100.0 * count(*) filter (where event_type = 'affiliate_click')
      / count(*) filter (where event_type = 'impression'),
      3
    )
    else 0
  end as ctr_pct,
  avg(duration_ms) filter (where event_type = 'dwell') as avg_dwell_ms
from seo_metrics
where created_at > now() - interval '30 days'
  and resource_slug is not null
group by 1, 2;

create unique index if not exists idx_mv_top_pages
  on mv_top_pages_30d (resource_slug, page_type);

create index if not exists idx_mv_top_pages_impressions
  on mv_top_pages_30d (impressions desc);

-- mv_revenue_by_day — for the revenue chart on /admin/revenue
drop materialized view if exists mv_revenue_by_day cascade;
create materialized view mv_revenue_by_day as
select
  date_trunc('day', clicked_at)::date as day,
  count(*) as clicks,
  count(distinct ip) as unique_clicks
from affiliate_clicks
where clicked_at > now() - interval '90 days'
group by 1
order by 1 desc;

create unique index if not exists idx_mv_revenue_day on mv_revenue_by_day (day);

-- Helper function to refresh all matviews atomically.
-- Call from cron: select refresh_analytics_matviews();
create or replace function refresh_analytics_matviews()
returns void
language plpgsql
security definer
as $$
begin
  refresh materialized view concurrently mv_daily_traffic;
  refresh materialized view concurrently mv_top_pages_30d;
  refresh materialized view concurrently mv_revenue_by_day;
end;
$$;

-- ── 3. pgvector for semantic search ──────────────────────────────────────
create extension if not exists vector;

-- 768 dimensions matches Gemini text-embedding-004
-- (or 1536 for OpenAI text-embedding-3-small — adjust per provider)
alter table tools
  add column if not exists embedding vector(768),
  add column if not exists embedding_updated_at timestamptz;

alter table niche_pages
  add column if not exists embedding vector(768),
  add column if not exists embedding_updated_at timestamptz;

-- HNSW index — fast ANN search for 100k+ rows
-- (For ≤10k rows, ivfflat is fine and indexes faster.)
create index if not exists idx_tools_embedding
  on tools using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create index if not exists idx_niche_pages_embedding
  on niche_pages using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- Search function — RPC-callable from the client.
-- Returns top-K tools by cosine similarity to the query embedding.
create or replace function semantic_search_tools(
  query_embedding vector(768),
  match_threshold float default 0.5,
  match_count int default 10
)
returns table (
  id uuid,
  slug text,
  name text,
  tagline text,
  description text,
  similarity float
)
language sql stable
as $$
  select
    t.id,
    t.slug,
    t.name,
    t.tagline,
    t.description,
    1 - (t.embedding <=> query_embedding) as similarity
  from tools t
  where t.embedding is not null
    and t.moderation_status = 'approved'
    and 1 - (t.embedding <=> query_embedding) > match_threshold
  order by t.embedding <=> query_embedding
  limit match_count;
$$;

-- ── 4. ANALYZE so the planner picks up the new stats ─────────────────────
analyze tools;
analyze niche_pages;
analyze affiliate_clicks;
analyze seo_metrics;
