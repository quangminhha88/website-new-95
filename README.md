# SaaS Tools Directory

Production-grade SaaS directory with AI-powered recommendations, programmatic SEO, affiliate tracking, and full Schema.org coverage.

**Stack:** React 18 · Vite 6 · TypeScript (strict) · Supabase · Zustand · TailwindCSS 4 · Vercel

---

## Quick start

```bash
git clone <your-repo>
cd saas-tools-directory
cp .env.example .env       # fill in Supabase + Upstash credentials
npm install
npm run dev                # http://localhost:3000
```

---

## Deploy to Vercel

```bash
# Option 1: GitHub integration (recommended)
git push origin main
# → Vercel auto-detects Vite preset and deploys

# Option 2: CLI
npm i -g vercel
vercel
```

**Environment variables** to set in Vercel dashboard:

| Variable                      | Required | Purpose                                  |
| ----------------------------- | -------- | ---------------------------------------- |
| `VITE_SUPABASE_URL`           | ✅       | Frontend Supabase URL                    |
| `VITE_SUPABASE_ANON_KEY`      | ✅       | Frontend Supabase anon key               |
| `SUPABASE_URL`                | ✅       | API functions (server-side)              |
| `SUPABASE_SERVICE_ROLE_KEY`   | ✅       | API functions (admin client)             |
| `UPSTASH_REDIS_REST_URL`      | optional | Rate limiting (graceful fallback if off) |
| `UPSTASH_REDIS_REST_TOKEN`    | optional | Rate limiting                            |
| `APP_URL`                     | optional | Used in sitemap + canonical URLs         |
| `GEMINI_API_KEY`              | post-deploy | For full AI recommendations            |

---

## Database setup

Run migrations in order from `supabase/migrations/`:

```sql
-- In Supabase SQL Editor:
-- 1. 00_initial_schema.sql       -- core tables
-- 2. 01_extended_schema.sql      -- auxiliary tables
-- 3. 20260503_monetization_full.sql
-- 4. 20260504_rls_policies.sql
-- 5. 20260506_seo_infrastructure.sql  -- A/B variants + metrics
```

---

## Project structure

```
api/                    Vercel serverless functions
  _lib/                 Shared admin client + rate limit helpers
  recommend.ts          POST /api/recommend (stub — replace with Gemini post-deploy)
  redirect/[slug].ts    GET /api/redirect/:slug — affiliate tracking
  seo/track.ts          POST /api/seo/track — impression/dwell/click events
  seo/tools.ts          GET /api/seo/tools — JSON tool feed
  sitemap.ts            GET /api/sitemap — runtime sitemap

src/
  components/           Pure UI (SEO, AuthorBlock, Breadcrumbs, AffiliateCTA, ConfigErrorBanner)
  pages/                Route components (lazy-loaded, code-split)
  hooks/                useQuery, useTools, useTrackPage
  stores/               Zustand: auth, ui, cache
  seo/                  Schema, sitemap, indexability, CTR optimizer, internal linking, validator
  analytics/            seo-metrics client tracker
  config/env.ts         Zod-validated env
  lib/                  supabase client, logger, cache, monitor
  services/             Client-safe types + revenueService
  types/                TypeScript interfaces
  utils/                errors, response, sanitize

scripts/
  generate-sitemap.ts   Build-time sitemap → /public/sitemap.xml
  optimize-ctr.ts       Generate A/B title variants
  add-internal-links.ts Inject contextual internal links
  seed-data.ts          Seed Supabase
  ...                   (See package.json for full list)

supabase/migrations/    Database schema
public/                 Static assets (favicon, robots.txt, generated sitemap.xml)
```

---

## Available scripts

```bash
npm run dev          # Dev server
npm run build        # tsc + vite build (passes strict mode)
npm run preview      # Preview production build
npm run lint         # tsc --noEmit
npm run test         # Vitest

# SEO pipeline
npm run sitemap      # Generate /public/sitemap.xml from Supabase
npm run ctr          # Refresh A/B title variants for all pages
npm run links        # Inject internal links into existing content
npm run audit        # Audit content quality

# Content generation (require AI keys post-deploy)
npm run niche
npm run alternatives
npm run compare
```

---

## What's stubbed

The following endpoints work but use simplified logic. Replace post-deploy when ready:

- **`/api/recommend`** — currently does keyword scoring against Supabase. To enable full Gemini AI:
  1. `npm install @google/generative-ai`
  2. Set `GEMINI_API_KEY` in Vercel
  3. Replace the `getRecommendations()` body in `api/recommend.ts`

---

## Documentation

- **`SEO_ARCHITECTURE.md`** — full SEO system docs (schema graph, programmatic pipeline, CTR engine, scaling to 100k pages)

---

## License

MIT
