
export interface ToolSEOContent {
  description: string;
  full_description: string;
  features: string[];
  pros: string[];
  cons: string[];
  use_cases: string[];
  pricing_summary: string;
}

export interface FullPageSEO {
  title: string;
  meta_description: string;
  slug: string;
  content_html: string;
}

export interface CTROptimization {
  title: string;
  meta_description: string;
}

export interface SeoPriority {
  path: string;
  keyword: string;
  potential: 'High' | 'Medium' | 'Low';
  reason: string;
}

export interface CategoryHubSEO {
  title: string;
  meta_description: string;
  content_html: string;
}

export interface NormalizedToolData {
  features: string[];
  pricing: string;
  target_users: string[];
  complexity: 'low' | 'medium' | 'high';
  category: string;
}

export interface UserIntent {
  goal: string;
  use_case: string;
  budget: 'free' | 'low' | 'premium';
  experience_level: 'beginner' | 'intermediate' | 'advanced';
  features_needed: string[];
  industry: string;
}

export interface BehaviorInsights {
  updated_weights: {
    features: number;
    use_case: number;
    budget: number;
    experience: number;
  };
  insights: string[];
  pattern_detected: string;
}

export interface ToolRecommendation {
  tool_name: string;
  score: number;
  reason: string;
  slug: string;
}

export interface RankedToolAdvice {
  tool_name: string;
  best_for: string;
  why: string;
  weakness: string;
  slug: string;
  match_score: number;
}

export interface PersonalizedPageContent {
  title: string;
  intro: string;
  recommendations: {
    tool_name: string;
    summary: string;
    cta_text: string;
  }[];
}
