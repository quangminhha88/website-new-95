/**
 * Site-wide SEO configuration.
 * Centralised so titles, URLs, and author info aren't sprinkled across the codebase.
 */

export const SITE_CONFIG = {
  name: 'SaaS Excellence Hub',
  shortName: 'SaaS Directory',
  url: 'https://saas-excellence.com',
  defaultTitle: 'SaaS Tools Directory – Find & Compare the Best SaaS Software',
  defaultDescription:
    "Discover, compare, and implement the world's best SaaS tools. AI-powered recommendations, expert reviews, and pricing comparisons for 1000+ software products.",
  defaultOgImage: 'https://saas-excellence.com/og-default.png',
  twitterHandle: '@saasdirectory',
  locale: 'en_US',
} as const;

/**
 * Default author for E-E-A-T signals.
 * Override per-page when domain-expert reviews are added.
 */
export const DEFAULT_AUTHOR = {
  name: 'Dat Nguyen',
  jobTitle: 'SaaS Analyst',
  bio: 'SaaS analyst with 8+ years reviewing B2B software for startups and enterprise teams.',
  url: 'https://saas-excellence.com/about',
  image: 'https://saas-excellence.com/authors/dat.jpg',
  sameAs: [
    'https://twitter.com/saasdirectory',
    'https://www.linkedin.com/in/saasdirectory',
  ],
} as const;

export const ORGANIZATION = {
  name: SITE_CONFIG.name,
  url: SITE_CONFIG.url,
  logo: `${SITE_CONFIG.url}/logo.png`,
  sameAs: [
    'https://twitter.com/saasdirectory',
    'https://www.linkedin.com/company/saas-excellence',
  ],
} as const;

/**
 * Build an absolute URL from a path.
 * Use for canonical, og:url, schema URLs — anywhere a full URL is required.
 */
export function absoluteUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_CONFIG.url}${cleanPath}`;
}
