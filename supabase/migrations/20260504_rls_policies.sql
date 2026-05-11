-- SQL Migration: 20260504_add_rls_policies.sql
-- Description: Enables RLS and sets access policies for tools, affiliate_clicks, and user_usage tables.

-- ==========================================
-- 1. Table: tools
-- ==========================================
ALTER TABLE tools ENABLE ROW LEVEL SECURITY;

-- Anyone can read the tools directory (Public access)
CREATE POLICY tools_public_read ON tools
  FOR SELECT
  TO public
  USING (true);

-- Only the service role can insert, update, or delete tools
CREATE POLICY tools_admin_all ON tools
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ==========================================
-- 2. Table: affiliate_clicks
-- ==========================================
ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;

-- service_role can record new clicks (Backend tracking)
CREATE POLICY affiliate_clicks_admin_insert ON affiliate_clicks
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- service_role can read click data for analytics
CREATE POLICY affiliate_clicks_admin_select ON affiliate_clicks
  FOR SELECT
  TO service_role
  USING (true);

-- Note: No policies for public or authenticated roles mean access is denied by default.

-- ==========================================
-- 3. Table: user_usage
-- ==========================================
ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;

-- Users can only view their own usage records
CREATE POLICY user_usage_self_select ON user_usage
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- service_role can create usage records when users perform actions
CREATE POLICY user_usage_admin_insert ON user_usage
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- service_role can update usage records (e.g., incrementing counters)
CREATE POLICY user_usage_admin_update ON user_usage
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
