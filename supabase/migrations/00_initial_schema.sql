-- SaaS Directory PostgreSQL Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(120) UNIQUE NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    tagline VARCHAR(255),
    description TEXT,
    website_url TEXT,
    logo_url TEXT,
    category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
    pricing_model VARCHAR(50), 
    pricing_data JSONB, 
    features JSONB,
    avg_rating DECIMAL(3, 2) DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE alternatives (
    tool_id UUID REFERENCES tools(id) ON DELETE CASCADE,
    alternative_id UUID REFERENCES tools(id) ON DELETE CASCADE,
    similarity_score DECIMAL(5, 2),
    PRIMARY KEY (tool_id, alternative_id),
    CONSTRAINT different_tools CHECK (tool_id <> alternative_id)
);

CREATE TABLE comparisons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(255) UNIQUE NOT NULL,
    tool_a_id UUID REFERENCES tools(id) ON DELETE CASCADE,
    tool_b_id UUID REFERENCES tools(id) ON DELETE CASCADE,
    verdict TEXT,
    comparison_json JSONB,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_comparison_pair UNIQUE (tool_a_id, tool_b_id)
);

CREATE INDEX idx_tools_category ON tools(category_id);
CREATE INDEX idx_tools_slug ON tools(slug);
CREATE INDEX idx_comparisons_slug ON comparisons(slug);
CREATE INDEX idx_categories_slug ON categories(slug);

-- Added for monitoring and SEO
CREATE INDEX IF NOT EXISTS idx_tools_updated_at ON tools(updated_at DESC);

-- Quota and Usage tracking
CREATE TABLE IF NOT EXISTS user_usage (
    user_id UUID PRIMARY KEY,
    request_count INTEGER DEFAULT 0,
    last_request_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Affiliate tracking
CREATE TABLE IF NOT EXISTS affiliate_clicks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_id UUID REFERENCES tools(id) ON DELETE CASCADE,
    source VARCHAR(100),
    user_agent TEXT,
    ip_hash VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_tool_id ON affiliate_clicks(tool_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_created_at ON affiliate_clicks(created_at DESC);

/**
 * Atomic Quota Increment and Check
 * Returns { allowed: boolean, new_count: number }
 */
CREATE OR REPLACE FUNCTION increment_and_check_usage(user_id_arg UUID, limit_arg INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
    current_val INTEGER;
    is_allowed BOOLEAN;
BEGIN
    INSERT INTO user_usage (user_id, request_count, last_request_at)
    VALUES (user_id_arg, 1, NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET request_count = user_usage.request_count + 1,
        last_request_at = NOW()
    RETURNING request_count INTO current_val;

    IF current_val > limit_arg THEN
        is_allowed := false;
    ELSE
        is_allowed := true;
    END IF;

    RETURN jsonb_build_object(
        'allowed', is_allowed,
        'new_count', current_val
    );
END;
$;
