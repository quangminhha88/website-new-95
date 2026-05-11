/**
 * ContentQualityService — deterministic quality scoring for AI-generated
 * content. No LLM calls, no I/O — pure analysis. Safe to run sync inside
 * a generation pipeline before deciding to publish vs. send to review.
 *
 * Score breakdown
 * ═══════════════
 *   readabilityScore  20%   Flesch Reading Ease mapped to 0-100
 *   seoScore          30%   keyword placement, headings, length, structure
 *   eeatScore         25%   experience/expertise signals: numbers, comparisons,
 *                           limitations, dated references, real use cases
 *   structureScore    25%   heading hierarchy, paragraph variety, lists
 *
 * Score → status
 * ══════════════
 *   85+  excellent     → publish
 *   70+  good          → publish
 *   50+  fair          → human review
 *   < 50 poor          → block; regenerate
 *
 * Integrates with the moderation flow: a score < 75 should trigger
 * moderation_status = 'pending_review' (matches the Phase 1 threshold).
 */

export type ContentType = 'tool' | 'niche' | 'comparison' | 'faq';

export interface QualityMetadata {
  primaryKeyword?: string;
  toolName?: string;
  competitors?: string[];
  expectedSections?: string[];
}

export interface QualityResult {
  score: number;
  status: 'excellent' | 'good' | 'fair' | 'poor';
  issues: string[];
  suggestions: string[];
  metrics: {
    wordCount: number;
    readabilityScore: number;
    seoScore: number;
    eeatScore: number;
    structureScore: number;
  };
}

const WEIGHTS = {
  readability: 0.2,
  seo: 0.3,
  eeat: 0.25,
  structure: 0.25,
} as const;

interface WordRange {
  min: number;
  ideal: number;
  max: number;
}

const WORD_RANGES: Record<ContentType, WordRange> = {
  tool: { min: 600, ideal: 1000, max: 1500 },
  niche: { min: 1200, ideal: 2000, max: 3500 },
  comparison: { min: 500, ideal: 800, max: 1500 },
  faq: { min: 150, ideal: 400, max: 1000 },
};

const HYPE_WORDS = [
  'revolutionary',
  'game-changer',
  'game-changing',
  'cutting-edge',
  'world-class',
  "today's fast-paced",
  'in conclusion',
  'unleash',
  'unparalleled',
  'next-generation',
];

const EXPERIENCE_PHRASES = [
  /\bwe tested\b/i,
  /\bin our review\b/i,
  /\bin our tests?\b/i,
  /\bafter using\b/i,
  /\b(we|i)['' ]?ve (used|tried|tested)\b/i,
  /\bin practice\b/i,
  /\bin our experience\b/i,
];

const LIMITATION_MARKERS = [
  /\bdownsides?\b/i,
  /\blimitations?\b/i,
  /\bdrawbacks?\b/i,
  /\bcons\b/i,
  /\bbut\b.*\b(slow|expensive|missing|lacks?|cannot|can't)\b/i,
  /\bnot ideal for\b/i,
];

// ════════════════════════════════════════════════════════════════════════
// Public API
// ════════════════════════════════════════════════════════════════════════

export async function evaluateContentQuality(
  content: string,
  type: ContentType,
  metadata: QualityMetadata = {},
): Promise<QualityResult> {
  const issues: string[] = [];
  const suggestions: string[] = [];

  const text = stripHtml(content);
  const words = tokenize(text);
  const wordCount = words.length;

  const readabilityScore = scoreReadability(text, words, issues, suggestions);
  const seoScore = scoreSeo(content, text, words, type, metadata, issues, suggestions);
  const eeatScore = scoreEEat(text, type, metadata, issues, suggestions);
  const structureScore = scoreStructure(content, type, issues, suggestions);

  const score = Math.round(
    readabilityScore * WEIGHTS.readability +
      seoScore * WEIGHTS.seo +
      eeatScore * WEIGHTS.eeat +
      structureScore * WEIGHTS.structure,
  );

  return {
    score,
    status:
      score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'poor',
    issues,
    suggestions,
    metrics: {
      wordCount,
      readabilityScore: Math.round(readabilityScore),
      seoScore: Math.round(seoScore),
      eeatScore: Math.round(eeatScore),
      structureScore: Math.round(structureScore),
    },
  };
}

// ════════════════════════════════════════════════════════════════════════
// Scorers
// ════════════════════════════════════════════════════════════════════════

function scoreReadability(
  text: string,
  words: string[],
  issues: string[],
  suggestions: string[],
): number {
  if (words.length < 30) return 50;

  const sentences = splitSentences(text);
  if (sentences.length === 0) return 30;

  const wordsPerSentence = words.length / sentences.length;
  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const syllablesPerWord = totalSyllables / words.length;

  // Flesch Reading Ease
  const flesch = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;

  // Map Flesch to 0-100 SaaS-content score:
  //   50-70  = ideal (100)
  //   30-50 or 70-85 = 80
  //   <30 or >95     = 40
  let mapped: number;
  if (flesch >= 50 && flesch <= 70) mapped = 100;
  else if (flesch >= 40 && flesch <= 80) mapped = 85;
  else if (flesch >= 30 && flesch <= 90) mapped = 70;
  else if (flesch >= 20 && flesch <= 95) mapped = 55;
  else mapped = 35;

  if (wordsPerSentence > 28) {
    issues.push(`Average sentence length is ${wordsPerSentence.toFixed(1)} words (>28 — too long)`);
    suggestions.push('Break long sentences into shorter ones; aim for 14-22 words per sentence');
    mapped -= 15;
  }
  if (wordsPerSentence < 8) {
    issues.push(`Average sentence length is ${wordsPerSentence.toFixed(1)} words (<8 — choppy)`);
    suggestions.push('Combine some sentences for better flow');
    mapped -= 10;
  }
  if (syllablesPerWord > 1.9) {
    issues.push('High average syllable count — vocabulary is too dense');
    suggestions.push('Substitute simpler words where possible (e.g. "use" instead of "utilize")');
    mapped -= 10;
  }

  return clamp(mapped, 0, 100);
}

function scoreSeo(
  content: string,
  text: string,
  words: string[],
  type: ContentType,
  metadata: QualityMetadata,
  issues: string[],
  suggestions: string[],
): number {
  let score = 100;
  const range = WORD_RANGES[type];
  const wc = words.length;

  // Word count
  if (wc < range.min) {
    const deficit = ((range.min - wc) / range.min) * 100;
    issues.push(
      `Word count ${wc} is below the ${range.min}-word minimum for ${type} content`,
    );
    suggestions.push(`Expand to at least ${range.ideal} words; cover use cases + comparisons`);
    score -= Math.min(deficit, 40);
  } else if (wc > range.max) {
    issues.push(`Word count ${wc} is above the ${range.max}-word target — verbose`);
    suggestions.push('Tighten phrasing; readers skim long-form');
    score -= 10;
  }

  // Keyword placement
  const keyword = metadata.primaryKeyword ?? metadata.toolName;
  if (keyword) {
    const lc = text.toLowerCase();
    const kwLc = keyword.toLowerCase();
    const occurrences = lc.split(kwLc).length - 1;
    const first100 = words.slice(0, 100).join(' ').toLowerCase();

    if (occurrences === 0) {
      issues.push(`Primary keyword "${keyword}" never appears`);
      suggestions.push(`Mention "${keyword}" naturally in the first paragraph and one H2`);
      score -= 30;
    } else if (!first100.includes(kwLc)) {
      issues.push(`Primary keyword "${keyword}" missing from the first 100 words`);
      suggestions.push('Lead with the keyword in the opening paragraph');
      score -= 12;
    }
    const density = occurrences / Math.max(wc, 1);
    if (density > 0.025) {
      issues.push(`Keyword density ${(density * 100).toFixed(1)}% — risks looking stuffed`);
      suggestions.push('Replace some occurrences with synonyms or pronouns');
      score -= 10;
    }
  }

  // Heading structure
  const h2s = countMatches(content, /<h2\b/gi);
  const h3s = countMatches(content, /<h3\b/gi);
  if (type !== 'faq' && h2s < 2) {
    issues.push(`Only ${h2s} <h2> headings — content needs scannable structure`);
    suggestions.push('Add 3-5 H2 sections covering distinct sub-topics');
    score -= 15;
  }
  if (h3s > 0 && h2s === 0) {
    issues.push('H3 used without any H2 — invalid heading hierarchy');
    suggestions.push('Promote at least one H3 to H2 to establish the section structure');
    score -= 8;
  }

  // Lists / tables — variety
  const hasLists = /<(ul|ol|table)\b/i.test(content);
  if (type !== 'faq' && !hasLists) {
    issues.push('No lists or tables — content is wall-of-text');
    suggestions.push('Convert features, pros/cons, or comparisons into a list or table');
    score -= 10;
  }

  // Hype word penalty
  const lc = text.toLowerCase();
  const hypeFound = HYPE_WORDS.filter((w) => lc.includes(w));
  if (hypeFound.length > 0) {
    issues.push(`Contains hype words: ${hypeFound.slice(0, 3).join(', ')}`);
    suggestions.push('Replace generic AI tells with specific behaviour or outcomes');
    score -= Math.min(hypeFound.length * 6, 30);
  }

  return clamp(score, 0, 100);
}

function scoreEEat(
  text: string,
  type: ContentType,
  metadata: QualityMetadata,
  issues: string[],
  suggestions: string[],
): number {
  let score = 60; // baseline

  // Specific numbers (prices, percentages, counts) — strong E-E-A-T signal
  const numericMentions = countMatches(text, /\$\s?\d|\b\d+(\.\d+)?\s?(%|users?|customers?|seats?|GB|MB)\b/gi);
  if (numericMentions >= 3) score += 15;
  else if (numericMentions >= 1) score += 8;
  else {
    issues.push('No specific numbers, prices, or measurable claims');
    suggestions.push('Add concrete data: pricing tiers, user counts, performance metrics');
  }

  // First-hand experience markers
  const hasExperience = EXPERIENCE_PHRASES.some((re) => re.test(text));
  if (hasExperience) score += 10;
  else if (type === 'tool' || type === 'comparison') {
    issues.push('No first-hand testing language ("we tested", "in our review", etc)');
    suggestions.push('Add reviewer voice: "In our testing…", "After using X for Y…"');
  }

  // Limitations / honesty signal
  const hasLimits = LIMITATION_MARKERS.some((re) => re.test(text));
  if (hasLimits) score += 10;
  else if (type !== 'faq') {
    issues.push('No mention of limitations, downsides, or trade-offs — sounds promotional');
    suggestions.push('Add a "Limitations" or "Cons" section — honesty builds trust');
    score -= 5;
  }

  // Comparison signal
  const compThreshold = (metadata.competitors ?? []).length > 0;
  const hasComparison =
    /\b(compared to|vs\.?|alternative to|unlike|whereas)\b/i.test(text) ||
    compThreshold;
  if (hasComparison) score += 8;
  else if (type === 'comparison' || type === 'tool') {
    issues.push('No comparisons to alternatives — readers want context');
    suggestions.push('Reference 1-2 alternative tools and explain the differentiator');
  }

  // Recency markers
  const yearMatch = text.match(/\b20\d{2}\b/);
  const currentYear = new Date().getFullYear();
  if (yearMatch) {
    const year = parseInt(yearMatch[0], 10);
    if (year >= currentYear - 1) score += 5;
    else {
      issues.push(`References a stale year (${yearMatch[0]})`);
      suggestions.push(`Update to ${currentYear}-relevant context`);
      score -= 5;
    }
  }

  return clamp(score, 0, 100);
}

function scoreStructure(
  content: string,
  type: ContentType,
  issues: string[],
  suggestions: string[],
): number {
  let score = 100;

  // Paragraph parsing
  const paragraphs = parseParagraphs(content);
  if (paragraphs.length === 0) {
    issues.push('No paragraph structure detected');
    suggestions.push('Wrap prose in <p> tags');
    return 30;
  }

  const lengths = paragraphs.map((p) => p.split(/\s+/).filter(Boolean).length);
  const avg = lengths.reduce((s, n) => s + n, 0) / lengths.length;
  const tooLong = lengths.filter((l) => l > 200).length;
  const tooShort = lengths.filter((l) => l < 8).length;

  if (tooLong > 0) {
    issues.push(`${tooLong} paragraph(s) exceed 200 words — wall of text`);
    suggestions.push('Split long paragraphs around natural pivot points');
    score -= Math.min(tooLong * 8, 25);
  }
  if (tooShort > paragraphs.length * 0.3) {
    issues.push('Many paragraphs are too short — fragmented flow');
    suggestions.push('Combine 1-sentence paragraphs into fuller ones');
    score -= 10;
  }
  if (avg > 0 && lengths.every((l) => Math.abs(l - avg) < 5)) {
    issues.push('All paragraphs are roughly the same length — robotic rhythm');
    suggestions.push('Vary paragraph length: some short for emphasis, longer for explanation');
    score -= 8;
  }

  // Emphasis usage
  const hasEmphasis = /<(strong|b|em|i)\b/i.test(content);
  if (!hasEmphasis && type !== 'faq') {
    issues.push('No bold/italic emphasis — nothing for skimmers to catch');
    suggestions.push('Bold key phrases or product names where natural');
    score -= 8;
  }

  // Heading hierarchy: no H3 before any H2
  const firstH2 = content.search(/<h2\b/i);
  const firstH3 = content.search(/<h3\b/i);
  if (firstH3 !== -1 && (firstH2 === -1 || firstH3 < firstH2)) {
    issues.push('H3 appears before any H2 — invalid hierarchy');
    suggestions.push('Promote the first H3 to H2');
    score -= 10;
  }

  // Expected sections (when caller specifies them)
  if (metadataHasSections(type) && Array.isArray(arguments[3])) {
    /* unreachable — kept for future caller wiring */
  }

  return clamp(score, 0, 100);
}

// ════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════

function metadataHasSections(_t: ContentType): boolean {
  return false;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  // Strip silent endings, count vowel groups
  const cleaned = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');
  const matches = cleaned.match(/[aeiouy]{1,2}/g);
  return Math.max(matches?.length ?? 1, 1);
}

function countMatches(s: string, re: RegExp): number {
  return (s.match(re) ?? []).length;
}

function parseParagraphs(content: string): string[] {
  // Try HTML <p> first
  const pMatches = content.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi);
  if (pMatches && pMatches.length > 0) {
    return pMatches.map((p) => stripHtml(p)).filter((s) => s.length > 0);
  }
  // Fall back to blank-line split
  return content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
