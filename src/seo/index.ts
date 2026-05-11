// Client-safe SEO exports.
// Note: pipeline.ts is intentionally NOT re-exported here — it's a
// server-only module imported directly by build scripts (scripts/*.ts).

export * from './config';
export * from './schema';
export * from './indexability';
export * from './sitemap';
export * from './content-validator';
export * from './internal-linking';
export * from './ctr-optimizer';
export { extractFAQs } from './faq-utils';
