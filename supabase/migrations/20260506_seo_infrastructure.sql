-- ============================================================================
-- Migration: SEO infrastructure (variants + metrics)
-- Run this in Supabase SQL Editor after the base schema is in place.
-- ============================================================================

-- ── seo_variants column on tools and niche_pages ──────────────────────────
-- Stores the array of A/B title/meta candidates so the runtime selector
-- can pick deterministically per visitor.

alter table tools
  add column if not exists seo_variants jsonb default '[]'::jsonb,
  add column if not exists seo_title text,
  add column if not exists seo_meta_description text;

alter table niche_pages
  add column if not exists seo_variants jsonb default '[]'::jsonb;

-- ── seo_metrics table — impressions, dwell time, affiliate clicks ─────────
create table if not exists seo_metrics (
  id bigserial primary key,
  event_type text not null check (event_type in ('impression', 'dwell', 'affiliate_click')),
  page_path text not null,
  page_type text not null,
  variant_index int,
  resource_slug text,
  duration_ms int,
  target_slug text,
  visitor_id text not null,
  referrer text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_seo_metrics_path_event_time
  on seo_metrics (page_path, event_type, created_at desc);

create index if not exists idx_seo_metrics_resource_event
  on seo_metrics (resource_slug, event_type) where resource_slug is not null;

create index if not exists idx_seo_metrics_variant
  on seo_metrics (resource_slug, variant_index, event_type) where variant_index is not null;

-- ── Aggregate view for the weekly winner-promotion job ────────────────────
create or replace view seo_variant_performance as
select
  resource_slug,
  variant_index,
  count(*) filter (where event_type = 'impression') as impressions,
  count(*) filter (where event_type = 'affiliate_click') as clicks,
  case when count(*) filter (where event_type = 'impression') > 0
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
  and variant_index is not null
group by resource_slug, variant_index;

-- ── RLS: track endpoint inserts via service role; reads restricted to admin
alter table seo_metrics enable row level security;

drop policy if exists "service_role_full" on seo_metrics;
create policy "service_role_full" on seo_metrics
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
