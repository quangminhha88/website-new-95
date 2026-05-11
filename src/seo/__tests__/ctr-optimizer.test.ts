import { describe, it, expect } from 'vitest';
import {
  generateVariants,
  selectVariantForVisitor,
  TITLE_TEMPLATES,
  META_TEMPLATES,
} from '../ctr-optimizer';

describe('ctr-optimizer', () => {
  describe('generateVariants', () => {
    it('returns variants for tool pages', () => {
      const variants = generateVariants('tool', { tool: 'Notion' });
      expect(variants.length).toBeGreaterThan(0);
      expect(variants[0].title).toContain('Notion');
      expect(variants[0].meta).toContain('Notion');
    });

    it('returns variants for niche pages', () => {
      const variants = generateVariants('niche', { niche: 'CRM Software' });
      expect(variants.length).toBeGreaterThan(0);
      expect(variants[0].title).toContain('CRM Software');
    });

    it('returns variants for comparison pages with both tools', () => {
      const variants = generateVariants('comparison', { toolA: 'Notion', toolB: 'Coda' });
      expect(variants.length).toBeGreaterThan(0);
      expect(variants[0].title).toContain('Notion');
      expect(variants[0].title).toContain('Coda');
    });

    it('skips templates whose required vars are missing', () => {
      const variants = generateVariants('comparison', { toolA: 'Notion' }); // missing toolB
      expect(variants).toHaveLength(0);
    });

    it('respects max option', () => {
      const variants = generateVariants('niche', { niche: 'CRM' }, { max: 2 });
      expect(variants.length).toBeLessThanOrEqual(2);
    });

    it('sorts by score descending', () => {
      const variants = generateVariants('tool', { tool: 'Notion' });
      for (let i = 1; i < variants.length; i++) {
        expect(variants[i - 1].score).toBeGreaterThanOrEqual(variants[i].score);
      }
    });

    it('boosts score when target keyword is in title', () => {
      const without = generateVariants('niche', { niche: 'CRM' }, { keywords: [] });
      const withKw = generateVariants('niche', { niche: 'CRM' }, { keywords: ['CRM'] });
      expect(withKw[0].score).toBeGreaterThan(without[0].score);
    });

    it('emits non-empty meta description with the subject', () => {
      const variants = generateVariants('tool', { tool: 'Notion' });
      expect(variants[0].meta.length).toBeGreaterThan(50);
      expect(variants[0].meta).toContain('Notion');
    });

    it('mentions the current year in titles', () => {
      const variants = generateVariants('niche', { niche: 'CRM' });
      const year = new Date().getFullYear();
      expect(variants[0].title).toContain(String(year));
    });
  });

  describe('selectVariantForVisitor', () => {
    const variants = [
      { title: 'A', meta: 'a', templateIndex: 0, score: 80, reasons: [] },
      { title: 'B', meta: 'b', templateIndex: 1, score: 70, reasons: [] },
      { title: 'C', meta: 'c', templateIndex: 2, score: 60, reasons: [] },
    ];

    it('returns the same variant for the same visitor + slug', () => {
      const a = selectVariantForVisitor(variants, 'visitor-1', 'notion');
      const b = selectVariantForVisitor(variants, 'visitor-1', 'notion');
      expect(a).toEqual(b);
    });

    it('returns different variants for different visitors (across many)', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 50; i++) {
        seen.add(selectVariantForVisitor(variants, `visitor-${i}`, 'notion').title);
      }
      // Statistically all 3 should appear in 50 distinct visitors
      expect(seen.size).toBeGreaterThanOrEqual(2);
    });

    it('throws on empty variant list', () => {
      expect(() => selectVariantForVisitor([], 'v1', 'slug')).toThrow();
    });

    it('returns the only variant when length=1', () => {
      const single = [variants[0]];
      expect(selectVariantForVisitor(single, 'v', 's')).toBe(single[0]);
    });
  });

  describe('templates', () => {
    it('has at least one template per page type', () => {
      for (const type of ['tool', 'niche', 'comparison', 'alternatives', 'category'] as const) {
        const matched = TITLE_TEMPLATES.filter((t) => t.appliesTo.includes(type));
        expect(matched.length, `no templates for ${type}`).toBeGreaterThan(0);
      }
    });

    it('exposes a meta template per page type', () => {
      for (const type of ['tool', 'niche', 'comparison', 'alternatives', 'category'] as const) {
        expect(typeof META_TEMPLATES[type]).toBe('function');
      }
    });
  });
});
