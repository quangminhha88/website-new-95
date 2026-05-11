import { describe, it, expect } from 'vitest';
import {
  validateToolPage,
  validateNichePage,
  validateComparison,
} from '../content-validator';
import type { Tool, NichePage } from '@/types/tool';

const longText = (words: number): string =>
  Array.from({ length: words }, (_, i) => `word${i}`).join(' ');

const longHtml = (words: number, sectionsHtml = ''): string =>
  `<div>${longText(words)}</div>${sectionsHtml}`;

describe('content-validator', () => {
  describe('validateToolPage', () => {
    function buildTool(overrides: Partial<Tool> = {}): Partial<Tool> {
      return {
        name: 'Test Tool',
        slug: 'test-tool',
        description: longText(100),
        full_description: longText(2100),
        features: ['F1', 'F2', 'F3', 'F4', 'F5'],
        pros: ['Pro 1', 'Pro 2', 'Pro 3'],
        cons: ['Con 1', 'Con 2'],
        pricing_data: { starting_price: '10', currency: 'USD' },
        faqs_html: `<div>${longText(150)}</div>`,
        cta_html: '<div>CTA</div>',
        expert_verdict: 'Solid product.',
        ...overrides,
      };
    }

    it('passes a fully populated tool', () => {
      const result = validateToolPage(buildTool());
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThan(70);
      expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    });

    it('fails on word count below 2000', () => {
      const result = validateToolPage(buildTool({ full_description: longText(100) }));
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.field === 'content')).toBe(true);
    });

    it('fails when fewer than 4 features', () => {
      const result = validateToolPage(buildTool({ features: ['F1', 'F2'] }));
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.field === 'features')).toBe(true);
    });

    it('fails when missing pros / cons / pricing / FAQ', () => {
      const result = validateToolPage(
        buildTool({ pros: [], cons: [], pricing_data: undefined, faqs_html: '' }),
      );
      expect(result.passed).toBe(false);
      const errFields = result.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.field);
      expect(errFields).toContain('pros');
      expect(errFields).toContain('cons');
      expect(errFields).toContain('pricing');
      expect(errFields).toContain('faqs');
    });

    it('emits warning for missing CTA but does not fail validation', () => {
      const tool = buildTool({ cta_html: undefined, conversion_hook: undefined });
      const result = validateToolPage(tool);
      const warnings = result.issues.filter((i) => i.severity === 'warning');
      expect(warnings.some((w) => w.field === 'cta')).toBe(true);
    });

    it('returns a 0–100 score', () => {
      const result = validateToolPage(buildTool());
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('validateNichePage', () => {
    function buildNiche(overrides: Partial<NichePage> = {}): Partial<NichePage> {
      const sections =
        '<h2>FAQ</h2><h2>Comparison Table</h2><table></table><a href="/tools/x">link</a>';
      return {
        slug: 'best-crm',
        niche_name: 'Best CRM',
        seo_title: 'Best CRM Software in 2026 (Tested)',
        seo_meta_description: longText(20).slice(0, 150),
        seo_content_html: longHtml(3100, sections),
        ...overrides,
      };
    }

    it('passes a healthy niche page', () => {
      const result = validateNichePage(buildNiche());
      expect(result.passed).toBe(true);
    });

    it('fails when content < 3000 words', () => {
      const result = validateNichePage(buildNiche({ seo_content_html: longHtml(500) }));
      expect(result.passed).toBe(false);
    });

    it('warns on title >65 chars', () => {
      const longTitle = 'A'.repeat(80);
      const result = validateNichePage(buildNiche({ seo_title: longTitle }));
      expect(result.issues.some((i) => i.severity === 'warning' && i.field === 'seo_title')).toBe(
        true,
      );
    });

    it('errors when no FAQ section is present', () => {
      const result = validateNichePage(
        buildNiche({ seo_content_html: longHtml(3100, '<a href="/x">link</a>') }),
      );
      expect(result.issues.some((i) => i.field === 'sections' && i.severity === 'error')).toBe(
        true,
      );
    });

    it('errors when no internal links exist', () => {
      const result = validateNichePage(
        buildNiche({ seo_content_html: longHtml(3100, '<h2>FAQ</h2>') }),
      );
      expect(result.issues.some((i) => i.field === 'links')).toBe(true);
    });
  });

  describe('validateComparison', () => {
    it('passes a healthy comparison', () => {
      const result = validateComparison({
        toolA: { name: 'A', slug: 'a' },
        toolB: { name: 'B', slug: 'b' },
        contentHtml: `${longHtml(1600, '<table></table><h2>Verdict</h2>')}`,
      });
      expect(result.passed).toBe(true);
    });

    it('fails when both tools are not provided', () => {
      const result = validateComparison({
        toolA: { name: 'A' },
        toolB: {},
        contentHtml: longHtml(1600),
      });
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.field === 'tools')).toBe(true);
    });

    it('warns when verdict section missing', () => {
      const result = validateComparison({
        toolA: { name: 'A' },
        toolB: { name: 'B' },
        contentHtml: longHtml(1600, '<table></table>'),
      });
      expect(result.issues.some((i) => i.field === 'verdict')).toBe(true);
    });
  });
});
