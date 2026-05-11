-- 🚀 REVENUE-FIRST SEO & AFFILIATE SYSTEM MIGRATION
-- This script sets up the full database infrastructure for monetization

-- 1. TOOLS TABLE ENHANCEMENTS
ALTER TABLE tools ADD COLUMN IF NOT EXISTS affiliate_link text;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS fallback_url text;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS commission_estimate decimal DEFAULT 0;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS conversion_probability decimal DEFAULT 0.02;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS monetization_priority_weight int DEFAULT 0;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS click_count int DEFAULT 0;

-- 2. AFFILIATE CLICKS TRACKING (Phase 2)
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id uuid REFERENCES tools(id),
  timestamp timestamptz DEFAULT now(),
  source text DEFAULT 'direct',
  user_agent text,
  ip_hash text,
  referrer text
);

-- 3. USER USAGE TRACKING (For AI limits)
CREATE TABLE IF NOT EXISTS user_usage (
  user_id uuid PRIMARY KEY,
  request_count int DEFAULT 0,
  last_request_at timestamptz DEFAULT now()
);

-- 4. PROGRAMMATIC SEO NICHE PAGES (Phase 4)
CREATE TABLE IF NOT EXISTS niche_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  niche_name text NOT NULL,
  seo_title text,
  meta_description text,
  seo_content_html text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. RPC FOR ATOMIC INCREMENTS
-- Used by the backend to safely increment click counts without race conditions
CREATE OR REPLACE FUNCTION increment_tool_clicks(tool_id_arg uuid)
RETURNS void AS $$
BEGIN
  UPDATE tools
  SET click_count = click_count + 1
  WHERE id = tool_id_arg;
END;
$$ LANGUAGE plpgsql;

-- 6. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_tools_slug ON tools(slug);
CREATE INDEX IF NOT EXISTS idx_clicks_tool_id ON affiliate_clicks(tool_id);
CREATE INDEX IF NOT EXISTS idx_niche_pages_slug ON niche_pages(slug);
