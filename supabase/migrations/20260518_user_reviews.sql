-- ============================================================================
-- 20260518_user_reviews.sql — User-facing review system
-- ============================================================================

create table if not exists tool_reviews (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references tools(id) on delete cascade,
  user_id uuid references auth.users(id),
  author_name text not null,
  author_email text not null,
  rating int not null check (rating between 1 and 5),
  title text,
  body text not null check (char_length(body) >= 30),
  verified boolean not null default false,
  verification_token text unique,
  token_expires_at timestamptz,
  ai_sentiment text check (ai_sentiment in ('positive', 'neutral', 'negative')),
  ai_flags text[],
  is_fake_suspect boolean not null default false,
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists idx_reviews_tool_approved
  on tool_reviews (tool_id, moderation_status, created_at desc);

alter table tool_reviews enable row level security;

drop policy if exists "reviews_public_read" on tool_reviews;
create policy "reviews_public_read" on tool_reviews for select
  using (moderation_status = 'approved');

drop policy if exists "reviews_insert" on tool_reviews;
create policy "reviews_insert" on tool_reviews for insert with check (true);

drop policy if exists "reviews_service_manage" on tool_reviews;
create policy "reviews_service_manage" on tool_reviews for all
  using (auth.role() = 'service_role');

-- Auto-sync tools.avg_rating + tools.review_count
create or replace function sync_tool_rating() returns trigger
language plpgsql as $$
begin
  update tools set
    avg_rating = (
      select round(avg(rating)::numeric, 1)
      from tool_reviews
      where tool_id = coalesce(new.tool_id, old.tool_id)
        and moderation_status = 'approved'
    ),
    review_count = (
      select count(*)
      from tool_reviews
      where tool_id = coalesce(new.tool_id, old.tool_id)
        and moderation_status = 'approved'
    )
  where id = coalesce(new.tool_id, old.tool_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_rating on tool_reviews;
create trigger trg_sync_rating
  after insert or update or delete on tool_reviews
  for each row execute function sync_tool_rating();
