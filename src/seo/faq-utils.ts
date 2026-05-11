/**
 * Parse FAQ HTML into structured Q/A pairs for FAQPage schema injection.
 *
 * Our AI-generated FAQ content typically uses one of:
 *   1. <h3>Question?</h3><p>Answer.</p> pairs
 *   2. <details><summary>Question?</summary>Answer.</details>
 *   3. <dt>Question?</dt><dd>Answer.</dd>
 *
 * Returns [] if nothing parseable is found — safe to feed directly into
 * `faqSchema()` which short-circuits on empty input.
 *
 * Runs in both browser (DOMParser) and Node (regex fallback). The regex
 * fallback is good enough for sitemap-time schema embedding.
 */
import type { FAQItem } from './schema';

export function extractFAQs(html: string | undefined | null): FAQItem[] {
  if (!html) return [];

  // Browser path — use DOMParser for proper HTML handling
  if (typeof DOMParser !== 'undefined') {
    return parseWithDOM(html);
  }

  // Node fallback — regex is brittle but FAQ markup is predictable
  return parseWithRegex(html);
}

function parseWithDOM(html: string): FAQItem[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return [];
  const items: FAQItem[] = [];

  // Pattern 1: <details><summary>Q</summary>A</details>
  root.querySelectorAll('details').forEach((d) => {
    const summary = d.querySelector('summary');
    if (!summary) return;
    const question = summary.textContent?.trim();
    summary.remove();
    const answer = d.textContent?.trim();
    if (question && answer) items.push({ question, answer });
  });

  // Pattern 2: <h3>Q</h3><p>A</p> — walk siblings
  root.querySelectorAll('h2, h3, h4').forEach((heading) => {
    const text = heading.textContent?.trim();
    if (!text || !text.includes('?')) return;
    let answer = '';
    let next = heading.nextElementSibling;
    while (next && !/^h[2-4]$/i.test(next.tagName)) {
      answer += ` ${next.textContent ?? ''}`;
      next = next.nextElementSibling;
    }
    answer = answer.trim();
    if (answer) items.push({ question: text, answer });
  });

  // Pattern 3: <dt>Q</dt><dd>A</dd>
  root.querySelectorAll('dt').forEach((dt) => {
    const dd = dt.nextElementSibling;
    if (!dd || dd.tagName.toLowerCase() !== 'dd') return;
    const question = dt.textContent?.trim();
    const answer = dd.textContent?.trim();
    if (question && answer) items.push({ question, answer });
  });

  return dedupe(items);
}

function parseWithRegex(html: string): FAQItem[] {
  const items: FAQItem[] = [];

  // <h2-4>Q</h2-4><p>A</p>
  const headingPattern = /<h([2-4])[^>]*>([^<]*\?)<\/h\1>\s*<(?:p|div)[^>]*>([\s\S]*?)<\/(?:p|div)>/gi;
  let match: RegExpExecArray | null;
  while ((match = headingPattern.exec(html)) !== null) {
    items.push({
      question: stripTags(match[2]).trim(),
      answer: stripTags(match[3]).trim(),
    });
  }

  // <details><summary>Q</summary>A</details>
  const detailsPattern = /<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi;
  while ((match = detailsPattern.exec(html)) !== null) {
    items.push({
      question: stripTags(match[1]).trim(),
      answer: stripTags(match[2]).trim(),
    });
  }

  return dedupe(items);
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
}

function dedupe(items: FAQItem[]): FAQItem[] {
  const seen = new Set<string>();
  return items.filter((f) => {
    const key = f.question.toLowerCase().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return f.question.length > 5 && f.answer.length > 10;
  });
}
