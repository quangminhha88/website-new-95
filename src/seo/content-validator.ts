/**
 * Content quality validator.
 *
 * Programmatic SEO at scale needs hard rules — anything below threshold
 * gets rejected before it pollutes the index. Returns a verdict with
 * structured issues so the generator can either retry, escalate to a
 * higher-tier model, or skip entirely.
 *
 * Quality bar (calibrated against ranking pages in the SaaS niche):
 *   - Tool page: 2000+ words, must have features/pros/cons/pricing/CTA/FAQ
 *   - Niche page: 3000+ words, must have intro/list/comparison/FAQ/CTA
 *   - Comparison: 1500+ words, must have feature table + verdict
 */
import type { Tool, NichePage } from '@/types/tool';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  field: string;
  message: string;
}

export interface ValidationResult {
  passed: boolean;
  score: number; // 0–100
  wordCount: number;
  issues: ValidationIssue[];
}

const WORD_COUNT_RULES = {
  tool: { min: 2000, target: 2500 },
  niche: { min: 3000, target: 4000 },
  comparison: { min: 1500, target: 2000 },
  category: { min: 800, target: 1200 },
} as const;

// ── Public validators ───────────────────────────────────────────────────

export function validateToolPage(tool: Partial<Tool>): ValidationResult {
  const issues: ValidationIssue[] = [];
  const fullText = combineToolText(tool);
  const wordCount = countWords(fullText);

  if (wordCount < WORD_COUNT_RULES.tool.min) {
    issues.push({
      severity: 'error',
      field: 'content',
      message: `Word count ${wordCount} below minimum ${WORD_COUNT_RULES.tool.min}`,
    });
  }

  if (!tool.features || tool.features.length < 4) {
    issues.push({ severity: 'error', field: 'features', message: 'Need at least 4 features' });
  }
  if (!tool.pros || tool.pros.length < 3) {
    issues.push({ severity: 'error', field: 'pros', message: 'Need at least 3 pros' });
  }
  if (!tool.cons || tool.cons.length < 2) {
    issues.push({ severity: 'error', field: 'cons', message: 'Need at least 2 cons' });
  }
  if (!tool.pricing_data?.starting_price && !tool.pricing_summary) {
    issues.push({ severity: 'error', field: 'pricing', message: 'Pricing info missing' });
  }
  if (!tool.faqs_html || countWords(stripHtml(tool.faqs_html)) < 100) {
    issues.push({ severity: 'error', field: 'faqs', message: 'FAQ section missing or too thin' });
  }
  if (!tool.cta_html && !tool.conversion_hook) {
    issues.push({ severity: 'warning', field: 'cta', message: 'No CTA block configured' });
  }
  if (!tool.expert_verdict) {
    issues.push({ severity: 'warning', field: 'verdict', message: 'No expert verdict set' });
  }

  return finalize(wordCount, issues, WORD_COUNT_RULES.tool.target);
}

export function validateNichePage(page: Partial<NichePage>): ValidationResult {
  const issues: ValidationIssue[] = [];
  const text = stripHtml(page.seo_content_html ?? '');
  const wordCount = countWords(text);

  if (wordCount < WORD_COUNT_RULES.niche.min) {
    issues.push({
      severity: 'error',
      field: 'content',
      message: `Word count ${wordCount} below minimum ${WORD_COUNT_RULES.niche.min}`,
    });
  }

  if (!page.seo_title || page.seo_title.length < 30) {
    issues.push({ severity: 'error', field: 'seo_title', message: 'Title too short (need 30+ chars)' });
  } else if (page.seo_title.length > 65) {
    issues.push({ severity: 'warning', field: 'seo_title', message: 'Title >65 chars — may truncate in SERP' });
  }

  if (!page.seo_meta_description || page.seo_meta_description.length < 120) {
    issues.push({ severity: 'error', field: 'seo_meta_description', message: 'Meta description too short' });
  } else if (page.seo_meta_description.length > 160) {
    issues.push({ severity: 'warning', field: 'seo_meta_description', message: 'Meta >160 chars' });
  }

  // Required sections in body
  const html = page.seo_content_html ?? '';
  if (!hasSection(html, /faq|frequently/i)) {
    issues.push({ severity: 'error', field: 'sections', message: 'No FAQ section' });
  }
  if (!hasSection(html, /comparison|table|compare/i)) {
    issues.push({ severity: 'warning', field: 'sections', message: 'No comparison table detected' });
  }
  if (!html.includes('<a ') && !html.includes('href=')) {
    issues.push({ severity: 'error', field: 'links', message: 'No internal links found' });
  }

  return finalize(wordCount, issues, WORD_COUNT_RULES.niche.target);
}

export function validateComparison(opts: {
  toolA: Partial<Tool>;
  toolB: Partial<Tool>;
  contentHtml?: string;
  summary?: string;
}): ValidationResult {
  const issues: ValidationIssue[] = [];
  const text = stripHtml(opts.contentHtml ?? '') + ' ' + (opts.summary ?? '');
  const wordCount = countWords(text);

  if (wordCount < WORD_COUNT_RULES.comparison.min) {
    issues.push({
      severity: 'error',
      field: 'content',
      message: `Word count ${wordCount} below minimum ${WORD_COUNT_RULES.comparison.min}`,
    });
  }
  if (!opts.toolA.name || !opts.toolB.name) {
    issues.push({ severity: 'error', field: 'tools', message: 'Both tools required' });
  }
  if (!opts.contentHtml || !hasSection(opts.contentHtml, /verdict|winner|conclusion/i)) {
    issues.push({ severity: 'warning', field: 'verdict', message: 'No verdict section' });
  }
  if (!opts.contentHtml || !hasSection(opts.contentHtml, /<table|comparison/i)) {
    issues.push({ severity: 'warning', field: 'table', message: 'No comparison table' });
  }

  return finalize(wordCount, issues, WORD_COUNT_RULES.comparison.target);
}

// ── Internals ───────────────────────────────────────────────────────────

function combineToolText(tool: Partial<Tool>): string {
  return [
    tool.description,
    tool.full_description,
    tool.tagline,
    tool.expert_verdict,
    tool.conversion_hook,
    ...(tool.features ?? []),
    ...(tool.pros ?? []),
    ...(tool.cons ?? []),
    ...(tool.use_cases ?? []),
    stripHtml(tool.faqs_html ?? ''),
    stripHtml(tool.alternatives_seo_content ?? ''),
  ]
    .filter(Boolean)
    .join(' ');
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasSection(html: string, pattern: RegExp): boolean {
  return pattern.test(html);
}

function finalize(wordCount: number, issues: ValidationIssue[], target: number): ValidationResult {
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;

  // Score: start at 100, -20 per error, -5 per warning, -10 if word count <50% of target
  let score = 100 - errors * 20 - warnings * 5;
  if (wordCount < target * 0.5) score -= 10;
  score = Math.max(0, Math.min(100, score));

  return {
    passed: errors === 0 && wordCount > 0,
    score,
    wordCount,
    issues,
  };
}
