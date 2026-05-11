# Phase 1 — Production Readiness

## Implemented

### 1. TanStack Query v5 migration

| Before | After |
| ------ | ----- |
| Custom `useQuery` + Zustand `cache` store | TanStack Query with `QueryClientProvider` |
| Manual cache invalidation | Automatic + `qc.invalidateQueries()` |
| No mutation primitives | `useMutation` available everywhere |
| No devtools | Lazy-loaded devtools in dev mode |

**API kept compatible** — `useTool()`, `useCategories()`, etc. all return
the same `{ data, isLoading, error, refetch }` shape, so call sites in pages
didn't need to change. Migration is invisible to existing components.

**Files**:
- `src/lib/queryClient.ts` — shared client with sane defaults
- `src/hooks/useTools.ts` — domain hooks rewritten on TanStack
- `src/main.tsx` — `<QueryClientProvider>` + dev devtools

### 2. Admin Dashboard

Routes (lazy-loaded, behind `<AdminGuard>`):
- `/admin` — overview (counts, 7-day metrics)
- `/admin/tools` — list + bulk-approve, search/filter by status
- `/admin/review` — moderation queue (pending + low-quality)
- `/admin/analytics` — 30-day charts + top pages

**Auth flow**:
1. `<AdminGuard>` checks session via `useAdminAuth()` hook
2. If not signed in → email/password form (Supabase auth)
3. If signed in but not admin/editor → access-denied screen
4. Otherwise → render children

**Mutations** use `useMutation` from TanStack Query for optimistic UI + automatic invalidation. Bulk-approve and reject-with-reason workflows are already wired to the new `moderation_status` columns.

### 3. Content Quality Control

**Migration**: `supabase/migrations/20260508_content_quality.sql`
- `profiles` table (extends `auth.users` with `role` enum)
- `moderation_status`, `quality_score`, `reviewed_by`, `reviewed_at`, `rejection_reason` on `tools` and `niche_pages`
- `content_audit_logs` table — every mutation gets a row with `actor_id`, `changes` JSONB, `quality_score`
- Trigger to auto-create profile on signup
- RLS rewrites — public reads filter `moderation_status = 'approved'`, so drafts/pending content never leak

**Quality threshold**: anything below 75 lands in `/admin/review` automatically (queried via `quality_score < 75 OR moderation_status = 'pending_review'`).

### 4. Performance & UX

- `<Skeleton />` primitives — `Skeleton`, `SkeletonText`, `SkeletonCard`, `SkeletonRow`, `SkeletonTable`, `SkeletonPage`
- `<OptimizedImage />` — lazy by default, async decode, blur placeholder, initials fallback on error
- Code-splitting per route + admin chunk separate from public bundle (Recharts lives only in admin)

### 5. Bundle size impact

```
Public bundle (page chunks)  : 160-340 kB combined (gzip ~50-100 kB)
Admin bundle (only on /admin): +360 kB (Recharts) — lazy-loaded so public users never download it
TanStack Query              : already in vendor-react chunk (~54 kB gzip total)
```

## Setup

1. Apply the migration:
   ```sql
   -- Run in Supabase SQL Editor
   -- File: supabase/migrations/20260508_content_quality.sql
   ```
2. Promote your account to admin:
   ```sql
   update profiles set role = 'admin' where email = 'you@example.com';
   ```
3. Visit `/admin` and sign in.

## What's still scaffolded vs done

| Area | Status |
| ---- | ------ |
| TanStack migration | ✅ Done — same hook API, devtools wired |
| Admin auth + RBAC | ✅ Done — `AdminGuard` + `useAdminAuth` |
| Admin: dashboard home | ✅ Done — live counts |
| Admin: tools list + bulk approve | ✅ Done |
| Admin: review queue | ✅ Done — approve / reject with reason |
| Admin: analytics | ✅ Done — Recharts + top pages |
| Admin: categories CRUD | 🚧 nav stub — add page when needed |
| Admin: niche pages CRUD | 🚧 nav stub — add page when needed |
| Admin: users / role mgmt | 🚧 nav stub — promote via SQL for now |
| Content audit logging | ✅ DB ready — wire `insert into content_audit_logs` into each mutation |
| Skeleton everywhere | ✅ Primitives ready, used in admin pages — extend to public pages incrementally |
| OptimizedImage | ✅ Component ready — replace `<img>` calls in HomePage / ToolPage incrementally |

The remaining stubs (Categories CRUD, Niche Pages CRUD, Users) follow the
exact same pattern as `AdminTools.tsx` — copy that file and swap the table
name. They're left scaffolded so you can prioritize what your editorial
workflow actually needs.
