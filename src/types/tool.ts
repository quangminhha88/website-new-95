export interface Tool {
  id: string;
  name: string;
  slug: string;
  tagline?: string;
  description: string;
  category_id: string;
  logo_url?: string;
  website_url: string;
  affiliate_url?: string;
  pricing_model: string;
  pricing_data?: {
    starting_price: string;
    currency: string;
    plans?: Array<{ name: string; price: string; features: string[] }>;
  };
  features: string[];
  full_description?: string;
  pros?: string[];
  cons?: string[];
  use_cases?: string[];
  alternatives_seo_title?: string;
  alternatives_seo_meta?: string;
  alternatives_seo_content?: string;
  faqs_html?: string;
  cta_html?: string;
  conversion_hook?: string;
  expert_verdict?: string;
  monetization_type?: string;
  commission_estimate?: number;
  commission_type?: string;
  affiliate_network?: string;
  fallback_url?: string;
  avg_rating?: number;
  review_count?: number;
  pricing_summary?: string;
  seo_title?: string;
  seo_meta_description?: string;
  seo_variants?: Array<{ title: string; meta: string; score: number; template: number }>;
  updated_at?: string;
  moderation_status?: 'draft' | 'pending_review' | 'approved' | 'rejected';
  quality_score?: number;
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
}

export interface NichePage {
  id: string;
  niche_name: string;
  slug: string;
  seo_title: string;
  seo_meta_description: string;
  seo_content_html: string;
  seo_variants?: Array<{ title: string; meta: string; score: number; template: number }>;
  created_at?: string;
  moderation_status?: 'draft' | 'pending_review' | 'approved' | 'rejected';
  quality_score?: number;
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
}

export type ModerationStatus = 'draft' | 'pending_review' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  email: string | null;
  full_name?: string;
  role: 'viewer' | 'editor' | 'admin';
  created_at?: string;
}

export interface ContentAuditLog {
  id: number;
  resource_type: 'tool' | 'niche_page' | 'comparison' | 'category';
  resource_id: string;
  resource_slug?: string;
  action:
    | 'created'
    | 'updated'
    | 'deleted'
    | 'submitted_for_review'
    | 'approved'
    | 'rejected'
    | 'regenerated'
    | 'published'
    | 'unpublished';
  actor_id?: string;
  actor_email?: string;
  changes?: Record<string, [unknown, unknown]>;
  quality_score?: number;
  notes?: string;
  created_at: string;
}

export interface Comparison {
  id: string;
  tool_a_id: string;
  tool_b_id: string;
  slug: string;
  summary?: string;
  created_at?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  seo_title?: string;
  seo_meta_description?: string;
  seo_content_html?: string;
  updated_at?: string;
}

// User reviews — copy of the shape from src/hooks/useReviews.ts to avoid
// import cycles between types and hooks.
export interface ToolReview {
  id: string;
  tool_id: string;
  author_name: string;
  rating: number;
  title?: string | null;
  body: string;
  verified: boolean;
  ai_sentiment?: string | null;
  created_at: string;
}
