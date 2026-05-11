-- ============================================================================
-- Phase 1: Content Quality Control + Admin Role
-- ============================================================================

-- ── 1. profiles table — extends auth.users with app-level role ────────────
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  full_name text,
  role text not null default 'viewer'
    check (role in ('viewer', 'editor', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. moderation_status on tools and niche_pages ────────────────────────
alter table tools
  add column if not exists moderation_status text not null default 'approved'
    check (moderation_status in ('draft', 'pending_review', 'approved', 'rejected')),
  add column if not exists quality_score int check (quality_score between 0 and 100),
  add column if not exists reviewed_by uuid references profiles(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason text;

alter table niche_pages
  add column if not exists moderation_status text not null default 'approved'
    check (moderation_status in ('draft', 'pending_review', 'approved', 'rejected')),
  add column if not exists quality_score int check (quality_score between 0 and 100),
  add column if not exists reviewed_by uuid references profiles(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason text;

create index if not exists idx_tools_moderation_status on tools (moderation_status);
create index if not exists idx_niche_pages_moderation_status on niche_pages (moderation_status);

-- ── 3. content_audit_logs — every change to a tool/niche/comparison ────
create table if not exists content_audit_logs (
  id bigserial primary key,
  resource_type text not null check (resource_type in ('tool', 'niche_page', 'comparison', 'category')),
  resource_id text not null,
  resource_slug text,
  action text not null check (action in (
    'created', 'updated', 'deleted',
    'submitted_for_review', 'approved', 'rejected',
    'regenerated', 'published', 'unpublished'
  )),
  actor_id uuid references profiles(id),
  actor_email text,
  changes jsonb,                     -- { field: [old, new] }
  quality_score int,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_resource
  on content_audit_logs (resource_type, resource_id, created_at desc);
create index if not exists idx_audit_action_time
  on content_audit_logs (action, created_at desc);
create index if not exists idx_audit_actor
  on content_audit_logs (actor_id, created_at desc) where actor_id is not null;

-- ── 4. RLS for new tables ────────────────────────────────────────────────
alter table profiles enable row level security;
alter table content_audit_logs enable row level security;

-- profiles: a user can read+update their own row; admins can read all
drop policy if exists "profiles_self_read" on profiles;
create policy "profiles_self_read" on profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_self_update" on profiles;
create policy "profiles_self_update" on profiles
  for update using (auth.uid() = id);

drop policy if exists "profiles_admin_all" on profiles;
create policy "profiles_admin_all" on profiles
  for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- audit logs: admins read all, service-role writes
drop policy if exists "audit_admin_read" on content_audit_logs;
create policy "audit_admin_read" on content_audit_logs
  for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "audit_service_write" on content_audit_logs;
create policy "audit_service_write" on content_audit_logs
  for insert
  with check (auth.role() = 'service_role');

-- ── 5. Helper: tighten tools/niche_pages writes to admin/editor only ────
-- (Replaces the broad service_role-only policy from earlier phases.)
drop policy if exists "tools_service_role_write" on tools;
create policy "tools_admin_or_editor_write" on tools
  for all
  using (
    auth.role() = 'service_role'
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  )
  with check (
    auth.role() = 'service_role'
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

drop policy if exists "niche_pages_service_role_write" on niche_pages;
create policy "niche_pages_admin_or_editor_write" on niche_pages
  for all
  using (
    auth.role() = 'service_role'
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  )
  with check (
    auth.role() = 'service_role'
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

-- ── 6. Public SELECT only sees `approved` content ────────────────────────
-- Drafts and pending content stay invisible to crawlers and end users.
drop policy if exists "tools_public_read" on tools;
create policy "tools_public_approved_read" on tools
  for select
  using (
    moderation_status = 'approved'
    or auth.role() = 'service_role'
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

drop policy if exists "niche_pages_public_read" on niche_pages;
create policy "niche_pages_public_approved_read" on niche_pages
  for select
  using (
    moderation_status = 'approved'
    or auth.role() = 'service_role'
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );
