import { describe, it, expect } from 'vitest';
import {
  buildSitemapXml,
  buildSitemapIndex,
  defaultsForPath,
  type SitemapEntry,
} from '../sitemap';

describe('sitemap', () => {
  describe('buildSitemapXml', () => {
    it('builds a valid sitemap', () => {
      const entries: SitemapEntry[] = [
        { url: '/', priority: 1.0, changefreq: 'daily' },
        { url: '/tools/notion', priority: 0.85, changefreq: 'weekly', lastmod: '2026-01-15' },
      ];
      const xml = buildSitemapXml(entries);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap-0.9">');
      expect(xml).toContain('</urlset>');
      expect(xml).toContain('<loc>');
      expect(xml).toContain('<priority>1.0</priority>');
      expect(xml).toContain('<priority>0.8</priority>'); // 0.85 → toFixed(1) → "0.8"
      expect(xml).toContain('<changefreq>daily</changefreq>');
      expect(xml).toContain('<lastmod>2026-01-15</lastmod>');
    });

    it('absolutizes relative URLs', () => {
      const xml = buildSitemapXml([{ url: '/tools/notion' }]);
      expect(xml).toMatch(/<loc>https?:\/\/[^/]+\/tools\/notion<\/loc>/);
    });

    it('passes through absolute URLs unchanged', () => {
      const xml = buildSitemapXml([{ url: 'https://other-site.com/page' }]);
      expect(xml).toContain('<loc>https://other-site.com/page</loc>');
    });

    it('escapes special XML characters in URLs', () => {
      const xml = buildSitemapXml([{ url: '/search?q=a&b=c' }]);
      expect(xml).toContain('&amp;');
      expect(xml).not.toContain('q=a&b=c<');
    });

    it('uses today as default lastmod when not provided', () => {
      const xml = buildSitemapXml([{ url: '/foo' }]);
      const today = new Date().toISOString().slice(0, 10);
      expect(xml).toContain(`<lastmod>${today}</lastmod>`);
    });

    it('throws when entries exceed the limit', () => {
      const tooMany: SitemapEntry[] = Array.from({ length: 50_000 }, (_, i) => ({
        url: `/tools/${i}`,
      }));
      expect(() => buildSitemapXml(tooMany)).toThrow(/exceeds limit/);
    });

    it('handles empty entries gracefully', () => {
      const xml = buildSitemapXml([]);
      expect(xml).toContain('<urlset');
      expect(xml).toContain('</urlset>');
    });
  });

  describe('buildSitemapIndex', () => {
    it('splits entries into 45k chunks + an index file', () => {
      const entries: SitemapEntry[] = Array.from({ length: 100_000 }, (_, i) => ({
        url: `/tools/${i}`,
      }));
      const { index, sitemaps } = buildSitemapIndex(entries);

      // 100k / 45k = 2.22 → 3 chunks
      expect(sitemaps).toHaveLength(3);
      expect(sitemaps[0].filename).toBe('sitemap-1.xml');
      expect(sitemaps[1].filename).toBe('sitemap-2.xml');
      expect(sitemaps[2].filename).toBe('sitemap-3.xml');
      expect(index).toContain('<sitemapindex');
      expect(index).toContain('sitemap-1.xml');
      expect(index).toContain('sitemap-3.xml');
    });

    it('puts ≤45k entries in a single sitemap', () => {
      const entries: SitemapEntry[] = Array.from({ length: 1000 }, (_, i) => ({
        url: `/tools/${i}`,
      }));
      const { sitemaps } = buildSitemapIndex(entries);
      expect(sitemaps).toHaveLength(1);
    });

    it('respects custom base filename', () => {
      const entries: SitemapEntry[] = Array.from({ length: 50_000 }, (_, i) => ({
        url: `/n/${i}`,
      }));
      const { sitemaps } = buildSitemapIndex(entries, 'niches');
      expect(sitemaps[0].filename).toBe('niches-1.xml');
      expect(sitemaps[1].filename).toBe('niches-2.xml');
    });
  });

  describe('defaultsForPath', () => {
    it('gives homepage the highest priority', () => {
      expect(defaultsForPath('/').priority).toBe(1.0);
    });

    it('gives tool pages priority 0.85', () => {
      expect(defaultsForPath('/tools/notion').priority).toBe(0.85);
    });

    it('gives alternatives pages priority 0.8', () => {
      expect(defaultsForPath('/tools/notion/alternatives').priority).toBe(0.8);
    });

    it('gives category pages priority 0.85', () => {
      expect(defaultsForPath('/category/crm').priority).toBe(0.85);
    });

    it('gives best/* pages priority 0.75', () => {
      expect(defaultsForPath('/best/crm-for-startups').priority).toBe(0.75);
    });

    it('gives unknown paths a low default', () => {
      expect(defaultsForPath('/random').priority).toBe(0.5);
    });

    it('returns a valid changefreq for every known path', () => {
      const paths = ['/', '/finder', '/tools/x', '/category/x', '/best/x', '/vs/x-vs-y'];
      for (const p of paths) {
        const out = defaultsForPath(p);
        expect(['daily', 'weekly', 'monthly', 'yearly']).toContain(out.changefreq);
      }
    });
  });
});
