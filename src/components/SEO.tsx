import { useEffect } from 'react';
import { SITE_CONFIG, absoluteUrl } from '@/seo/config';
import { robotsContent, type IndexabilityVerdict } from '@/seo/indexability';

interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogType?: 'website' | 'article' | 'product';
  ogImage?: string;
  /** Pre-built JSON-LD schema (use generators from `@/seo/schema`) */
  schema?: object | null;
  /** Indexability verdict — if shouldIndex is false, robots will be set to noindex */
  indexability?: IndexabilityVerdict;
}

const DEFAULT_OG_IMAGE = SITE_CONFIG.defaultOgImage;

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

const SCHEMA_ID = '__seo_schema__';

function setSchema(schema: object | null | undefined) {
  const existing = document.getElementById(SCHEMA_ID);
  if (!schema) {
    existing?.remove();
    return;
  }
  let el = existing as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.id = SCHEMA_ID;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(schema);
}

export default function SEO({
  title,
  description,
  canonical,
  ogType = 'website',
  ogImage,
  schema,
  indexability,
}: SEOProps) {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE_CONFIG.shortName}` : SITE_CONFIG.defaultTitle;
    const fullDesc = description || SITE_CONFIG.defaultDescription;
    const fullImage = ogImage ? absoluteUrl(ogImage) : DEFAULT_OG_IMAGE;
    const canonicalUrl = canonical ? absoluteUrl(canonical) : SITE_CONFIG.url;

    // When ogImage is passed explicitly, honour it (fullImage = absoluteUrl).
    // Otherwise derive a per-tool dynamic OG endpoint from the canonical URL
    // so every tool page gets its own card without needing per-page wiring.
    const resolvedOgImage = ogImage
      ? fullImage
      : typeof window !== 'undefined'
        ? `${window.location.origin}/api/og/tool?slug=${
            canonical?.split('/tools/')[1]?.split('/')[0] ?? ''
          }`
        : DEFAULT_OG_IMAGE;

    document.title = fullTitle;
    setMeta('description', fullDesc);

    // Robots — derived from indexability verdict (defaults to indexable)
    const robotsValue = indexability
      ? robotsContent(indexability)
      : 'index, follow, max-image-preview:large, max-snippet:-1';
    setMeta('robots', robotsValue);

    // Canonical
    setLink('canonical', canonicalUrl);

    // Open Graph
    setMeta('og:title', fullTitle, 'property');
    setMeta('og:description', fullDesc, 'property');
    setMeta('og:type', ogType, 'property');
    setMeta('og:image', resolvedOgImage, 'property');
    setMeta('og:url', canonicalUrl, 'property');
    setMeta('og:site_name', SITE_CONFIG.name, 'property');
    setMeta('og:locale', SITE_CONFIG.locale, 'property');

    // Twitter
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:site', SITE_CONFIG.twitterHandle);
    setMeta('twitter:title', fullTitle);
    setMeta('twitter:description', fullDesc);
    setMeta('twitter:image', resolvedOgImage);

    // Structured data
    setSchema(schema);

    return () => {
      // Reset to defaults on unmount so SPA navigation between pages with/without
      // schema doesn't leak the previous page's structured data.
      document.title = SITE_CONFIG.defaultTitle;
      setSchema(null);
    };
  }, [title, description, canonical, ogType, ogImage, schema, indexability]);

  return null;
}
