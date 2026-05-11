# Phase 3 — Scale & Enterprise

## What was built

### 1. Database optimization (`migrations/20260510_db_optimization.sql`)

**Hot-path indexes** added to:
- `tools` — `(approved + rating)`, `(approved + commission)`, `(category + approved)`, `(slug, approved)`, `(updated_at)`
- `niche_pages` — `(approved + slug)`
- `affiliate_clicks` — `(tool, time)`, `(source, time)`, `(time)` for revenue dashboards
- `seo_metrics` — `(slug, time)` for daily aggregates without variant breakdown

**Materialized views** for expensive aggregations:
- `mv_daily_traffic` — 30-day rollup by (day, slug, page_type, event_type) + unique visitors
- `mv_top_pages_30d` — pre-computed CTR + dwell per page
- `mv_revenue_by_day` — 90-day affiliate click rollup

Refresh with `select refresh_analytics_matviews()` (called nightly by `/api/cron/daily`).

**pgvector** for semantic search:
- `vector(768)` columns on `tools` + `niche_pages` (Gemini embedding size)
- HNSW indexes for fast ANN search at 100k+ rows
- `semantic_search_tools(query_embedding, threshold, count)` RPC ready to call from the client

To enable semantic search: backfill embeddings via a script (Gemini's `text-embedding-004` is `768d`), then update `/api/recommend` to embed the query and call the RPC.

### 2. Vercel Cron + Edge functions

**Crons** (`vercel.json`):
- `0 3 * * *` → `/api/cron/daily` — refresh EPC + matviews
- `0 4 * * 1` → `/api/cron/promote-ab` — Z-test winner promotion

Both are auth-gated via `CRON_SECRET` env var (Vercel sends `Authorization: Bearer <CRON_SECRET>`).

**Edge function**: `/api/edge/sitemap` runs on Vercel Edge Runtime (sub-50ms response, global cache). Wired via rewrite: `/sitemap.xml` → edge handler. Cache headers: `s-maxage=86400, stale-while-revalidate=604800` (1 day fresh, 1 week SWR).

### 3. CI/CD pipeline (`.github/workflows/`)

**`ci.yml`** runs on every push + PR:
- TypeScript check (strict mode)
- Vitest run (60 tests)
- Production build with placeholder env (verifies real-build feasibility)
- Coverage artifact uploaded

**`pr-title.yml`** enforces conventional commits in PR titles.

Vercel handles preview + production deploys automatically once the GitHub integration is connected — no separate workflow needed.

### 4. Observability

**Web Vitals** (`src/analytics/web-vitals.ts` + `/api/vitals`):
- LCP, FID, INP, CLS, TTFB, FCP via PerformanceObserver
- Sent via `sendBeacon` for unload safety
- Stored in `web_vitals` table with `web_vitals_p75` view exposing per-page percentiles

**Structured logger** (already in place from Phase 0): every module gets `createLogger(scope)`, silent in tests, warn+error only in production.

**Error tracking** (Phase 0): Sentry lazy-loads if `VITE_SENTRY_DSN` is set.

**Business metrics view**: `business_metrics_daily` — drop-in for the principal-engineer health check or Grafana dashboard.

### 5. Legal & Compliance

- **`<AffiliateDisclosure />`** — 3 variants (banner, inline, compact) for FTC compliance
- **`<CookieBanner />`** — GDPR opt-in, two-tier (all / essential), persists to localStorage
- **Legal pages** at `/privacy`, `/terms`, `/disclosure` — single module, three lazy-loadable exports
- All pages emit canonical URLs + indexable robots meta

### 6. i18n foundation (`src/i18n/`)

- Lightweight (~50 lines, no `react-i18next` dep)
- TypeScript-enforced: English `en.ts` is source-of-truth, `Dictionary` type prevents missing keys
- Lazy-loaded per-locale chunks
- Persisted user preference via Zustand `persist` middleware
- Initial detection from `navigator.language`
- `<LocaleSwitcher />` component ready to drop in nav

To add a locale:
```ts
// src/i18n/locales/fr.ts
import type { Dictionary } from '..';
export const fr: Dictionary = { /* TS will demand all keys */ };

// src/i18n/index.ts → add to LOCALES array
```

For SEO content (article bodies), add a `locale` column to `niche_pages` and route by `/:locale/best/:slug`. The schema is ready; the routing change is one route-table edit.

## Setup

```bash
# 1. Apply the new migrations in order
psql < supabase/migrations/20260510_db_optimization.sql
psql < supabase/migrations/20260511_observability.sql

# 2. Set CRON_SECRET in Vercel env (any random 32+ char string)
openssl rand -hex 32

# 3. Deploy
git push   # → Vercel deploys, crons start automatically

# 4. (Optional) Backfill embeddings for semantic search
#    Add scripts/backfill-embeddings.ts when you wire Gemini API
```

## Verified

```
$ npm run lint    # tsc --noEmit, strict mode → 0 errors
$ npm run test    # vitest run                 → 60/60 passing
$ npm run build   # tsc + vite build            → 14s, code-split per route
```

## Bundle impact

```
Public:      no change for anonymous users (i18n loads default 'en' inline)
Admin:       still its own chunks
Edge:        sitemap moved to edge runtime — origin load near zero
Vitals:      < 1 KB inlined into main bundle
i18n core:   ~1 KB; per-locale dictionaries load on demand
Legal:       3 routes, all lazy
```

## What you'll do post-deploy

1. **Set `CRON_SECRET`** in Vercel env
2. **Apply the two new migrations** in Supabase SQL Editor
3. **Verify cron** by hitting `/api/cron/daily` with the bearer token
4. **(Later) Backfill embeddings** when you wire Gemini AI for semantic search
5. **(Later) Add more locales** as content is translated
