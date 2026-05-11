-- ============================================================================
-- Phase 2: Growth & Revenue
--   - A/B winner tracking
--   - EPC computation
--   - User-facing features (saved tools, collections, search history)
-- ============================================================================

-- ── 1. AB experiments registry ────────────────────────────────────────────
-- One row per (resource, variant) — the control and treatments are siblings.
-- Variants live in tools.seo_variants / niche_pages.seo_variants;
-- this table tracks lifecycle status (active, winner, paused).
create table if not exists ab_experiments (
  id bigserial primary key,
  resource_type text not null check (resource_type in ('tool', 'niche_page')),
  resource_slug text not null,
  variant_index int not null,
  status text not null default 'active'
    check (status in ('active', 'winner', 'loser', 'paused')),
  promoted_at timestamptz,
  /* Captured stats at promotion time, for audit */
  impressions_at_decision int,
  clicks_at_decision int,
  ctr_at_decision numeric(5,3),
  created_at timestamptz not null default now(),
  unique (resource_type, resource_slug, variant_index)
);

create index if not exists idx_ab_resource_status
  on ab_experiments (resource_type, resource_slug, status);

-- ── 2. EPC table (Earnings Per Click) ─────────────────────────────────────
-- Computed daily by scripts/compute-epc.ts from affiliate_clicks +
-- conversion_data. Joined into tool ranking decisions.
create table if not exists tool_epc (
  tool_id uuid primary key references tools(id) on delete cascade,
  tool_slug text not null,
  /* Last 30 days */
  clicks_30d int not null default 0,
  conversions_30d int not null default 0,
  revenue_30d numeric(10, 2) not null default 0,
  /* EPC = revenue / clicks */
  epc numeric(8, 4) not null default 0,
  /* Confidence: 0–1 based on click volume */
  confidence numeric(4, 3) not null default 0,
  computed_at timestamptz not null default now()
);

create index if not exists idx_tool_epc_value on tool_epc (epc desc) where clicks_30d >= 50;

-- View: tools ranked by EPC × commission with confidence weighting
create or replace view tool_revenue_score as
select
  t.id,
  t.slug,
  t.name,
  t.commission_estimate,
  e.epc,
  e.clicks_30d,
  e.confidence,
  /* Weighted score for CTA rotation */
  coalesce(e.epc, 0) * coalesce(e.confidence, 0)
    + coalesce(t.commission_estimate, 0) * 0.5 as revenue_score
from tools t
left join tool_epc e on e.tool_id = t.id
where t.moderation_status = 'approved';

-- ── 3. User-facing tables ─────────────────────────────────────────────────

-- Saved tools (bookmarks)
create table if not exists user_saved_tools (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_id uuid not null references tools(id) on delete cascade,
  saved_at timestamptz not null default now(),
  notes text,
  unique (user_id, tool_id)
);

create index if not exists idx_saved_user on user_saved_tools (user_id, saved_at desc);

-- Collections (named lists of tools)
create table if not exists user_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  is_public boolean not null default false,
  share_slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_collections_user on user_collections (user_id, updated_at desc);
create index if not exists idx_collections_public on user_collections (is_public) where is_public;

create table if not exists user_collection_items (
  collection_id uuid not null references user_collections(id) on delete cascade,
  tool_id uuid not null references tools(id) on delete cascade,
  position int not null default 0,
  added_at timestamptz not null default now(),
  primary key (collection_id, tool_id)
);

-- Search history (used for personalized recommendations)
create table if not exists user_search_history (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  searched_at timestamptz not null default now(),
  result_count int,
  clicked_slugs text[]
);

create index if not exists idx_search_user_time
  on user_search_history (user_id, searched_at desc);

-- ── 4. RLS — strict isolation per user ─────────────────────────────────────

alter table ab_experiments enable row level security;
alter table tool_epc enable row level security;
alter table user_saved_tools enable row level security;
alter table user_collections enable row level security;
alter table user_collection_items enable row level security;
alter table user_search_history enable row level security;

-- ab_experiments + tool_epc: read public for ranking, write service-role only
drop policy if exists "ab_public_read" on ab_experiments;
create policy "ab_public_read" on ab_experiments for select using (true);
drop policy if exists "ab_service_write" on ab_experiments;
create policy "ab_service_write" on ab_experiments for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "epc_public_read" on tool_epc;
create policy "epc_public_read" on tool_epc for select using (true);
drop policy if exists "epc_service_write" on tool_epc;
create policy "epc_service_write" on tool_epc for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- User tables: only the owning user can read/write
drop policy if exists "saved_own" on user_saved_tools;
create policy "saved_own" on user_saved_tools for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "collections_own_or_public" on user_collections;
create policy "collections_own_or_public" on user_collections for select
  using (auth.uid() = user_id or is_public);
drop policy if exists "collections_own_write" on user_collections;
create policy "collections_own_write" on user_collections for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "collection_items_via_parent" on user_collection_items;
create policy "collection_items_via_parent" on user_collection_items for all
  using (exists (
    select 1 from user_collections c
    where c.id = collection_id and (c.user_id = auth.uid() or c.is_public)
  ))
  with check (exists (
    select 1 from user_collections c
    where c.id = collection_id and c.user_id = auth.uid()
  ));

drop policy if exists "search_history_own" on user_search_history;
create policy "search_history_own" on user_search_history for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
