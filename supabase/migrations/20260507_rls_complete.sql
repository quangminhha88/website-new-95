-- ============================================================================
-- Phase 0 — Complete RLS policies for all tables
-- Run AFTER all schema migrations are applied.
--
-- Policy summary:
--   Public read:  tools, categories, niche_pages, comparisons (SEO content)
--   Service-role only: writes to all tables, full access to seo_metrics + affiliate_clicks
--   Authenticated user: read own session-scoped data (when auth is added)
-- ============================================================================

-- ── Helper: drop all existing policies on a table before redefining ───────
do $$
declare
  tbl text;
  pol record;
begin
  for tbl in
    select unnest(array['tools', 'categories', 'niche_pages', 'comparisons',
                        'seo_metrics', 'affiliate_clicks', 'user_usage'])
  loop
    if exists (select 1 from pg_tables where tablename = tbl) then
      for pol in select policyname from pg_policies where tablename = tbl
      loop
        execute format('drop policy if exists %I on %I', pol.policyname, tbl);
      end loop;
    end if;
  end loop;
end $$;

-- ── tools ────────────────────────────────────────────────────────────────
alter table if exists tools enable row level security;

create policy "tools_public_read" on tools
  for select
  using (true);

create policy "tools_service_role_write" on tools
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── categories ───────────────────────────────────────────────────────────
alter table if exists categories enable row level security;

create policy "categories_public_read" on categories
  for select
  using (true);

create policy "categories_service_role_write" on categories
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── niche_pages ──────────────────────────────────────────────────────────
alter table if exists niche_pages enable row level security;

create policy "niche_pages_public_read" on niche_pages
  for select
  using (true);

create policy "niche_pages_service_role_write" on niche_pages
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── comparisons ──────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_tables where tablename = 'comparisons') then
    alter table comparisons enable row level security;

    create policy "comparisons_public_read" on comparisons
      for select
      using (true);

    create policy "comparisons_service_role_write" on comparisons
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

-- ── seo_metrics — service role only (no public reads) ───────────────────
alter table if exists seo_metrics enable row level security;

create policy "seo_metrics_service_role_full" on seo_metrics
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Anonymous users can INSERT impression/dwell/click events via /api/seo/track
-- (which uses service role), so no anon policy is needed. The endpoint
-- itself rate-limits and validates input.

-- ── affiliate_clicks — service role only ────────────────────────────────
do $$
begin
  if exists (select 1 from pg_tables where tablename = 'affiliate_clicks') then
    alter table affiliate_clicks enable row level security;

    create policy "affiliate_clicks_service_role_full" on affiliate_clicks
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

-- ── user_usage — quota tracking (service role only) ────────────────────
do $$
begin
  if exists (select 1 from pg_tables where tablename = 'user_usage') then
    alter table user_usage enable row level security;

    create policy "user_usage_service_role_full" on user_usage
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');

    -- Authenticated users can read their own usage row
    create policy "user_usage_own_read" on user_usage
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

-- ── Audit: ensure no table is missing RLS ───────────────────────────────
do $$
declare
  unprotected text;
begin
  select string_agg(tablename, ', ') into unprotected
  from pg_tables t
  where schemaname = 'public'
    and not exists (
      select 1 from pg_class c
      where c.relname = t.tablename
        and c.relrowsecurity = true
    );

  if unprotected is not null then
    raise notice 'Tables WITHOUT RLS enabled: %', unprotected;
  else
    raise notice 'All public tables have RLS enabled.';
  end if;
end $$;
