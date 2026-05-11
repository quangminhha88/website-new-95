-- ============================================================================
-- Content refresh automation
-- ============================================================================

create table if not exists content_refresh_jobs (
  id bigserial primary key,
  resource_type text not null check (resource_type in ('tool', 'niche_page')),
  resource_id uuid not null,
  resource_slug text,
  reason text not null check (reason in ('stale', 'low_ctr', 'manual', 'low_quality')),
  triggered_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'skipped')),
  ai_model text,
  duration_ms int,
  fields_updated text[],
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_refresh_jobs_resource
  on content_refresh_jobs (resource_type, resource_id, completed_at desc);
create index if not exists idx_refresh_jobs_status_time
  on content_refresh_jobs (status, triggered_at desc);

-- Last refresh per tool — drives the "needs refresh" query
create or replace view tool_last_refresh as
select distinct on (resource_id)
  resource_id as tool_id,
  completed_at as last_refreshed_at,
  status as last_status,
  reason as last_reason
from content_refresh_jobs
where resource_type = 'tool' and completed_at is not null
order by resource_id, completed_at desc;

alter table content_refresh_jobs enable row level security;
drop policy if exists "refresh_jobs_service_write" on content_refresh_jobs;
create policy "refresh_jobs_service_write" on content_refresh_jobs for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "refresh_jobs_admin_read" on content_refresh_jobs;
create policy "refresh_jobs_admin_read" on content_refresh_jobs for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
