import { getSupabaseClient } from '@/lib/supabase';
import cache from '@/lib/cache.client';

export interface RevenueInsight {
  category: string;
  total_commission_potential: number;
  average_conversion_prob: number;
  top_tool_slug: string;
}

export interface OptimizationStrategy {
  tactic: string;
  description: string;
  expected_impact: 'High' | 'Medium';
}

/**
 * Revenue Optimization Service
 * Provides insights into affiliate ROI and provides strategy suggestions.
 */
export class RevenueService {
  /**
   * Generates category-level revenue insights
   */
  async getRevenueInsights(): Promise<RevenueInsight[]> {
    return cache.swr('revenue_insights_global', async () => {
      const sb = getSupabaseClient();
      const { data: tools } = await sb
        .from('tools')
        .select('category_id, commission_estimate, conversion_probability, slug');

      if (!tools) return [];

      const insightsMap: Record<string, any> = {};

      tools.forEach(tool => {
        const cat = tool.category_id || 'uncategorized';
        if (!insightsMap[cat]) {
          insightsMap[cat] = {
            category: cat,
            total_comm: 0,
            counts: 0,
            avg_conv: 0,
            top_tool: tool.slug
          };
        }
        
        insightsMap[cat].total_comm += (tool.commission_estimate || 0.1);
        insightsMap[cat].avg_conv += (tool.conversion_probability || 0.05);
        insightsMap[cat].counts += 1;
      });

      return Object.values(insightsMap).map(i => ({
        category: i.category,
        total_commission_potential: i.total_comm,
        average_conversion_prob: i.avg_conv / i.counts,
        top_tool_slug: i.top_tool
      })).sort((a, b) => b.total_commission_potential - a.total_commission_potential);
    }, 86400); // 24 hour cache
  }

  /**
   * Calculates the Earnings Per Click (EPC) score for a tool.
   * This is our primary metric for ranking tools in SEO pages.
   */
  calculateEPC(tool: { commission_estimate?: number, conversion_probability?: number }): number {
    const commission = tool.commission_estimate || 0.1; // fallback to 10%
    const conversion = tool.conversion_probability || 0.02; // fallback to 2% CVR
    return commission * conversion * 100; // Normalized score
  }

  /**
   * Sorts tools by their profit potential (EPC) with Manual Overrides (Phase 6)
   */
  rankToolsByProfitability(tools: any[]): any[] {
    return [...tools].sort((a, b) => {
      // 1. Check for manual prioritization (Direct Deals)
      const priorityA = a.monetization_priority_weight || 0;
      const priorityB = b.monetization_priority_weight || 0;
      
      if (priorityA !== priorityB) return priorityB - priorityA;

      // 2. Fallback to algorithmic EPC
      const epcA = this.calculateEPC(a);
      const epcB = this.calculateEPC(b);
      return epcB - epcA;
    });
  }

  /**
   * Static strategy for maximizing affiliate revenue
   */
  getOptimizationStrategy(): OptimizationStrategy[] {
    return [
      {
        tactic: 'Dynamic CTA Placement',
        description: 'Inject comparison-based CTAs (e.g., "Switch from X to Y") in top-performing categories.',
        expected_impact: 'High'
      },
      {
        tactic: 'Intent-Based Upselling',
        description: 'Offer premium tool recommendations even if the user asks for "free" if the ROI justify the value.',
        expected_impact: 'Medium'
      },
      {
        tactic: 'Post-Click Retargeting',
        description: 'Track tool abandonment and follow up with alternatives via email or browser notifications.',
        expected_impact: 'High'
      },
      {
        tactic: 'Bulk Affiliate Updates',
        description: 'Sync with Impact/PartnerStack APIs daily to ensure highest available commission rates are used.',
        expected_impact: 'High'
      }
    ];
  }
}

export const revenueService = new RevenueService();
export default revenueService;
