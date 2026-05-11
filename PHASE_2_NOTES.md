# Phase 2 — Growth & Revenue

## Architecture

```
                    ┌──────────────────────────┐
                    │  Visitor (cookie-based)  │
                    └──────────┬───────────────┘
                               │
        ┌──────────────────────┼─────────────────────┐
        ▼                      ▼                     ▼
┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐
│  AB Engine      │  │  CTA Engine      │  │  User Features  │
│  ab-engine.ts   │  │  cta-engine.ts   │  │  Auth + Saved   │
│  - cookie ID    │  │  - EPC × commiss │  │  - Bookmarks    │
│  - winner promo │  │  - intent filter │  │  - Collections  │
│                 │  │  - top-K rotate  │  │  - History      │
└────────┬────────┘  └────────┬─────────┘  └────────┬────────┘
         │                    │                     │
         ▼                    ▼                     ▼
   ┌───────────────────────────────────────────────────────┐
   │  Supabase                                              │
   │  ab_experiments, tool_epc, tool_revenue_score (view), │
   │  user_saved_tools, user_collections, search_history    │
   └───────────────────────────────────────────────────────┘
                               ▲
                               │
   ┌───────────────────────────┴───────────────────────────┐
   │  Cron / scripts                                        │
   │  - promote-ab-winners.ts (weekly)                      │
   │  - compute-epc.ts (daily)                              │
   └────────────────────────────────────────────────────────┘
```

## What was built

### 1. Advanced A/B testing — `src/seo/ab-engine.ts`

- **Cookie-based visitor ID** survives session/storage clears (90-day, SameSite=Lax)
- **Deterministic assignment** via FNV-1a hash so same visitor sees same variant
- **Winner short-circuit** — once `ab_experiments.status = 'winner'` is set, all visitors get the winning variant
- **Z-test promotion**: winner needs ≥200 impressions, ≥10% lift, p<0.05

Run: `npm run ab:promote` (weekly cron). The script:
1. Aggregates 14-day variant performance from `seo_metrics`
2. Filters: ≥200 impressions, top variant ≥10% better than runner-up
3. Two-proportion Z-test at 95% confidence
4. Promotes winner: writes `seo_title`/`seo_meta` to `tools` or `niche_pages` and records to `ab_experiments`

### 2. Smart CTA Engine — `src/seo/cta-engine.ts` + `<SmartCTA>`

- **Revenue score**: `epc × confidence + commission_estimate × 0.5`
- **Intent matching**: keyword overlap with features/description boosts score
- **Top-K rotation**: pick the best 3, rotate deterministically per visitor — keeps high-revenue bias without showing the same tool to everyone forever
- **Fallback**: if `tool_revenue_score` view doesn't exist (migration not applied), falls back to commission-only ranking

Three placement variants in `<SmartCTA>`:
- `sidebar` — vertical card with single CTA button
- `inline` — short paragraph with link
- `comparison-winner` — golden "Best Value Pick" treatment for /vs/ pages
- `rail` — grid of N tools (used in personalized homepage section)

### 3. EPC Computation — `scripts/compute-epc.ts`

For each tool, computes 30-day:
- `clicks_30d` from `affiliate_clicks`
- `conversions_30d` (synthetic 2% rate until you wire postback)
- `revenue_30d` = conversions × commission
- `epc` = revenue / clicks
- `confidence` = 1 − exp(−clicks / 100) (saturates at ~500 clicks)

Run: `npm run epc` (daily cron). Updates `tool_epc` table; `tool_revenue_score` view auto-reflects.

### 4. User Features — `src/hooks/useUserFeatures.ts` + `/account`

| Feature | Hook | Mutation |
| ------- | ---- | -------- |
| Saved tools | `useSavedTools()` | `useToggleSavedTool()` |
| Collections | `useCollections()` | `useCreateCollection()`, `useAddToCollection()` |
| Search history | `useSearchHistory()` | `useRecordSearch()` |

Components:
- `<SaveToolButton />` — bookmark icon next to tool H1 + sidebar
- `/account` page — sign in/up form + saved tools tab + history tab

RLS on every user table guarantees `user_id = auth.uid()` so client-side queries are safe even when the client lies.

### 5. Personalized homepage — `<PersonalizedSection />`

Logic:
- **Anonymous** → top-revenue rail (revenue_score desc, limit 8)
- **Authenticated** → blends recent search categories + high-revenue tools
- Falls back to top-revenue if user has <4 history entries

Drop into `HomePage.tsx` between the hero and the categories grid.

### 6. Revenue Analytics admin page — `/admin/revenue`

Live dashboard showing 30-day EPC data:
- 4 KPI tiles (Revenue, Conversions, Avg EPC, Conv Rate)
- Top earners bar chart
- Per-tool table with clicks, revenue, EPC, confidence

## Setup

```sql
-- 1. Apply migration
\i supabase/migrations/20260509_growth_revenue.sql

-- 2. Bootstrap EPC (so SmartCTA has data to rank with)
-- Run after you have some affiliate clicks
```

```bash
# 3. Generate AB variants for all tools (one-time + after content updates)
npm run ctr

# 4. Daily cron (Vercel Cron or external)
npm run epc

# 5. Weekly cron
npm run ab:promote
```

### Suggested Vercel Cron

In `vercel.json`:

```json
"crons": [
  { "path": "/api/cron/epc", "schedule": "0 3 * * *" },
  { "path": "/api/cron/promote-ab", "schedule": "0 4 * * MON" }
]
```

(Wire those endpoints in `api/cron/` calling the same logic — the scripts
are pure functions of Supabase, so it's a 5-line wrapper.)

## Test status

```
Test Files  4 passed (4)
Tests       60 passed (60)
```

## Bundle impact

```
+ ab-engine.ts       1.5 KB (in shared chunk)
+ cta-engine.ts      2.0 KB (in shared chunk)
+ SmartCTA           lazy via TanStack queries
+ useUserFeatures    1.2 KB (lives next to other hooks)
+ AccountPage        9.4 KB / 3.2 gzip — own chunk, only on /account
+ AdminRevenue      22.1 KB / 7.7 gzip — own chunk, only for admins
Recharts shared chunk between AdminAnalytics + AdminRevenue (was duplicate)
```

Public-facing bundle unchanged for anonymous visitors.
