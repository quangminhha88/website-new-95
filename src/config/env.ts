/**
 * Client-side environment loader.
 *
 * Stage 1: rewritten from Vite's `import.meta.env` to Next.js's
 * `process.env.NEXT_PUBLIC_*`. Reads both `NEXT_PUBLIC_*` (canonical,
 * Next.js) and the legacy `VITE_*` names so any Vercel project that
 * still has the old vars set keeps working through the migration.
 *
 * The exported `env` object continues to use the `VITE_*` keys to avoid
 * touching every consumer in this stage — Stage 5 will rename them.
 */
import { z } from 'zod';

const clientEnvSchema = z.object({
  VITE_SUPABASE_URL: z
    .string()
    .url('VITE_SUPABASE_URL must be a valid URL (e.g. https://xyz.supabase.co)')
    .refine(
      (v) => v.startsWith('https://') && v.includes('.supabase.co'),
      'VITE_SUPABASE_URL must point to a Supabase project (https://xyz.supabase.co)',
    ),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'VITE_SUPABASE_ANON_KEY looks invalid (too short)'),
  VITE_SENTRY_DSN: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  VITE_APP_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  VITE_MOCK_SERVICES: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  MODE: z.enum(['development', 'production', 'test']).default('development'),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-key-placeholder-key';

function readEnv(name: string): string | undefined {
  // process.env in Next.js is a regular object on both server and client
  // (Next inlines NEXT_PUBLIC_* into the client bundle at build time).
  return process.env[name];
}

function loadEnv(): ClientEnv {
  const raw = {
    // Prefer NEXT_PUBLIC_*; fall back to VITE_* for transition period.
    VITE_SUPABASE_URL:
      readEnv('NEXT_PUBLIC_SUPABASE_URL') ?? readEnv('VITE_SUPABASE_URL'),
    VITE_SUPABASE_ANON_KEY:
      readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ?? readEnv('VITE_SUPABASE_ANON_KEY'),
    VITE_SENTRY_DSN:
      readEnv('NEXT_PUBLIC_SENTRY_DSN') ?? readEnv('VITE_SENTRY_DSN'),
    VITE_APP_URL: readEnv('NEXT_PUBLIC_APP_URL') ?? readEnv('VITE_APP_URL'),
    VITE_MOCK_SERVICES:
      readEnv('NEXT_PUBLIC_MOCK_SERVICES') ?? readEnv('VITE_MOCK_SERVICES'),
    MODE: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  };

  const parsed = clientEnvSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
    .join('\n');

  // Don't throw during `next build` static generation — env vars may not
  // be set in the build environment, only at runtime. NEXT_PHASE is the
  // standard signal Next.js exposes for this.
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

  if (process.env.NODE_ENV === 'production' && !isBuildPhase) {
    throw new Error(`Invalid client environment variables:\n${issues}`);
  }

  // eslint-disable-next-line no-console
  console.warn(`[env] Invalid environment — using placeholders:\n${issues}`);
  return {
    VITE_SUPABASE_URL: PLACEHOLDER_URL,
    VITE_SUPABASE_ANON_KEY: PLACEHOLDER_KEY,
    VITE_SENTRY_DSN: undefined,
    VITE_APP_URL: undefined,
    VITE_MOCK_SERVICES: raw.VITE_MOCK_SERVICES === 'true',
    MODE: 'development',
  };
}

export const env = loadEnv();

export function isConfigValid(): boolean {
  return (
    env.VITE_SUPABASE_URL !== PLACEHOLDER_URL &&
    env.VITE_SUPABASE_ANON_KEY !== PLACEHOLDER_KEY
  );
}
