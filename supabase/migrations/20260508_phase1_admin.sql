-- ============================================================================
-- Phase 1 — Admin Dashboard + Content Quality Control
-- ============================================================================

-- ── 1. user_roles table for admin RBAC ────────────────────────────────────
create table if not exists user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id)
);

alter table user_roles enable row level security;

drop policy if exists "user_roles_self_read" on user_roles;
create policy "user_roles_self_read" on user_roles
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_roles_admin_read_all" on user_roles;
create policy "user_roles_admin_read_all" on user_roles
  for select
  using (
    exists (
      select 1 from user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    )
  );

drop policy if exists "user_roles_service_role_write" on user_roles;
create policy "user_roles_service_role_write" on user_roles
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── 2. moderation_status + quality_score on content tables ────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'tools' and column_name = 'moderation_status') then
    alter table tools
      add column moderation_status text not null default 'approved'
        check (moderation_status in ('draft', 'pending_review', 'approved', 'rejected')),
      add column quality_score int check (quality_score >= 0 and quality_score <= 100),
      add column reviewed_at timestamptz,
      add column reviewed_by uuid references auth.users(id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'niche_pages' and column_name = 'moderation_status') then
    alter table niche_pages
      add column moderation_status text not null default 'approved'
        check (moderation_status in ('draft', 'pending_review', 'approved', 'rejected')),
      add column quality_score int check (quality_score >= 0 and quality_score <= 100),
      add column reviewed_at timestamptz,
      add column reviewed_by uuid references auth.users(id);
  end if;
end $$;

create index if not exists idx_tools_moderation on tools (moderation_status, quality_score);
create index if not exists idx_niche_pages_moderation on niche_pages (moderation_status, quality_score);

-- ── 3. content_audit_logs table ───────────────────────────────────────────
create table if not exists content_audit_logs (
  id bigserial primary key,
  resource_type text not null check (resource_type in ('tool', 'niche_page', 'category', 'comparison')),
  resource_id uuid,
  resource_slug text,
  action text not null check (action in (
    'created', 'updated', 'approved', 'rejected', 'deleted',
    'regenerated', 'auto_flagged', 'bulk_action'
  )),
  actor_id uuid references auth.users(id),
  actor_email text,
  previous_status text,
  new_status text,
  diff jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_resource on content_audit_logs (resource_type, resource_id);
create index if not exists idx_audit_logs_actor on content_audit_logs (actor_id, created_at desc);
create index if not exists idx_audit_logs_recent on content_audit_logs (created_at desc);

alter table content_audit_logs enable row level security;

drop policy if exists "audit_logs_admin_read" on content_audit_logs;
create policy "audit_logs_admin_read" on content_audit_logs
  for select
  using (
    exists (
      select 1 from user_roles ur
      where ur.user_id = auth.uid() and ur.role in ('admin', 'editor')
    )
  );

drop policy if exists "audit_logs_service_write" on content_audit_logs;
create policy "audit_logs_service_write" on content_audit_logs
  for insert
  with check (auth.role() = 'service_role');

-- ── 4. Auto-flag low-quality content via trigger ──────────────────────────
create or replace function auto_flag_low_quality()
returns trigger as $$
begin
  if new.quality_score is not null and new.quality_score < 75
     and new.moderation_status = 'approved' then
    new.moderation_status := 'pending_review';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists tools_auto_flag on tools;
create trigger tools_auto_flag
  before insert or update of quality_score on tools
  for each row
  execute function auto_flag_low_quality();

drop trigger if exists niche_pages_auto_flag on niche_pages;
create trigger niche_pages_auto_flag
  before insert or update of quality_score on niche_pages
  for each row
  execute function auto_flag_low_quality();

-- ── 5. is_admin() helper for RLS ──────────────────────────────────────────
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

-- ── 6. Update tools/niche_pages RLS so admins can write ──────────────────
drop policy if exists "tools_admin_write" on tools;
create policy "tools_admin_write" on tools
  for all
  using (is_admin())
  with check (is_admin());

drop policy if exists "niche_pages_admin_write" on niche_pages;
create policy "niche_pages_admin_write" on niche_pages
  for all
  using (is_admin())
  with check (is_admin());

drop policy if exists "categories_admin_write" on categories;
create policy "categories_admin_write" on categories
  for all
  using (is_admin())
  with check (is_admin());

-- ── 7. Public read filtered to approved content only ─────────────────────
drop policy if exists "tools_public_read" on tools;
create policy "tools_public_read" on tools
  for select
  using (moderation_status = 'approved' or is_admin());

drop policy if exists "niche_pages_public_read" on niche_pages;
create policy "niche_pages_public_read" on niche_pages
  for select
  using (moderation_status = 'approved' or is_admin());

-- ── 8. Analytics aggregates view (top pages by CTR) ──────────────────────
create or replace view admin_top_pages as
select
  resource_slug,
  page_type,
  count(*) filter (where event_type = 'impression') as impressions,
  count(*) filter (where event_type = 'affiliate_click') as clicks,
  case when count(*) filter (where event_type = 'impression') > 0
    then round(100.0 * count(*) filter (where event_type = 'affiliate_click')
               / count(*) filter (where event_type = 'impression'), 3)
    else 0
  end as ctr_pct,
  avg(duration_ms) filter (where event_type = 'dwell') as avg_dwell_ms,
  max(created_at) as last_seen
from seo_metrics
where created_at > now() - interval '30 days'
  and resource_slug is not null
group by resource_slug, page_type;
