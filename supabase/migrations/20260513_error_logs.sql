-- ============================================================================
-- error_logs — runtime error capture
-- ============================================================================

create table if not exists error_logs (
  id bigserial primary key,
  message text not null,
  stack text,
  component_stack text,
  source text not null check (source in ('render', 'event', 'async', 'api', 'query')),
  url text,
  page_path text,
  user_agent text,
  user_id uuid references auth.users(id) on delete set null,
  visitor_id text,
  app_version text,
  environment text not null default 'production',
  context jsonb,
  fingerprint text,
  created_at timestamptz not null default now()
);

create index if not exists idx_error_logs_time on error_logs (created_at desc);
create index if not exists idx_error_logs_fingerprint on error_logs (fingerprint, created_at desc);
create index if not exists idx_error_logs_source on error_logs (source, created_at desc);

alter table error_logs enable row level security;

drop policy if exists "error_logs_service_write" on error_logs;
create policy "error_logs_service_write" on error_logs for insert
  with check (auth.role() = 'service_role');

drop policy if exists "error_logs_admin_read" on error_logs;
create policy "error_logs_admin_read" on error_logs for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- p95 of errors per page over the last 24h — for the admin dashboard
create or replace view error_logs_summary_24h as
select
  page_path,
  source,
  count(*) as occurrences,
  count(distinct fingerprint) as unique_errors,
  max(created_at) as last_seen
from error_logs
where created_at > now() - interval '24 hours'
group by page_path, source
order by occurrences desc;
