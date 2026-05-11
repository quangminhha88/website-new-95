
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { generateNichePageSEO } from '../src/services/geminiService';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const longTailNiches = [
  "AI Content Generators for Real Estate Agents",
  "No-Code App Builders for Small Healthcare Clinics",
  "Internal Communication Platforms for Hybrid Engineering Teams",
  "CRM Software with WhatsApp Integration for Sales Teams",
  "Automated Email Marketing for Shopify Store Owners",
  "Task Management Tools for Creative Design Agencies",
  "Professional Video Hosting for Online Course Creators",
  "AI Background Removers for E-commerce Product Photography",
  "SEO Audit Tools for Local Plumbing and HVAC Businesses",
  "Secure Password Sharing for Managed Service Providers (MSPs)",
  "Social Media Scheduling for Multi-Location Franchises",
  "AI Grammar Checkers for Academic Research Paper Writers",
  "Cloud Storage for High-Resolution Architectural Renders",
  "Inventory Management for Multi-Channel Etsy Sellers",
  "Client Portal Software for Independent Legal Consultants",
  "Payroll Software for Global Remote Startups",
  "AI Video Subtitle Generators for YouTube Content Creators",
  "Help Desk Software for Growing SaaS Support Teams",
  "Booking Systems for Independent Yoga and Fitness Studios",
  "Competitive Analysis Tools for Affiliate Marketers"
];

async function generateBoostingPages() {
  console.log("🚀 Starting Index Boosting Page Generation (Target: 20 Pages)...");

  for (const niche of longTailNiches) {
    try {
      console.log(`\n🔍 Processing: ${niche}...`);
      
      // Select 12 candidate tools from the same category or matching keywords
      // We take more to ensure the AI can pick at least 10
      const { data: tools } = await supabase
        .from('tools')
        .select('name, slug, description')
        .limit(15); 
        // In a real app, you'd filter by keywords/category. 
        // Here we take a broader sample to ensure linking density.

      if (!tools || tools.length < 10) {
        console.log(`  ↳ ⚠️ Not enough tools found globally to build a high-density page. (Found: ${tools?.length || 0}).`);
        continue;
      }

      console.log(`  ↳ Generating index-boosting content for ${niche} with ${tools.length} internal links...`);
      const seoData = await generateNichePageSEO(niche, tools);

      const { error: upsertError } = await supabase
        .from('niche_pages')
        .upsert({
          niche_name: niche,
          slug: seoData.slug,
          seo_title: seoData.title,
          seo_meta_description: seoData.meta_description,
          seo_content_html: seoData.content_html,
          updated_at: new Date().toISOString()
        }, { onConflict: 'slug' });

      if (upsertError) {
        console.error(`  ↳ Error upserting page: ${upsertError.message}`);
      } else {
        console.log(`  ✅ Page "${seoData.title}" created successfully.`);
        console.log(`  🔗 Slug: /best/${seoData.slug}`);
      }

      // Throttle for stability
      await new Promise(resolve => setTimeout(resolve, 2500));
    } catch (err) {
      console.error(`  ↳ FATAL: Error processing niche ${niche}:`, err);
    }
  }

  console.log("\n🏁 Index Boosting Page Generation Complete!");
}

generateBoostingPages();
