-- ============================================================================
-- AI usage + cost tracking (table: ai_usage_logs)
-- ============================================================================

create table if not exists ai_usage_logs (
  id bigserial primary key,
  provider text not null check (provider in ('gemini', 'anthropic')),
  model text not null,
  operation text not null,
  resource_type text check (resource_type in ('tool', 'niche_page', 'comparison')),
  resource_slug text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10, 6),
  latency_ms int,
  success boolean not null,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_time on ai_usage_logs (created_at desc);
create index if not exists idx_ai_usage_provider_time on ai_usage_logs (provider, created_at desc);

create or replace view ai_usage_daily as
select
  date_trunc('day', created_at)::date as day,
  provider,
  model,
  count(*) as calls,
  count(*) filter (where not success) as failures,
  sum(input_tokens) as input_tokens,
  sum(output_tokens) as output_tokens,
  sum(cost_usd) as cost_usd,
  avg(latency_ms)::int as avg_latency_ms
from ai_usage_logs
where created_at > now() - interval '90 days'
group by 1, 2, 3
order by day desc, cost_usd desc;

alter table ai_usage_logs enable row level security;
drop policy if exists "ai_usage_service_write" on ai_usage_logs;
create policy "ai_usage_service_write" on ai_usage_logs for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "ai_usage_admin_read" on ai_usage_logs;
create policy "ai_usage_admin_read" on ai_usage_logs for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
