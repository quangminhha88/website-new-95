import { describe, it, expect } from 'vitest';
import {
  buildLinkPlan,
  countInternalLinks,
  planAsLLMInstruction,
} from '../internal-linking';

const fakeTools = [
  { id: 't1', slug: 'notion', name: 'Notion', tagline: 'Notes', category_id: 'productivity', commission_estimate: 50, avg_rating: 4.5 },
  { id: 't2', slug: 'coda', name: 'Coda', tagline: 'Docs', category_id: 'productivity', commission_estimate: 30, avg_rating: 4.3 },
  { id: 't3', slug: 'evernote', name: 'Evernote', tagline: 'Notes', category_id: 'productivity', commission_estimate: 20, avg_rating: 4.0 },
  { id: 't4', slug: 'asana', name: 'Asana', tagline: 'Pm', category_id: 'pm', commission_estimate: 40, avg_rating: 4.4 },
  { id: 't5', slug: 'monday', name: 'Monday', tagline: 'Pm', category_id: 'pm', commission_estimate: 60, avg_rating: 4.6 },
];

const fakeCategories = [
  { id: 'productivity', slug: 'productivity', name: 'Productivity' },
  { id: 'pm', slug: 'project-management', name: 'Project Management' },
];

const fakeNiches = [
  { slug: 'best-productivity-tools', niche_name: 'Best Productivity Tools' },
  { slug: 'best-pm-software', niche_name: 'Best Project Management Software' },
];

describe('internal-linking', () => {
  describe('buildLinkPlan', () => {
    it('returns required and optional buckets', () => {
      const plan = buildLinkPlan({
        currentSlug: 'notion',
        currentType: 'tool',
        currentCategoryId: 'productivity',
        candidates: { tools: fakeTools, categories: fakeCategories, niches: fakeNiches },
      });
      expect(plan.required.length).toBeGreaterThan(0);
      expect(plan.required.length).toBeLessThanOrEqual(7);
      expect(plan.total).toBeGreaterThanOrEqual(plan.required.length);
      expect(plan.total).toBeLessThanOrEqual(15);
    });

    it('includes the self-alternatives page for tool pages (top priority)', () => {
      const plan = buildLinkPlan({
        currentSlug: 'notion',
        currentType: 'tool',
        currentCategoryId: 'productivity',
        candidates: { tools: fakeTools, categories: fakeCategories, niches: fakeNiches },
      });
      const all = [...plan.required, ...plan.optional];
      const hasAlt = all.some((t) => t.url === '/tools/notion/alternatives');
      expect(hasAlt).toBe(true);
    });

    it('includes the category hub link', () => {
      const plan = buildLinkPlan({
        currentSlug: 'notion',
        currentType: 'tool',
        currentCategoryId: 'productivity',
        candidates: { tools: fakeTools, categories: fakeCategories, niches: fakeNiches },
      });
      const all = [...plan.required, ...plan.optional];
      expect(all.some((t) => t.url === '/category/productivity')).toBe(true);
    });

    it('does not link to the current slug', () => {
      const plan = buildLinkPlan({
        currentSlug: 'notion',
        currentType: 'tool',
        currentCategoryId: 'productivity',
        candidates: { tools: fakeTools, categories: fakeCategories },
      });
      const all = [...plan.required, ...plan.optional];
      expect(all.some((t) => t.url === '/tools/notion')).toBe(false);
    });

    it('sorts required links by priority descending', () => {
      const plan = buildLinkPlan({
        currentSlug: 'notion',
        currentType: 'tool',
        currentCategoryId: 'productivity',
        candidates: { tools: fakeTools, categories: fakeCategories, niches: fakeNiches },
      });
      for (let i = 1; i < plan.required.length; i++) {
        expect(plan.required[i - 1].priority).toBeGreaterThanOrEqual(plan.required[i].priority);
      }
    });

    it('skips anchors already mentioned in current text', () => {
      // currentText already mentions Coda, so it should be skipped
      const plan = buildLinkPlan({
        currentSlug: 'notion',
        currentType: 'tool',
        currentCategoryId: 'productivity',
        currentText: 'We have used Coda extensively in this project.',
        candidates: { tools: fakeTools, categories: fakeCategories },
      });
      const all = [...plan.required, ...plan.optional];
      expect(all.some((t) => t.url === '/tools/coda')).toBe(false);
    });

    it('always keeps category and alternatives even if anchor is used', () => {
      const plan = buildLinkPlan({
        currentSlug: 'notion',
        currentType: 'tool',
        currentCategoryId: 'productivity',
        currentText: 'Productivity tools alternatives Productivity tools',
        candidates: { tools: fakeTools, categories: fakeCategories },
      });
      const all = [...plan.required, ...plan.optional];
      expect(all.some((t) => t.type === 'alternatives')).toBe(true);
      expect(all.some((t) => t.type === 'category')).toBe(true);
    });

    it('returns empty when candidates are empty', () => {
      const plan = buildLinkPlan({
        currentSlug: 'notion',
        currentType: 'niche',
        candidates: { tools: [], categories: [] },
      });
      expect(plan.total).toBe(0);
    });
  });

  describe('countInternalLinks', () => {
    it('counts only internal links', () => {
      const html = '<a href="/tools/x">x</a> <a href="https://external.com/y">y</a> <a href="/about">a</a>';
      const result = countInternalLinks(html);
      expect(result.count).toBe(2);
      expect(result.urls).toContain('/tools/x');
      expect(result.urls).toContain('/about');
    });

    it('flags content under the 5-link minimum as out of range', () => {
      const html = '<a href="/a">a</a><a href="/b">b</a>';
      expect(countInternalLinks(html).withinRange).toBe(false);
    });

    it('flags content over the 15-link maximum as out of range', () => {
      const links = Array.from({ length: 20 }, (_, i) => `<a href="/x${i}">x</a>`).join('');
      expect(countInternalLinks(links).withinRange).toBe(false);
    });

    it('returns 0 for content with no links', () => {
      const result = countInternalLinks('<p>just text</p>');
      expect(result.count).toBe(0);
      expect(result.withinRange).toBe(false);
    });
  });

  describe('planAsLLMInstruction', () => {
    it('emits a non-empty instruction with anchor variants', () => {
      const plan = buildLinkPlan({
        currentSlug: 'notion',
        currentType: 'tool',
        currentCategoryId: 'productivity',
        candidates: { tools: fakeTools, categories: fakeCategories },
      });
      const instr = planAsLLMInstruction(plan);
      expect(instr).toContain('INTERNAL LINKING');
      expect(instr.length).toBeGreaterThan(100);
    });

    it('returns empty string for empty plan', () => {
      const empty = planAsLLMInstruction({ required: [], optional: [], total: 0 });
      expect(empty).toBe('');
    });
  });
});
