/**
 * Server-side environment validator.
 *
 * Used by Vercel API functions and Node scripts. Validates ONCE per
 * cold start, caches the result. Hard fails on missing required vars
 * so a misconfigured deploy never silently ships.
 *
 * Note: this file uses `process.env` only — never `import.meta.env`.
 * That's the difference from `src/config/env.ts` (client side).
 */
import { z } from 'zod';

const serverEnvSchema = z.object({
  // Supabase admin (required)
  SUPABASE_URL: z
    .string()
    .url()
    .refine((v) => v.includes('.supabase.co'), 'SUPABASE_URL must point to a Supabase project'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(20, 'SUPABASE_SERVICE_ROLE_KEY looks invalid'),

  // Rate limiting (optional)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(10).optional(),

  // App
  APP_URL: z.string().url().optional(),

  // AI (optional — added post-deploy)
  GEMINI_API_KEY: z.string().min(10).optional(),

  // Sentry (server-side)
  SENTRY_DSN: z.string().url().optional(),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/**
 * Validate process.env against the schema. Throws on missing required vars.
 * Cached after first call so we don't re-parse on every API request.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid server environment variables:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

/**
 * Returns the env or null if invalid — for places where we want graceful
 * degradation rather than throwing (e.g. health checks).
 */
export function tryGetServerEnv(): ServerEnv | null {
  try {
    return getServerEnv();
  } catch {
    return null;
  }
}
