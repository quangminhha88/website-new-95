-- 1. Create Tracking Table
CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_id UUID REFERENCES public.tools(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    source TEXT DEFAULT 'direct',
    ip_hash TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add analytics fields to tools table
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0;
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS affiliate_url TEXT;

-- 3. Create helper function for atomic counter increment
-- This prevents race conditions when multiple clicks happen simultaneously
CREATE OR REPLACE FUNCTION increment_tool_clicks(tool_id_arg UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.tools
    SET click_count = click_count + 1
    WHERE id = tool_id_arg;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Set up Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_tool_id ON public.affiliate_clicks(tool_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_created_at ON public.affiliate_clicks(created_at);
CREATE INDEX IF NOT EXISTS idx_tools_slug ON public.tools(slug);

-- 5. Add Monetization Metadata to Tools
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS monetization_type TEXT DEFAULT 'redirect'; -- 'none', 'affiliate', 'redirect', 'partner'
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS commission_estimate DECIMAL DEFAULT 0.0;
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS affiliate_network TEXT; -- 'impact', 'partnerstack', 'direct', etc.
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS last_monetized_at TIMESTAMPTZ;

-- 6. Logic for Smart Ranking (Optional weights)
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS monetization_priority_weight FLOAT DEFAULT 1.0;

-- 7. Affiliate Networks and Detailed Monetization
CREATE TABLE IF NOT EXISTS public.affiliate_networks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    base_url TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT 'rev_share'; -- 'cpa', 'rev_share', 'fixed'
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS network_id UUID REFERENCES public.affiliate_networks(id) ON DELETE SET NULL;
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS fallback_url TEXT;

-- Seed some default networks
INSERT INTO public.affiliate_networks (name, base_url, description)
VALUES 
('Direct', NULL, 'Direct affiliate program with the vendor'),
('Impact', 'https://impact.com', 'Impact Radius Network'),
('PartnerStack', 'https://partnerstack.com', 'PartnerStack Network'),
('ShareASale', 'https://shareasale.com', 'ShareASale Network')
ON CONFLICT (name) DO NOTHING;

