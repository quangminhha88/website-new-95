/**
 * @deprecated Import from `@/lib/gemini` instead.
 *
 * This file exists only as a back-compat re-export so existing callers
 * (aiContentService, scripts/, api/cron/refresh-content) keep working.
 * New code should use `import { generateContent, geminiGenerate } from '@/lib/gemini'`.
 */
export { generateContent, geminiGenerate } from './gemini';
export type { GeminiMode, GeminiOptions, GeminiCallMeta } from './gemini';
