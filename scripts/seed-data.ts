
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const SAMPLE_TOOLS = [
  {
    name: "Linear",
    category: "Project Management",
    tagline: "The issue tracker you'll actually like",
    description: "Linear helps streamline software projects, sprints, tasks, and bug tracking. It’s built for high-performance teams.",
    website_url: "https://linear.app",
    pricing_model: "Freemium",
    features: ["Issue tracking", "Cycles", "Roadmaps", "Integrations"]
  },
  {
    name: "Supabase",
    category: "Backend-as-a-Service",
    tagline: "The Open Source Firebase Alternative",
    description: "Supabase is an open source Firebase alternative. Start your project with a Postgres database, Authentication, instant APIs, Edge Functions, Realtime, and Storage.",
    website_url: "https://supabase.com",
    pricing_model: "Usage-based",
    features: ["Database", "Auth", "Storage", "Edge Functions"]
  },
  {
    name: "Jira",
    category: "Project Management",
    tagline: "The #1 software development tool used by agile teams",
    description: "Jira is built for every member of your software team to plan, track, and release great software.",
    website_url: "https://www.atlassian.com/software/jira",
    pricing_model: "Freemium",
    features: ["Scrum boards", "Kanban boards", "Roadmaps", "Agile reporting"]
  },
  {
    name: "Asana",
    category: "Project Management",
    tagline: "Work anytime, anywhere with Asana",
    description: "Asana is the easiest way for teams to track their work and get results.",
    website_url: "https://asana.com",
    pricing_model: "Freemium",
    features: ["List view", "Timeline", "Automation", "Workload"]
  },
  {
    name: "Firebase",
    category: "Backend-as-a-Service",
    tagline: "Google's mobile and web app development platform",
    description: "Firebase helps you build and run successful apps. Backed by Google and loved by app developers around the world.",
    website_url: "https://firebase.google.com",
    pricing_model: "Usage-based",
    features: ["Realtime Database", "Cloud Firestore", "Cloud Functions", "Authentication"]
  },
  {
    name: "Notion",
    category: "Productivity",
    tagline: "Write, plan, share. With AI at your side.",
    description: "A new tool that blends your everyday work apps into one. It's the all-in-one workspace for you and your team.",
    website_url: "https://notion.so",
    pricing_model: "Freemium",
    features: ["Wikis", "Projects", "Docs", "Notion AI"]
  }
];

async function seed() {
  console.log("🚀 Starting seed...");

  for (const toolData of SAMPLE_TOOLS) {
    try {
      // 1. Ensure Category exists
      const categorySlug = toolData.category.toLowerCase().replace(/ /g, '-');
      let { data: category, error: catError } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', categorySlug)
        .single();

      if (!category) {
        console.log(`Creating category: ${toolData.category}`);
        const { data: newCat, error: createCatError } = await supabase
          .from('categories')
          .insert({ name: toolData.category, slug: categorySlug })
          .select()
          .single();
        
        if (createCatError) throw createCatError;
        category = newCat;
      }

      // 2. Insert Tool
      const toolSlug = toolData.name.toLowerCase().replace(/ /g, '-');
      const { error: toolError } = await supabase
        .from('tools')
        .upsert({
          name: toolData.name,
          slug: toolSlug,
          tagline: toolData.tagline,
          description: toolData.description,
          website_url: toolData.website_url,
          category_id: category!.id,
          pricing_model: toolData.pricing_model,
          features: toolData.features,
          updated_at: new Date().toISOString()
        }, { onConflict: 'slug' });

      if (toolError) {
        console.error(`Error inserting ${toolData.name}:`, toolError.message);
      } else {
        console.log(`✅ Seeded: ${toolData.name}`);
      }
    } catch (err) {
      console.error(`Failed to seed ${toolData.name}:`, err);
    }
  }

  console.log("🏁 Seed complete!");
}

seed();
