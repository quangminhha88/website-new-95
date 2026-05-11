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

const niches = [
  // Top 10 - Fastest Money (High Intent + High Commission)
  "AI Video Generator Alternatives",
  "Best CRM for Small Business Automation",
  "Scalable Cloud Hosting for SaaS",
  "HubSpot vs Pipedrive for Real Estate",
  "HeyGen Alternatives for Sales Videos",
  "Best Managed Cloud Hosting for WordPress",
  "ElevenLabs Alternatives for AI Voice",
  "Best Headless CMS for Content Teams",
  "DigitalOcean vs Vultr for Developers",
  "Best AI Writing Software for SEO Agencies",
  
  // Next 10 - High Scalability
  "Best Project Management Tools for Marketing",
  "AI Image Generators for Ad Campaigns",
  "Best Email Marketing for E-commerce ROI",
  "Password Managers for High-Security Teams",
  "Best Customer Support Software for SaaS",
  "Sales Intelligence Tools for B2B Growth",
  "Best SEO Analytics for Local Business",
  "Professional Video Editing for Social Media",
  "Best AI Logo Makers for Branding",
  "Best VPN for Remote Workforce Security"
];

async function generateNichePages() {
  console.log("🌟 Starting Niche Page Generation...");

  for (const niche of niches) {
    try {
      console.log(`🔍 Processing niche: ${niche}...`);
      
      // Find candidate tools (using the first word of niche as a keyword)
      const keyword = niche.split(' ')[0];
      const { data: tools } = await supabase
        .from('tools')
        .select('name, slug, description')
        .or(`description.ilike.%${keyword}%,name.ilike.%${keyword}%`)
        .limit(12);

      if (!tools || tools.length < 3) {
        console.log(`  ↳ Not enough tools found for ${niche} (Found: ${tools?.length || 0}). Skipping.`);
        continue;
      }

      console.log(`  ↳ Generating SEO content for ${niche} with ${tools.length} tools...`);
      const seoData = await generateNichePageSEO(niche, tools);

      // Using niche_pages table - ensure it exists with (slug, niche_name, seo_title, seo_meta_description, seo_content_html)
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
        console.error(`  ↳ Failed to upsert ${niche}:`, upsertError.message);
        console.log("Note: Make sure the 'niche_pages' table exists in your Supabase database.");
      } else {
        console.log(`  ✅ Niche page "${niche}" generated successfully.`);
      }

      // Throttle for API stability
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      console.error(`  ↳ Error processing niche ${niche}:`, err);
    }
  }

  console.log("🏁 Niche page generation complete!");
}

generateNichePages();
