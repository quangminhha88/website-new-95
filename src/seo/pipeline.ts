/**
 * Programmatic content pipeline.
 *
 * Single entry point for generating any SEO page (tool/niche/comparison).
 * Replaces the per-script approach with a unified flow:
 *
 *   keyword → generate (LLM) → enhance (links + CTR) → validate → publish/reject
 *
 * Each stage is pluggable:
 *   - generators: functions that call the LLM with a stage-specific prompt
 *   - enhancers:  apply internal links, inject CTAs, vary anchors
 *   - validators: enforce word count + section requirements
 *
 * Why a pipeline instead of one big script:
 *   - Failures at the validator stage trigger automatic regeneration
 *     (up to 2 retries with stricter prompts) before falling back
 *   - Stages can be replayed: re-run "enhance" without re-generating drafts
 *   - Telemetry: every stage logs duration + outcome for the audit dashboard
 */
import { createLogger } from '@/lib/logger';
import { validateToolPage, validateNichePage, type ValidationResult } from './content-validator';
import {
  buildLinkPlan,
  planAsLLMInstruction,
  countInternalLinks,
  type LinkBuilderInput,
} from './internal-linking';
import {
  generateVariants,
} from './ctr-optimizer';
import type { Tool, NichePage, Category } from '@/types/tool';

const log = createLogger('seo:pipeline');

// ── Pipeline contracts ─────────────────────────────────────────────────

export interface PipelineContext {
  type: 'tool' | 'niche' | 'comparison';
  /** Optional candidates pool for internal linking */
  linkCandidates?: LinkBuilderInput['candidates'];
  /** Maximum regeneration attempts on validation failure */
  maxRetries?: number;
  /** Identifier for logs */
  jobId?: string;
}

export interface PipelineStageResult<T> {
  stage: 'generate' | 'enhance' | 'validate';
  ok: boolean;
  durationMs: number;
  data?: T;
  errors?: string[];
}

export interface PipelineOutcome<T> {
  success: boolean;
  finalData?: T;
  validation?: ValidationResult;
  stages: PipelineStageResult<unknown>[];
  retries: number;
}

// ── Generator/enhancer adapters ────────────────────────────────────────
// These are the only stages that need to know about your specific LLM.
// Plug in your existing geminiService methods here.

export type Generator<T> = (
  input: GeneratorInput,
  attempt: number,
) => Promise<T>;

export interface GeneratorInput {
  /** Target keyword cluster (primary + LSI) */
  keywords: string[];
  /** Page subject (tool name, niche name, "X vs Y") */
  subject: string;
  /** Stage instruction extras (e.g. link plan, stricter rules on retry) */
  extraInstructions?: string;
  /** Page-specific data needed by the prompt */
  pageData: Record<string, unknown>;
}

export interface ToolGeneratorOutput extends Partial<Tool> {}
export interface NicheGeneratorOutput extends Partial<NichePage> {
  faqs?: Array<{ question: string; answer: string }>;
}

// ── Tool page pipeline ─────────────────────────────────────────────────

export async function runToolPipeline(opts: {
  tool: Pick<Tool, 'name' | 'slug' | 'category_id' | 'description'>;
  category?: Category;
  keywords: string[];
  generator: Generator<ToolGeneratorOutput>;
  context: PipelineContext;
}): Promise<PipelineOutcome<ToolGeneratorOutput>> {
  const stages: PipelineStageResult<unknown>[] = [];
  const maxRetries = opts.context.maxRetries ?? 2;
  let retries = 0;
  let lastValidation: ValidationResult | undefined;

  // Build link plan once — reused across retries
  const linkPlan = opts.context.linkCandidates
    ? buildLinkPlan({
        currentSlug: opts.tool.slug,
        currentType: 'tool',
        currentCategoryId: opts.tool.category_id,
        candidates: opts.context.linkCandidates,
      })
    : null;

  // CTR variants — generate up-front so they're available across retries
  const titleVariants = generateVariants('tool', { tool: opts.tool.name }, { keywords: opts.keywords });

  while (retries <= maxRetries) {
    // ── Stage 1: Generate ─────────────────────────────────────────
    const genStart = Date.now();
    let generated: ToolGeneratorOutput;
    try {
      generated = await opts.generator(
        {
          keywords: opts.keywords,
          subject: opts.tool.name,
          pageData: { tool: opts.tool, category: opts.category },
          extraInstructions: buildToolInstructions(linkPlan, retries, lastValidation),
        },
        retries,
      );
      stages.push({ stage: 'generate', ok: true, durationMs: Date.now() - genStart });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Generator failed', msg);
      stages.push({
        stage: 'generate',
        ok: false,
        durationMs: Date.now() - genStart,
        errors: [msg],
      });
      return { success: false, stages, retries };
    }

    // ── Stage 2: Enhance (CTR titles + link audit) ────────────────
    const enhStart = Date.now();
    const bestVariant = titleVariants[0];
    if (bestVariant && !generated.alternatives_seo_title) {
      generated.alternatives_seo_title = bestVariant.title;
    }
    if (bestVariant && !generated.alternatives_seo_meta) {
      generated.alternatives_seo_meta = bestVariant.meta;
    }
    const linkAudit = generated.full_description
      ? countInternalLinks(generated.full_description)
      : { count: 0, withinRange: false, urls: [] };
    stages.push({
      stage: 'enhance',
      ok: true,
      durationMs: Date.now() - enhStart,
      data: { titleScore: bestVariant?.score, linkCount: linkAudit.count },
    });

    // ── Stage 3: Validate ─────────────────────────────────────────
    const valStart = Date.now();
    const merged: Partial<Tool> = { ...opts.tool, ...generated };
    const validation = validateToolPage(merged);
    lastValidation = validation;
    stages.push({
      stage: 'validate',
      ok: validation.passed,
      durationMs: Date.now() - valStart,
      data: { score: validation.score, wordCount: validation.wordCount, issueCount: validation.issues.length },
    });

    if (validation.passed) {
      log.info(`Pipeline succeeded for ${opts.tool.slug}`, {
        score: validation.score,
        retries,
      });
      return { success: true, finalData: generated, validation, stages, retries };
    }

    log.warn(`Validation failed for ${opts.tool.slug} (attempt ${retries + 1}/${maxRetries + 1})`, {
      score: validation.score,
      errors: validation.issues.filter((i) => i.severity === 'error').map((i) => i.message),
    });
    retries++;
  }

  return { success: false, validation: lastValidation, stages, retries: retries - 1 };
}

// ── Niche page pipeline ────────────────────────────────────────────────

export async function runNichePipeline(opts: {
  niche: { name: string; slug: string };
  keywords: string[];
  generator: Generator<NicheGeneratorOutput>;
  context: PipelineContext;
}): Promise<PipelineOutcome<NicheGeneratorOutput>> {
  const stages: PipelineStageResult<unknown>[] = [];
  const maxRetries = opts.context.maxRetries ?? 2;
  let retries = 0;
  let lastValidation: ValidationResult | undefined;

  const linkPlan = opts.context.linkCandidates
    ? buildLinkPlan({
        currentSlug: opts.niche.slug,
        currentType: 'niche',
        candidates: opts.context.linkCandidates,
      })
    : null;

  const titleVariants = generateVariants(
    'niche',
    { niche: opts.niche.name },
    { keywords: opts.keywords },
  );

  while (retries <= maxRetries) {
    // Generate
    const genStart = Date.now();
    let generated: NicheGeneratorOutput;
    try {
      generated = await opts.generator(
        {
          keywords: opts.keywords,
          subject: opts.niche.name,
          pageData: { niche: opts.niche },
          extraInstructions: buildNicheInstructions(linkPlan, retries, lastValidation),
        },
        retries,
      );
      stages.push({ stage: 'generate', ok: true, durationMs: Date.now() - genStart });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Niche generator failed', msg);
      return {
        success: false,
        stages: [...stages, { stage: 'generate', ok: false, durationMs: Date.now() - genStart, errors: [msg] }],
        retries,
      };
    }

    // Enhance
    const enhStart = Date.now();
    const best = titleVariants[0];
    if (best && !generated.seo_title) generated.seo_title = best.title;
    if (best && !generated.seo_meta_description) generated.seo_meta_description = best.meta;
    const linkAudit = generated.seo_content_html
      ? countInternalLinks(generated.seo_content_html)
      : { count: 0, withinRange: false, urls: [] };
    stages.push({
      stage: 'enhance',
      ok: true,
      durationMs: Date.now() - enhStart,
      data: { titleScore: best?.score, linkCount: linkAudit.count },
    });

    // Validate
    const valStart = Date.now();
    const validation = validateNichePage(generated);
    lastValidation = validation;
    stages.push({
      stage: 'validate',
      ok: validation.passed,
      durationMs: Date.now() - valStart,
      data: { score: validation.score, wordCount: validation.wordCount },
    });

    if (validation.passed) {
      log.info(`Niche pipeline succeeded for ${opts.niche.slug}`, { score: validation.score });
      return { success: true, finalData: generated, validation, stages, retries };
    }

    log.warn(`Niche validation failed for ${opts.niche.slug}`, {
      score: validation.score,
      errors: validation.issues.filter((i) => i.severity === 'error').map((i) => i.message),
    });
    retries++;
  }

  return { success: false, validation: lastValidation, stages, retries: retries - 1 };
}

// ── Prompt builders ────────────────────────────────────────────────────

function buildToolInstructions(
  linkPlan: ReturnType<typeof buildLinkPlan> | null,
  attempt: number,
  prevValidation?: ValidationResult,
): string {
  const sections = [
    `Write a comprehensive, expert-level review with these REQUIRED sections (each H2):`,
    `  1. Introduction (2-3 paragraphs, hook with pain point)`,
    `  2. Key Features (5+ items with explanations)`,
    `  3. Pricing (every plan, real numbers)`,
    `  4. Pros and Cons (3+ pros, 2+ cons each)`,
    `  5. Use Cases (concrete scenarios)`,
    `  6. Alternatives (mention 2-3 competitors with link to /tools/SLUG/alternatives)`,
    `  7. FAQ (5+ questions answered)`,
    `  8. Verdict / CTA`,
    `Minimum word count: 2000.`,
  ];

  if (linkPlan) {
    sections.push('', planAsLLMInstruction(linkPlan));
  }

  if (attempt > 0 && prevValidation) {
    const failed = prevValidation.issues.filter((i) => i.severity === 'error').map((i) => i.message);
    if (failed.length > 0) {
      sections.push(
        '',
        `RETRY NOTE — previous attempt failed validation with these errors:`,
        ...failed.map((f) => `  - ${f}`),
        `Fix these specifically this time. Be more thorough.`,
      );
    }
  }

  return sections.join('\n');
}

function buildNicheInstructions(
  linkPlan: ReturnType<typeof buildLinkPlan> | null,
  attempt: number,
  prevValidation?: ValidationResult,
): string {
  const sections = [
    `Write a category-leading guide with these REQUIRED sections (H2s):`,
    `  1. Problem-focused intro (who is searching this query, why)`,
    `  2. Top picks (5-10 tools with mini-reviews)`,
    `  3. Comparison table (HTML <table> — features, pricing, best for)`,
    `  4. How we tested / Selection criteria (E-E-A-T signal)`,
    `  5. Detailed reviews (2-3 paragraphs per top pick)`,
    `  6. FAQ (6+ questions)`,
    `  7. Verdict / final recommendations`,
    `Minimum word count: 3000.`,
  ];

  if (linkPlan) {
    sections.push('', planAsLLMInstruction(linkPlan));
  }

  if (attempt > 0 && prevValidation) {
    const failed = prevValidation.issues.filter((i) => i.severity === 'error').map((i) => i.message);
    if (failed.length > 0) {
      sections.push(
        '',
        `RETRY — fix these errors from previous attempt:`,
        ...failed.map((f) => `  - ${f}`),
      );
    }
  }

  return sections.join('\n');
}
