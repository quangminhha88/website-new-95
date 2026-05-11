-- ============================================================================
-- 20260518_rls_audit.sql
-- Least-privilege RLS audit. Idempotent — drops and recreates policies
-- so it can be run on top of any prior state.
-- ============================================================================

-- ── Helper functions ──────────────────────────────────────────────────────

-- Cached check for "is the calling user an admin?" — used by every admin policy.
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function is_editor_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin', 'editor')
  );
$$;

create or replace function is_authenticated() returns boolean
language sql stable as $$
  select auth.uid() is not null;
$$;

revoke all on function is_admin from public;
revoke all on function is_editor_or_admin from public;
revoke all on function is_authenticated from public;
grant execute on function is_admin to anon, authenticated;
grant execute on function is_editor_or_admin to anon, authenticated;
grant execute on function is_authenticated to anon, authenticated;

-- ── tools — public reads approved only; editors/admins manage ────────────
alter table tools enable row level security;

drop policy if exists "tools_public_select" on tools;
drop policy if exists "tools_anon_select" on tools;
drop policy if exists "tools_select_all" on tools;
drop policy if exists "tools_admin_all" on tools;
drop policy if exists "tools_admin_write" on tools;

create policy "tools_public_read_approved"
  on tools for select
  using (moderation_status = 'approved');

create policy "tools_admin_read_all"
  on tools for select
  using (is_admin());

create policy "tools_editor_insert"
  on tools for insert
  with check (is_editor_or_admin());

create policy "tools_editor_update"
  on tools for update
  using (is_editor_or_admin())
  with check (is_editor_or_admin());

create policy "tools_admin_delete"
  on tools for delete
  using (is_admin());

-- ── niche_pages — same pattern as tools ──────────────────────────────────
alter table niche_pages enable row level security;

drop policy if exists "niche_pages_public_select" on niche_pages;
drop policy if exists "niche_pages_admin_all" on niche_pages;
drop policy if exists "niche_pages_select_all" on niche_pages;

create policy "niche_pages_public_read_approved"
  on niche_pages for select
  using (moderation_status = 'approved');

create policy "niche_pages_admin_read_all"
  on niche_pages for select
  using (is_admin());

create policy "niche_pages_editor_insert"
  on niche_pages for insert
  with check (is_editor_or_admin());

create policy "niche_pages_editor_update"
  on niche_pages for update
  using (is_editor_or_admin())
  with check (is_editor_or_admin());

create policy "niche_pages_admin_delete"
  on niche_pages for delete
  using (is_admin());

-- ── profiles — owner reads/writes own row; admin reads all ───────────────
alter table profiles enable row level security;

drop policy if exists "profiles_select_all" on profiles;
drop policy if exists "profiles_self_select" on profiles;
drop policy if exists "profiles_self_update" on profiles;
drop policy if exists "profiles_admin_all" on profiles;

create policy "profiles_self_read"
  on profiles for select
  using (auth.uid() = id);

create policy "profiles_admin_read"
  on profiles for select
  using (is_admin());

create policy "profiles_self_update"
  on profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- prevent privilege escalation: users can't change their own role
    and (role is not distinct from (select role from profiles where id = auth.uid()))
  );

create policy "profiles_admin_update"
  on profiles for update
  using (is_admin())
  with check (is_admin());

-- New profiles are inserted by the auth trigger or by service role
create policy "profiles_self_insert"
  on profiles for insert
  with check (auth.uid() = id);

-- ── affiliate_clicks — service-role write only; admin read ───────────────
alter table affiliate_clicks enable row level security;

drop policy if exists "affiliate_clicks_insert_all" on affiliate_clicks;
drop policy if exists "affiliate_clicks_select_admin" on affiliate_clicks;
drop policy if exists "affiliate_clicks_admin_all" on affiliate_clicks;

create policy "affiliate_clicks_service_write"
  on affiliate_clicks for insert
  with check (auth.role() = 'service_role');

create policy "affiliate_clicks_admin_read"
  on affiliate_clicks for select
  using (is_admin());

-- ── seo_metrics — service-role write; admin read ─────────────────────────
alter table seo_metrics enable row level security;

drop policy if exists "seo_metrics_insert_all" on seo_metrics;
drop policy if exists "seo_metrics_select_admin" on seo_metrics;

create policy "seo_metrics_service_write"
  on seo_metrics for insert
  with check (auth.role() = 'service_role');

create policy "seo_metrics_admin_read"
  on seo_metrics for select
  using (is_admin());

-- ── user_saved_tools — owner-only CRUD ───────────────────────────────────
alter table user_saved_tools enable row level security;

drop policy if exists "saved_tools_owner_all" on user_saved_tools;

create policy "user_saved_tools_owner_select"
  on user_saved_tools for select
  using (auth.uid() = user_id);
create policy "user_saved_tools_owner_insert"
  on user_saved_tools for insert
  with check (auth.uid() = user_id);
create policy "user_saved_tools_owner_delete"
  on user_saved_tools for delete
  using (auth.uid() = user_id);

-- ── user_collections — owner CRUD + public reads on is_public ────────────
alter table user_collections enable row level security;

drop policy if exists "collections_owner_all" on user_collections;
drop policy if exists "collections_public_read" on user_collections;

create policy "user_collections_owner_select"
  on user_collections for select
  using (auth.uid() = user_id);
create policy "user_collections_public_select"
  on user_collections for select
  using (is_public = true);
create policy "user_collections_owner_modify"
  on user_collections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── user_collection_items — only collection owner ────────────────────────
alter table user_collection_items enable row level security;

drop policy if exists "collection_items_owner_all" on user_collection_items;

create policy "user_collection_items_owner"
  on user_collection_items for all
  using (
    exists (
      select 1 from user_collections c
      where c.id = user_collection_items.collection_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from user_collections c
      where c.id = user_collection_items.collection_id and c.user_id = auth.uid()
    )
  );

create policy "user_collection_items_public_read"
  on user_collection_items for select
  using (
    exists (
      select 1 from user_collections c
      where c.id = user_collection_items.collection_id and c.is_public = true
    )
  );

-- ── user_search_history — owner-only ─────────────────────────────────────
alter table user_search_history enable row level security;

drop policy if exists "search_history_owner_all" on user_search_history;

create policy "user_search_history_owner"
  on user_search_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── ab_experiments — service-role write; admin read; anon reads winners ──
alter table ab_experiments enable row level security;

drop policy if exists "ab_experiments_admin_all" on ab_experiments;
drop policy if exists "ab_experiments_select" on ab_experiments;

create policy "ab_experiments_service_write"
  on ab_experiments for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "ab_experiments_admin_read"
  on ab_experiments for select
  using (is_admin());

create policy "ab_experiments_public_winners"
  on ab_experiments for select
  using (status = 'winner');

-- ── tool_epc — admin only (revenue data) ─────────────────────────────────
alter table tool_epc enable row level security;
drop policy if exists "tool_epc_admin_all" on tool_epc;
create policy "tool_epc_admin_read"
  on tool_epc for select
  using (is_admin());
create policy "tool_epc_service_write"
  on tool_epc for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── content_audit_logs — service write; admin read ───────────────────────
alter table content_audit_logs enable row level security;
drop policy if exists "content_audit_logs_admin_read" on content_audit_logs;
drop policy if exists "content_audit_logs_service_write" on content_audit_logs;
create policy "content_audit_logs_service_write"
  on content_audit_logs for insert
  with check (auth.role() = 'service_role' or is_editor_or_admin());
create policy "content_audit_logs_admin_read"
  on content_audit_logs for select
  using (is_admin());

-- ── web_vitals — service write; admin read ───────────────────────────────
alter table web_vitals enable row level security;
drop policy if exists "web_vitals_service_write" on web_vitals;
drop policy if exists "web_vitals_admin_read" on web_vitals;
create policy "web_vitals_service_write"
  on web_vitals for insert
  with check (auth.role() = 'service_role');
create policy "web_vitals_admin_read"
  on web_vitals for select
  using (is_admin());

-- ── error_logs / content_refresh_jobs / ai_usage_logs ────────────────────
-- These already had RLS in their migration files; we re-assert the
-- least-privilege policy here for completeness so the audit shows
-- everything in one place.

alter table error_logs enable row level security;
drop policy if exists "error_logs_service_write" on error_logs;
drop policy if exists "error_logs_admin_read" on error_logs;
create policy "error_logs_service_write" on error_logs for insert
  with check (auth.role() = 'service_role');
create policy "error_logs_admin_read" on error_logs for select using (is_admin());

alter table content_refresh_jobs enable row level security;
drop policy if exists "refresh_jobs_service_write" on content_refresh_jobs;
drop policy if exists "refresh_jobs_admin_read" on content_refresh_jobs;
create policy "refresh_jobs_service_write" on content_refresh_jobs for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "refresh_jobs_admin_read" on content_refresh_jobs for select using (is_admin());

alter table ai_usage_logs enable row level security;
drop policy if exists "ai_usage_service_write" on ai_usage_logs;
drop policy if exists "ai_usage_admin_read" on ai_usage_logs;
create policy "ai_usage_service_write" on ai_usage_logs for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "ai_usage_admin_read" on ai_usage_logs for select using (is_admin());

-- ── Defence in depth: revoke direct table grants from anon ───────────────
-- PostgREST uses the `anon` role for unauthenticated requests. RLS already
-- gates row visibility, but explicit revokes prevent accidental access if
-- a policy is later dropped.
revoke insert, update, delete on
  tools, niche_pages, profiles, affiliate_clicks, seo_metrics,
  user_saved_tools, user_collections, user_collection_items, user_search_history,
  ab_experiments, tool_epc, content_audit_logs, web_vitals, error_logs,
  content_refresh_jobs, ai_usage_logs
from anon;
