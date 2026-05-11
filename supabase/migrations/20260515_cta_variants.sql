-- ============================================================================
-- CTA A/B testing infrastructure
--   - cta_variants jsonb on tools/niche_pages (separate from seo_variants
--     to avoid mixing two independent A/B tests)
--   - cta_variant_index column on seo_metrics for per-variant CTR
-- ============================================================================

-- Per-row CTA copy variants. Each entry shape:
--   { type: 'primary'|'featured'|'urgency'|'discount',
--     text: string,
--     weight?: number,         -- relative selection weight, default 1
--     enabled?: boolean }      -- defaults true
alter table tools
  add column if not exists cta_variants jsonb;

alter table niche_pages
  add column if not exists cta_variants jsonb;

-- Track which CTA variant was clicked, so we can compute per-variant CTR
alter table seo_metrics
  add column if not exists cta_variant_index int,
  add column if not exists cta_variant_type text;

create index if not exists idx_seo_metrics_cta_variant
  on seo_metrics (resource_slug, cta_variant_index, event_type)
  where cta_variant_index is not null;

-- View: per-CTA-variant CTR over the last 14 days
create or replace view cta_variant_performance_14d as
select
  resource_slug,
  cta_variant_index,
  cta_variant_type,
  count(*) filter (where event_type = 'impression') as impressions,
  count(*) filter (where event_type = 'affiliate_click') as clicks,
  case
    when count(*) filter (where event_type = 'impression') > 0
    then round(
      100.0 * count(*) filter (where event_type = 'affiliate_click')
      / count(*) filter (where event_type = 'impression'),
      3
    )
    else 0
  end as ctr_pct
from seo_metrics
where created_at > now() - interval '14 days'
  and cta_variant_index is not null
group by 1, 2, 3
order by ctr_pct desc;
