-- ============================================================================
-- Phase 3: Observability tables
-- ============================================================================

create table if not exists web_vitals (
  id bigserial primary key,
  name text not null check (name in ('LCP', 'FID', 'INP', 'CLS', 'TTFB', 'FCP')),
  value int not null,
  rating text not null check (rating in ('good', 'needs-improvement', 'poor')),
  page_path text not null,
  navigation_type text,
  created_at timestamptz not null default now()
);

create index if not exists idx_web_vitals_path_name_time
  on web_vitals (page_path, name, created_at desc);

create index if not exists idx_web_vitals_rating
  on web_vitals (rating, created_at desc) where rating = 'poor';

alter table web_vitals enable row level security;
drop policy if exists "vitals_service_role" on web_vitals;
create policy "vitals_service_role" on web_vitals for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Business metrics view: daily revenue + click totals + CTR
-- Used by /admin/revenue dashboard and the principal-engineer health check
create or replace view business_metrics_daily as
select
  date_trunc('day', clicked_at)::date as day,
  count(*) as total_clicks,
  count(distinct ip) as unique_clicks,
  count(distinct tool_id) as tools_clicked
from affiliate_clicks
where clicked_at > now() - interval '90 days'
group by 1
order by 1 desc;

-- p75 web vitals view — what to ship to the dashboard
create or replace view web_vitals_p75 as
select
  page_path,
  name,
  percentile_cont(0.75) within group (order by value) as p75,
  percentile_cont(0.95) within group (order by value) as p95,
  count(*) as samples
from web_vitals
where created_at > now() - interval '7 days'
group by page_path, name
having count(*) >= 10;
