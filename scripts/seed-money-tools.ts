
import { getSupabaseClient } from '../src/lib/supabase';

const PROFIT_TOOLS = [
  {
    name: 'HeyGen',
    slug: 'heygen',
    tagline: 'AI Video Generation for High-Growth Sales Teams',
    commission_estimate: 150, // Individual CPA
    conversion_probability: 0.04, // 4% CVR for high intent
    monetization_type: 'affiliate',
    affiliate_network: 'PartnerStack',
    pricing_data: { starting_price: 30, currency: '$' },
    features: ['AI Avatars', 'Voice Cloning', 'Personalized Sales Videos'],
    conversion_hook: 'Unlock 20% off your first month with our exclusive partner link.'
  },
  {
    name: 'Pipedrive',
    slug: 'pipedrive',
    tagline: 'Leading Sales CRM for Small to Medium Enterprises',
    commission_estimate: 250,
    conversion_probability: 0.02,
    monetization_type: 'affiliate',
    affiliate_network: 'Impact',
    pricing_data: { starting_price: 15, currency: '$' },
    features: ['Visual Pipelines', 'Sales Forecasting', 'Lead Management'],
    conversion_hook: 'Start your 30-day extended free trial today.'
  },
  {
    name: 'DigitalOcean',
    slug: 'digitalocean',
    tagline: 'The Reliable Cloud Platform for Developers',
    commission_estimate: 200,
    conversion_probability: 0.03,
    monetization_type: 'affiliate',
    affiliate_network: 'Direct',
    pricing_data: { starting_price: 4, currency: '$' },
    features: ['Droplets', 'App Platform', 'Managed Databases'],
    conversion_hook: 'Get $200 in free credit for your first 60 days.'
  },
  {
    name: 'Synthesia',
    slug: 'synthesia',
    tagline: '#1 Rated AI Video Creation Platform',
    commission_estimate: 180,
    conversion_probability: 0.035,
    monetization_type: 'affiliate',
    affiliate_network: 'PartnerStack',
    pricing_data: { starting_price: 22, currency: '$' },
    features: ['140+ AI Avatars', 'Micro-Gestures', 'Multi-Language Support'],
    conversion_hook: 'Create an AI video in minutes, no equipment needed.'
  },
  {
    name: 'HubSpot',
    slug: 'hubspot',
    tagline: 'The Leading All-in-One CRM for Scaling Teams',
    commission_estimate: 500,
    conversion_probability: 0.015,
    monetization_type: 'affiliate',
    affiliate_network: 'Impact',
    pricing_data: { starting_price: 20, currency: '$' },
    features: ['Marketing Hub', 'Sales Force Automation', 'Global Reporting'],
    conversion_hook: 'Start free and scale your entire customer journey.'
  },
  {
    name: 'HeyGen',
    slug: 'heygen',
    tagline: 'Next-Gen AI Video Generation for Teams',
    commission_estimate: 150,
    conversion_probability: 0.04,
    monetization_type: 'affiliate',
    affiliate_network: 'Direct',
    pricing_data: { starting_price: 24, currency: '$' },
    features: ['Photo Avatar', 'Video Translate', 'Avatar Lite'],
    conversion_hook: 'Create professional videos without a camera.'
  },
  {
    name: 'Vultr',
    slug: 'vultr',
    tagline: 'High-Performance Cloud Computing & Bare Metal',
    commission_estimate: 100,
    conversion_probability: 0.045,
    monetization_type: 'affiliate',
    affiliate_network: 'Direct',
    pricing_data: { starting_price: 2.50, currency: '$' },
    features: ['Bare Metal', 'Cloud Compute', 'Managed Kubernetes'],
    conversion_hook: 'Try Vultr with $250 in free credit.'
  },
  {
    name: 'ElevenLabs',
    slug: 'elevenlabs',
    tagline: 'Most Realistic AI Speech & Voice Cloning',
    commission_estimate: 80,
    conversion_probability: 0.06,
    monetization_type: 'affiliate',
    affiliate_network: 'Impact',
    pricing_data: { starting_price: 1, currency: '$' },
    features: ['Instant Voice Cloning', 'Emotional Range', 'Speech-to-Speech'],
    conversion_hook: 'Get your first 10,000 characters free.'
  },
  {
    name: 'Pipedrive',
    slug: 'pipedrive',
    tagline: 'Sales CRM & Pipeline Management Software',
    commission_estimate: 200,
    conversion_probability: 0.025,
    monetization_type: 'affiliate',
    affiliate_network: 'PartnerStack',
    pricing_data: { starting_price: 14.90, currency: '$' },
    features: ['Visual Pipelines', 'Sales Forecasting', 'Email Integration'],
    conversion_hook: 'Try Pipedrive for 14 days, no credit card required.'
  },
  {
    name: 'ClickUp',
    slug: 'clickup',
    tagline: 'One App to Replace Them All - Productivity Platform',
    commission_estimate: 60,
    conversion_probability: 0.05,
    monetization_type: 'affiliate',
    affiliate_network: 'Impact',
    pricing_data: { starting_price: 7, currency: '$' },
    features: ['Tasks', 'Docs', 'Goals', 'Whiteboards'],
    conversion_hook: 'Free forever for personal use. Scale when you need.'
  }
];

async function seedMoneyTools() {
  const supabase = getSupabaseClient();
  console.log('💰 Seeding high-profit tools...');

  for (const tool of PROFIT_TOOLS) {
    const { error } = await supabase
      .from('tools')
      .upsert(tool, { onConflict: 'slug' });

    if (error) console.error(`❌ Error seeding ${tool.name}:`, error.message);
    else console.log(`✅ Seeded ${tool.name} (EPC Potential: $${(tool.commission_estimate * tool.conversion_probability).toFixed(2)})`);
  }
}

seedMoneyTools();
