/**
 * AIContentService — hybrid AI content generation for the SaaS directory.
 *
 * SERVER-ONLY. Reads GEMINI_API_KEY and ANTHROPIC_API_KEY from process.env.
 * Never import from React components — use it inside /api routes, cron
 * handlers, and Node scripts.
 *
 * Token-saving philosophy
 * ═══════════════════════
 *   Default path:  Gemini 2.0 Flash    (~30× cheaper than Claude)
 *   Refine path:   Claude 3.5 Sonnet   (only for high-stakes copy or
 *                                       when Gemini draft fails QC)
 *
 *   Routing:
 *     - Structured fields (features, pros/cons, pricing, FAQs)
 *           → Gemini only — formulaic, no nuance gain from Claude
 *     - Long-form drafts (description, niche page)
 *           → Gemini draft → Claude polish IF quality check fails
 *     - High-stakes copy (verdict, conversion_hook)
 *           → Claude only — voice + E-E-A-T critical
 *
 * Reliability
 * ═══════════
 *   - Retries: 2 with exponential jitter
 *   - Fallback: Gemini fail → Claude. Claude polish fail → return draft.
 *   - Token + cost logged to ai_usage_logs on every call (success or fail)
 *
 * Public API (singleton: aiContentService)
 *   generateToolContent(tool, categoryName)
 *   generateNicheContent(nicheName, sampleTools)
 *   improveContent(content, type, instructions?)
 *   generateFAQs(toolName, count?)
 *   generateConversionHook(tool)
 *   batchGenerate(operations)
 */
import { aiGenerate } from '@/lib/ai';
import { callClaude } from '@/lib/anthropic';
import { createLogger } from '@/lib/logger';
import { getSupabaseAdmin } from '../../api/_lib/supabase';
import type { Tool } from '@/types/tool';

const log = createLogger('ai-content');

// ── Public types ────────────────────────────────────────────────────────

export type Provider = 'gemini' | 'anthropic';
export type ResourceType = 'tool' | 'niche_page' | 'comparison';

export type ContentKind =
  | 'description'
  | 'features'
  | 'pros_cons'
  | 'pricing'
  | 'faqs'
  | 'verdict'
  | 'conversion_hook'
  | 'niche_page'
  | 'alternatives';

export type ImproveType = 'tool' | 'niche' | 'faq' | 'cta';

export interface FullToolContent {
  description: string;
  features: string[];
  pros_cons: { pros: string[]; cons: string[] };
  pricing: { plans: Array<{ name: string; price: string; features: string[] }> };
  faqs: Array<{ q: string; a: string }>;
  verdict: string;
  conversion_hook: string;
}

export interface NichePageContent {
  intro_html: string;
  methodology_html: string;
  picks: Array<{ slug: string; pitch: string }>;
  conclusion_html: string;
}

export interface CallResult<T = unknown> {
  data: T;
  provider: 'gemini' | 'anthropic' | 'hybrid';
  draftModel?: string;
  polishModel?: string;
  totalCostUsd: number;
  totalLatencyMs: number;
  polished: boolean;
}

export interface ServiceConfig {
  defaultModel?: 'gemini-2.0-flash' | 'claude-3-5-sonnet-latest';
  temperature?: number;
  maxTokens?: number;
  enablePolish?: boolean;
  retries?: number;
}

export type BatchOperation =
  | { type: 'toolContent'; payload: { tool: Partial<Tool>; categoryName: string } }
  | { type: 'nicheContent'; payload: { nicheName: string; sampleTools: unknown[] } }
  | { type: 'faqs'; payload: { toolName: string; count?: number } }
  | { type: 'conversionHook'; payload: { tool: Partial<Tool> } }
  | {
      type: 'improve';
      payload: { content: string; type: ImproveType; instructions?: string };
    };

interface RouteOptions {
  resourceType?: ResourceType;
  resourceSlug?: string;
  forceProvider?: Provider;
  skipPolish?: boolean;
}

// ── Cost constants (USD per 1M tokens, Q1 2026) ────────────────────────
// Free-tier models cost $0 (subject to RPM/RPD quotas enforced by ai.ts).
const COST: Record<string, { input: number; output: number }> = {
  // Groq
  'llama-3.1-8b-instant': { input: 0, output: 0 },              // free tier
  'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },     // paid
  // Gemini
  'gemini-2.0-flash-exp': { input: 0, output: 0 },              // free tier
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },              // paid
  // OpenAI (no free tier)
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  // Claude (refine path)
  'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
  // Special
  cache: { input: 0, output: 0 },
  fallback: { input: 0, output: 0 },
};

// ── Routing strategy per content kind ──────────────────────────────────
const STRATEGY: Record<ContentKind, 'draft' | 'structured' | 'premium'> = {
  description: 'draft',
  niche_page: 'draft',
  alternatives: 'draft',
  features: 'structured',
  pros_cons: 'structured',
  pricing: 'structured',
  faqs: 'structured',
  verdict: 'premium',
  conversion_hook: 'premium',
};

const SYSTEM_PROMPT = `You write SEO content for an affiliate SaaS directory called SaaS Excellence Hub.
Voice: confident, expert, concrete. No hype words ("revolutionary", "game-changer", "cutting-edge").
No invented pricing or partnerships. Match the search intent of someone evaluating tools for their workflow.`;

export type GenerateTier = 'cheap' | 'full';

// ════════════════════════════════════════════════════════════════════════
// Service class
// ════════════════════════════════════════════════════════════════════════

export class AIContentService {
  private config: Required<ServiceConfig>;

  constructor(config: ServiceConfig = {}) {
    this.config = {
      defaultModel: config.defaultModel ?? 'gemini-2.0-flash',
      temperature: config.temperature ?? 0.6,
      maxTokens: config.maxTokens ?? 2048,
      enablePolish: config.enablePolish ?? true,
      retries: config.retries ?? 2,
    };
  }

  // ── 1. Full tool content ─────────────────────────────────────────────

  async generateToolContent(
    tool: Partial<Tool>,
    categoryName: string,
    tier: GenerateTier = 'full',
  ): Promise<CallResult<FullToolContent>> {
    const start = Date.now();
    const ctx = {
      name: tool.name,
      slug: tool.slug,
      category: categoryName,
      description: tool.description,
      features: tool.features,
      pricing_data: tool.pricing_data,
    };
    const opts: RouteOptions = { resourceType: 'tool', resourceSlug: tool.slug };

    if (tier === 'cheap') {
      // Cheap tier: 3 calls instead of 7. Skipped fields get safe stubs.
      const [desc, faqs, hook] = await Promise.all([
        this.runForKind<string>('description', ctx, opts),
        this.runForKind<Array<{ q: string; a: string }>>('faqs', ctx, opts),
        this.runForKind<string>('conversion_hook', ctx, opts),
      ]);

      const totalCost = desc.totalCostUsd + faqs.totalCostUsd + hook.totalCostUsd;

      return {
        data: {
          description: desc.data,
          features: [],
          pros_cons: { pros: [], cons: [] },
          pricing: { plans: [] },
          faqs: faqs.data,
          verdict: '',
          conversion_hook: hook.data,
        },
        provider: anyHybrid([desc, faqs, hook]),
        totalCostUsd: totalCost,
        totalLatencyMs: Date.now() - start,
        polished: desc.polished || faqs.polished || hook.polished,
      };
    }

    const [desc, feats, pcs, pricing, faqs, verdict, hook] = await Promise.all([
      this.runForKind<string>('description', ctx, opts),
      this.runForKind<string[]>('features', ctx, opts),
      this.runForKind<{ pros: string[]; cons: string[] }>('pros_cons', ctx, opts),
      this.runForKind<{ plans: Array<{ name: string; price: string; features: string[] }> }>(
        'pricing',
        ctx,
        opts,
      ),
      this.runForKind<Array<{ q: string; a: string }>>('faqs', ctx, opts),
      this.runForKind<string>('verdict', ctx, opts),
      this.runForKind<string>('conversion_hook', ctx, opts),
    ]);

    const totalCost =
      desc.totalCostUsd +
      feats.totalCostUsd +
      pcs.totalCostUsd +
      pricing.totalCostUsd +
      faqs.totalCostUsd +
      verdict.totalCostUsd +
      hook.totalCostUsd;

    return {
      data: {
        description: desc.data,
        features: feats.data,
        pros_cons: pcs.data,
        pricing: pricing.data,
        faqs: faqs.data,
        verdict: verdict.data,
        conversion_hook: hook.data,
      },
      provider: anyHybrid([desc, feats, pcs, pricing, faqs, verdict, hook]),
      totalCostUsd: totalCost,
      totalLatencyMs: Date.now() - start,
      polished:
        desc.polished || verdict.polished || hook.polished || pcs.polished || faqs.polished,
    };
  }

  // ── 2. Niche page (always polished — long-form needs flow) ───────────

  async generateNicheContent(
    nicheName: string,
    sampleTools: unknown[],
  ): Promise<CallResult<NichePageContent>> {
    return this.runForKind<NichePageContent>(
      'niche_page',
      { name: nicheName, tools: sampleTools },
      { resourceType: 'niche_page' },
    );
  }

  // ── 3. Improve existing content (Claude only — that's what polish is for) ──

  async improveContent(
    content: string,
    type: ImproveType,
    instructions?: string,
  ): Promise<CallResult<string>> {
    const kind: ContentKind =
      type === 'faq' ? 'faqs' : type === 'cta' ? 'conversion_hook' : type === 'niche' ? 'niche_page' : 'description';
    const isJson = expectsJson(kind);

    const focus = instructions ? `Specific guidance: ${instructions}` : '';
    const prompt = `Improve the existing ${type} content below for clarity, concrete detail, and SEO. Keep the same structure and length range.

${focus}

Existing content:
${content}`;

    return this.runClaude<string>(prompt, kind, isJson, { resourceType: 'tool' });
  }

  // ── 4. FAQs only — Gemini only ───────────────────────────────────────

  async generateFAQs(
    toolName: string,
    count = 5,
  ): Promise<CallResult<Array<{ q: string; a: string }>>> {
    return this.runForKind<Array<{ q: string; a: string }>>(
      'faqs',
      { name: toolName, count },
      { resourceType: 'tool' },
    );
  }

  // ── 5. CTA / conversion hook — Claude only ───────────────────────────

  async generateConversionHook(tool: Partial<Tool>): Promise<CallResult<string>> {
    return this.runForKind<string>(
      'conversion_hook',
      { name: tool.name, slug: tool.slug, description: tool.description, features: tool.features },
      { resourceType: 'tool', resourceSlug: tool.slug },
    );
  }

  // ── 6. Batch — runs multiple operations in parallel ──────────────────

  async batchGenerate(
    operations: BatchOperation[],
  ): Promise<Array<{ op: BatchOperation; result: CallResult | null; error?: string }>> {
    return Promise.all(
      operations.map(async (op) => {
        try {
          let result: CallResult;
          switch (op.type) {
            case 'toolContent':
              result = await this.generateToolContent(
                op.payload.tool,
                op.payload.categoryName,
              );
              break;
            case 'nicheContent':
              result = await this.generateNicheContent(
                op.payload.nicheName,
                op.payload.sampleTools,
              );
              break;
            case 'faqs':
              result = await this.generateFAQs(op.payload.toolName, op.payload.count);
              break;
            case 'conversionHook':
              result = await this.generateConversionHook(op.payload.tool);
              break;
            case 'improve':
              result = await this.improveContent(
                op.payload.content,
                op.payload.type,
                op.payload.instructions,
              );
              break;
          }
          return { op, result };
        } catch (err) {
          return {
            op,
            result: null,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // Internal — routing engine
  // ════════════════════════════════════════════════════════════════════

  private async runForKind<T>(
    kind: ContentKind,
    context: Record<string, unknown>,
    options: RouteOptions = {},
  ): Promise<CallResult<T>> {
    const start = Date.now();
    const strategy = options.forceProvider
      ? options.forceProvider === 'anthropic'
        ? 'premium'
        : 'structured'
      : STRATEGY[kind];

    const prompt = buildPrompt(kind, context);
    const isJson = expectsJson(kind);
    let result: CallResult<T>;

    if (strategy === 'premium') {
      result = await this.runClaude<T>(prompt, kind, isJson, options);
    } else {
      const draft = await this.runAI<T>(prompt, kind, isJson, options);
      const wantPolish =
        strategy === 'draft' &&
        this.config.enablePolish &&
        !options.skipPolish &&
        shouldPolish(kind, draft.data);
      result = wantPolish ? await this.polish<T>(prompt, draft, kind, isJson, options) : draft;
    }

    result.totalLatencyMs = Date.now() - start;
    return result;
  }

  private async runAI<T>(
    prompt: string,
    kind: ContentKind,
    isJson: boolean,
    opts: RouteOptions,
  ): Promise<CallResult<T>> {
    const start = Date.now();
    try {
      const { data, meta } = await this.retry(() =>
        aiGenerate<T>(prompt, {
          systemPrompt: SYSTEM_PROMPT,
          json: isJson,
          temperature: this.config.temperature,
          maxOutputTokens: this.config.maxTokens,
          contentHint: hintFor(kind),
          cacheKey: opts.resourceSlug ? `${kind}:${opts.resourceSlug}` : undefined,
        }),
      );
      const provider: 'gemini' | 'anthropic' = 'gemini'; // CallResult shape stays compatible
      const logProvider: UsageEntry['provider'] =
        meta.provider === 'groq'
          ? 'groq'
          : meta.provider === 'openai'
            ? 'openai'
            : meta.provider === 'cache' || meta.provider === 'fallback'
              ? 'gemini'
              : (meta.provider as UsageEntry['provider']);
      void this.logUsage({
        provider: logProvider,
        model: meta.model,
        operation: kind,
        resource_type: opts.resourceType,
        resource_slug: opts.resourceSlug,
        input_tokens: approxTokens(prompt),
        output_tokens: approxTokens(JSON.stringify(data)),
        cost_usd: meta.costUsd,
        latency_ms: Date.now() - start,
        success: !meta.fallback,
        error_message: meta.fallback ? 'fallback content used' : undefined,
      });
      return {
        data,
        provider,
        draftModel: meta.model,
        totalCostUsd: meta.costUsd,
        totalLatencyMs: 0,
        polished: false,
      };
    } catch (err) {
      void this.logUsage({
        provider: 'gemini',
        model: 'multi-provider',
        operation: kind,
        resource_type: opts.resourceType,
        resource_slug: opts.resourceSlug,
        latency_ms: Date.now() - start,
        success: false,
        error_message: err instanceof Error ? err.message : String(err),
      });
      log.warn(`AI providers failed (${kind}), falling back to Claude`);
      return this.runClaude<T>(prompt, kind, isJson, opts);
    }
  }

  private async runClaude<T>(
    prompt: string,
    kind: ContentKind,
    isJson: boolean,
    opts: RouteOptions,
  ): Promise<CallResult<T>> {
    const start = Date.now();
    try {
      const res = await this.retry(() =>
        callClaude(prompt, {
          model: 'claude-3-5-sonnet-latest',
          systemPrompt: SYSTEM_PROMPT,
          json: isJson,
          temperature: 0.7,
          maxTokens: this.config.maxTokens,
        }),
      );
      const cost =
        (res.inputTokens / 1e6) * COST['claude-3-5-sonnet'].input +
        (res.outputTokens / 1e6) * COST['claude-3-5-sonnet'].output;
      void this.logUsage({
        provider: 'anthropic',
        model: res.model,
        operation: kind,
        resource_type: opts.resourceType,
        resource_slug: opts.resourceSlug,
        input_tokens: res.inputTokens,
        output_tokens: res.outputTokens,
        cost_usd: cost,
        latency_ms: Date.now() - start,
        success: true,
      });
      const data = isJson ? (JSON.parse(res.text) as T) : (res.text as unknown as T);
      return {
        data,
        provider: 'anthropic',
        draftModel: res.model,
        totalCostUsd: cost,
        totalLatencyMs: 0,
        polished: false,
      };
    } catch (err) {
      void this.logUsage({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        operation: kind,
        resource_type: opts.resourceType,
        resource_slug: opts.resourceSlug,
        latency_ms: Date.now() - start,
        success: false,
        error_message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async polish<T>(
    originalPrompt: string,
    draft: CallResult<T>,
    kind: ContentKind,
    isJson: boolean,
    opts: RouteOptions,
  ): Promise<CallResult<T>> {
    const polishPrompt = `Brief:\n${originalPrompt}\n\nDraft to refine:\n${
      typeof draft.data === 'string' ? draft.data : JSON.stringify(draft.data)
    }\n\nImprove clarity, tighten phrasing, remove generic AI tells. Keep the same structure.`;

    try {
      const polished = await this.runClaude<T>(polishPrompt, kind, isJson, opts);
      return {
        data: polished.data,
        provider: 'hybrid',
        draftModel: draft.draftModel,
        polishModel: polished.draftModel,
        totalCostUsd: draft.totalCostUsd + polished.totalCostUsd,
        totalLatencyMs: 0,
        polished: true,
      };
    } catch (err) {
      log.warn('Polish failed, returning draft', err);
      return draft;
    }
  }

  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    const attempts = this.config.retries;
    let lastErr: unknown;
    for (let i = 0; i <= attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (i < attempts) {
          await new Promise((r) => setTimeout(r, 500 * (i + 1) + Math.random() * 300));
        }
      }
    }
    throw lastErr;
  }

  private async logUsage(entry: UsageEntry): Promise<void> {
    try {
      const supabase = getSupabaseAdmin();
      await supabase.from('ai_usage_logs').insert({
        provider: entry.provider,
        model: entry.model,
        operation: entry.operation,
        resource_type: entry.resource_type ?? null,
        resource_slug: entry.resource_slug ?? null,
        input_tokens: entry.input_tokens ?? null,
        output_tokens: entry.output_tokens ?? null,
        cost_usd: entry.cost_usd ?? null,
        latency_ms: entry.latency_ms,
        success: entry.success,
        error_message: entry.error_message ?? null,
      });
    } catch {
      /* logging must never throw to caller */
    }
  }
}

// ════════════════════════════════════════════════════════════════════════
// Singleton + back-compat for pipeline.ts callers
// ════════════════════════════════════════════════════════════════════════

export const aiContentService = new AIContentService();

/** Legacy single-field helper used by api/cron/refresh-content.ts */
export async function generateAIContent<T>(request: {
  type: ContentKind;
  context: Record<string, unknown>;
  resourceType?: ResourceType;
  resourceSlug?: string;
  forceProvider?: Provider;
  skipPolish?: boolean;
}): Promise<CallResult<T>> {
  return (
    aiContentService as unknown as {
      runForKind<U>(
        kind: ContentKind,
        context: Record<string, unknown>,
        options: RouteOptions,
      ): Promise<CallResult<U>>;
    }
  ).runForKind<T>(request.type, request.context, {
    forceProvider: request.forceProvider,
    skipPolish: request.skipPolish,
    resourceType: request.resourceType,
    resourceSlug: request.resourceSlug,
  });
}

// ════════════════════════════════════════════════════════════════════════
// Pure helpers (exported for tests)
// ════════════════════════════════════════════════════════════════════════

export function shouldPolish(kind: ContentKind, data: unknown): boolean {
  if (typeof data === 'string') {
    if (data.length < 200) return true;
    if (/(in today's|in conclusion|game-changer|revolutionary|cutting-edge)/i.test(data)) {
      return true;
    }
    return false;
  }
  if (kind === 'niche_page' || kind === 'alternatives') return true;
  return false;
}

export function expectsJson(kind: ContentKind): boolean {
  return (
    kind === 'features' ||
    kind === 'pros_cons' ||
    kind === 'pricing' ||
    kind === 'faqs' ||
    kind === 'niche_page'
  );
}

function buildPrompt(kind: ContentKind, context: Record<string, unknown>): string {
  const ctx = JSON.stringify(context).slice(0, 2000);
  switch (kind) {
    case 'description':
      return `Write a 300-400 word HTML description for this tool. Use <p> and <strong> only. Cover what it does, who it's for, key differentiators. Tool data: ${ctx}`;
    case 'features':
      return `Return a JSON array of 5-8 concrete features — each ≤ 80 chars, no marketing fluff. Tool data: ${ctx}`;
    case 'pros_cons':
      return `Return JSON: {"pros":[3 items], "cons":[2-3 items]}. Each ≤ 80 chars, balanced + honest. Tool data: ${ctx}`;
    case 'pricing':
      return `Return JSON {"plans":[{"name":"...","price":"...","features":[...]}]}. Use only stated facts; no invention. Tool data: ${ctx}`;
    case 'faqs': {
      const count =
        typeof (context as { count?: number }).count === 'number'
          ? (context as { count: number }).count
          : 5;
      return `Return a JSON array of ${count} FAQ objects: [{"q":"...","a":"..."}]. Real questions buyers ask. Tool data: ${ctx}`;
    }
    case 'verdict':
      return `Write a 2-3 sentence expert verdict (under 280 chars). Plain text, no markdown. Should sound like an experienced reviewer's takeaway. Tool data: ${ctx}`;
    case 'conversion_hook':
      return `Write a one-sentence CTA line ≤ 100 chars. Outcome-focused, no exclamation marks. Plain text. Tool data: ${ctx}`;
    case 'niche_page':
      return `Return JSON:
{ "intro_html":"<p>120-180 word intro covering the search intent</p>",
  "methodology_html":"<p>How tools were evaluated (60-100 words)</p>",
  "picks":[{"slug":"...","pitch":"<p>80-100 word pitch for this pick</p>"}],
  "conclusion_html":"<p>50-80 word wrap-up</p>" }
Niche + tool list: ${ctx}`;
    case 'alternatives':
      return `Write 600-800 word HTML covering alternatives to a specific tool. Include who each alternative is for. Data: ${ctx}`;
  }
}

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function hintFor(kind: ContentKind): 'description' | 'features' | 'faqs' | 'verdict' | 'conversion_hook' | 'generic' {
  if (kind === 'description' || kind === 'features' || kind === 'faqs' || kind === 'verdict' || kind === 'conversion_hook') {
    return kind;
  }
  return 'generic';
}

interface CallLike {
  provider: 'gemini' | 'anthropic' | 'hybrid';
}
function anyHybrid(results: CallLike[]): 'gemini' | 'anthropic' | 'hybrid' {
  if (results.some((r) => r.provider === 'hybrid')) return 'hybrid';
  if (results.every((r) => r.provider === 'anthropic')) return 'anthropic';
  if (results.every((r) => r.provider === 'gemini')) return 'gemini';
  return 'hybrid';
}

interface UsageEntry {
  provider: 'gemini' | 'anthropic' | 'groq' | 'openai';
  model: string;
  operation: string;
  resource_type?: ResourceType;
  resource_slug?: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  latency_ms: number;
  success: boolean;
  error_message?: string;
}

// FIXED: [P0-C, P2]
