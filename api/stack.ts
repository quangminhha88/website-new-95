/**
 * POST /api/stack
 *
 * Body: { role: string, goals: string[] }
 * Returns: { stack: Array<{ id, slug, name, tagline, category_name, logo_url, why }> }
 *
 * 1. Fetch up to 30 approved tools from Supabase
 * 2. Ask Groq (free, fast Llama 3.1) for 4-6 picks + rationale
 *    Falls back to Gemini Flash if Groq is unavailable
 * 3. Join AI picks with tool data; ignore unknown ids
 * 4. Rate-limited 10/min/IP
 *
 * No `src/` imports — runtime is Node serverless and api/_lib has its own
 * helpers (getSupabaseAdmin, rateLimit).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getSupabaseAdmin } from './_lib/supabase';
import { rateLimit } from './_lib/rateLimit';

const ROLES = [
  'Solo founder',
  'Freelancer',
  'Small team',
  'Agency',
  'Enterprise',
] as const;

const GOALS = [
  'Manage projects',
  'Handle invoicing',
  'CRM / Sales',
  'Marketing & SEO',
  'Team communication',
  'Analytics',
  'Customer support',
] as const;

const bodySchema = z.object({
  role: z.enum(ROLES),
  goals: z.array(z.enum(GOALS)).min(1).max(3),
});

interface ToolRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  category_id: string | null;
  features: string[] | null;
  pricing_model: string | null;
  logo_url: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
}

interface AIRecommendation {
  tool_id: string;
  why_this_tool: string;
}

interface AIResponse {
  recommendations: AIRecommendation[];
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? 'unknown';
  if (!(await rateLimit(`stack:${ip}`, 10, 60))) {
    return res.status(429).json({ error: 'rate_limited' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_payload',
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }
  const { role, goals } = parsed.data;

  const supabase = getSupabaseAdmin();

  // Pull a candidate pool — 30 approved tools, ordered by avg_rating desc so
  // the model has the best of the catalogue to choose from.
  const { data: toolRows, error: toolErr } = await supabase
    .from('tools')
    .select('id, slug, name, tagline, category_id, features, pricing_model, logo_url')
    .eq('moderation_status', 'approved')
    .order('avg_rating', { ascending: false, nullsFirst: false })
    .limit(30);

  if (toolErr) {
    return res.status(500).json({ error: 'tool_fetch_failed', detail: toolErr.message });
  }
  const tools = (toolRows ?? []) as ToolRow[];
  if (tools.length === 0) {
    return res.status(200).json({ stack: [] });
  }

  // Resolve category names for the response payload
  const categoryIds = Array.from(
    new Set(tools.map((t) => t.category_id).filter((c): c is string => Boolean(c))),
  );
  let categoryMap = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: catRows } = await supabase
      .from('categories')
      .select('id, name')
      .in('id', categoryIds);
    categoryMap = new Map(
      ((catRows ?? []) as CategoryRow[]).map((c) => [c.id, c.name]),
    );
  }

  // Prompt — the AI sees only id/name/category_id/features so it can reason
  // about fit without being biased by names alone
  const slimTools = tools.map((t) => ({
    id: t.id,
    name: t.name,
    category_id: t.category_id,
    features: (t.features ?? []).slice(0, 6),
  }));
  const prompt = `Given role: ${role}, goals: ${goals.join(', ')}. From this tool list: ${JSON.stringify(slimTools)}. Return JSON: { "recommendations": [{"tool_id":"...","why_this_tool":"1 sentence, max 15 words"}] } — pick 4-6 tools that complement each other, one per major goal. Return ONLY valid JSON.`;

  let aiResponse: AIResponse | null = null;
  try {
    aiResponse = await callGroq(prompt);
  } catch (err) {
    console.warn('Groq failed, trying Gemini:', err instanceof Error ? err.message : err);
    try {
      aiResponse = await callGemini(prompt);
    } catch (gemErr) {
      console.error('Gemini also failed:', gemErr instanceof Error ? gemErr.message : gemErr);
      return res.status(503).json({ error: 'ai_unavailable' });
    }
  }

  if (!aiResponse?.recommendations || aiResponse.recommendations.length === 0) {
    return res.status(200).json({ stack: [] });
  }

  // Join AI picks with full tool data; drop unknown ids
  const toolById = new Map(tools.map((t) => [t.id, t]));
  const stack = aiResponse.recommendations
    .map((rec) => {
      const tool = toolById.get(rec.tool_id);
      if (!tool) return null;
      return {
        id: tool.id,
        slug: tool.slug,
        name: tool.name,
        tagline: tool.tagline,
        category_name: tool.category_id ? (categoryMap.get(tool.category_id) ?? null) : null,
        logo_url: tool.logo_url,
        why: rec.why_this_tool.trim(),
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .slice(0, 6);

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({ stack });
}

// ── Provider calls (raw fetch — no src/ imports) ───────────────────

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string } }>;
}

interface GeminiCompletion {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

async function callGroq(prompt: string): Promise<AIResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const json = (await res.json()) as ChatCompletion;
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq: empty content');
  return JSON.parse(text) as AIResponse;
}

async function callGemini(prompt: string): Promise<AIResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1500,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const json = (await res.json()) as GeminiCompletion;
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini: empty content');
  return JSON.parse(text) as AIResponse;
}
