/**
 * Input validation primitives and helpers.
 *
 * Every API endpoint should use one of:
 *   parseBody(req, schema)  — typed body validation, throws ApiValidationError
 *   parseQuery(req, schema) — typed query-string validation
 *   parseOrThrow(schema, x) — direct parse with the same error shape
 *
 * Defence layers:
 *   1. Zod schema enforces types + ranges
 *   2. Primitive schemas reject control chars + length-bomb inputs
 *   3. sanitizeHtml/escapeHtml strip dangerous tags before rendering
 *
 * SQL injection: not a real concern here because every DB call goes
 * through Supabase's parameterised PostgREST client. RLS is the second
 * line of defence (see 20260518_rls_audit.sql).
 */
import { z, type ZodSchema } from 'zod';
import type { VercelRequest } from '@vercel/node';

// ── Primitive schemas ──────────────────────────────────────────────────

/** URL-safe slug. Matches what /api/redirect/[slug] enforces. */
export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/, 'invalid_slug');

/** UUID v4 (PostgreSQL gen_random_uuid output). */
export const uuidSchema = z.string().uuid();

/** Email — strict, lowercased. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);

/** http(s) URL only. Rejects javascript:, data:, file:. */
export const urlSchema = z
  .string()
  .url()
  .max(2000)
  .refine((v) => /^https?:\/\//i.test(v), 'http_or_https_only');

/** Free text, with control chars stripped + reasonable length. */
export const safeStringSchema = (max = 2000) =>
  z
    .string()
    .max(max)
    .transform((v) => v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim())
    .refine((v) => v.length > 0, 'empty_after_strip');

/** Search query — short, no HTML brackets, stripped of newlines. */
export const searchQuerySchema = z
  .string()
  .min(1)
  .max(200)
  .transform((v) => v.replace(/[\r\n\t<>]/g, ' ').replace(/\s+/g, ' ').trim());

/** Pagination cursor (positive int, capped). */
export const limitSchema = z.coerce.number().int().min(1).max(100).default(20);
export const offsetSchema = z.coerce.number().int().min(0).max(10_000).default(0);

/** Moderation status (matches DB CHECK constraints). */
export const moderationStatusSchema = z.enum([
  'draft',
  'pending_review',
  'approved',
  'rejected',
]);

// ── Composite request schemas ──────────────────────────────────────────

export const recommendBodySchema = z.object({
  query: searchQuerySchema,
  limit: z.number().int().min(1).max(20).optional(),
  excludeSlug: slugSchema.optional(),
});

export const trackEventSchema = z.object({
  event_type: z.enum(['impression', 'affiliate_click', 'page_view', 'search']),
  page_type: z.enum(['tool', 'niche', 'home', 'category', 'comparison']).optional(),
  resource_slug: slugSchema.optional(),
  query: z.string().max(200).optional(),
  cta_variant_index: z.number().int().min(0).max(20).optional(),
  cta_variant_type: z
    .enum(['primary', 'secondary', 'featured', 'sticky', 'urgency', 'discount'])
    .optional(),
});

export const logErrorSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(20_000).optional(),
  componentStack: z.string().max(10_000).optional(),
  source: z.enum(['render', 'event', 'async', 'api', 'query']),
  url: z.string().max(2000).optional(),
  pagePath: z.string().max(500).optional(),
  userAgent: z.string().max(500).optional(),
  visitorId: z.string().max(100).optional(),
  appVersion: z.string().max(50).optional(),
  environment: z.enum(['development', 'preview', 'production']).optional(),
  context: z.record(z.unknown()).optional(),
  fingerprint: z.string().max(100).optional(),
});

export const redirectQuerySchema = z.object({
  slug: slugSchema,
  src: z
    .string()
    .max(50)
    .regex(/^[a-z0-9_-]*$/i, 'invalid_source')
    .optional()
    .default('direct'),
  cv: z
    .enum(['primary', 'secondary', 'featured', 'sticky', 'urgency', 'discount'])
    .optional(),
  vi: z.coerce.number().int().min(0).max(20).optional(),
});

// ── HTML sanitisation ──────────────────────────────────────────────────

const TAG_ALLOWLIST = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'ul',
  'ol',
  'li',
  'a',
  'h2',
  'h3',
  'h4',
  'details',
  'summary',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
]);

/**
 * Conservative server-side HTML cleanup. Strips <script>/<style>/<iframe>
 * blocks entirely and removes any tags not on the allowlist (preserves
 * their text content). Use before storing AI-generated HTML.
 *
 * For client-side render protection, React already escapes by default —
 * only `dangerouslySetInnerHTML` callers need to pre-sanitise.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  let cleaned = html
    .replace(/<\s*script\b[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*style\b[\s\S]*?<\s*\/\s*style\s*>/gi, '')
    .replace(/<\s*iframe\b[\s\S]*?<\s*\/\s*iframe\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '') // strip onclick=...
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '');

  // Drop disallowed tags (keep their inner text)
  cleaned = cleaned.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tag: string) => {
    return TAG_ALLOWLIST.has(tag.toLowerCase()) ? match : '';
  });

  return cleaned.trim();
}

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
};

/** Escape arbitrary text for safe embedding in HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"'/]/g, (ch) => ESCAPE_MAP[ch] ?? ch);
}

// ── Parse helpers ──────────────────────────────────────────────────────

export class ApiValidationError extends Error {
  readonly status = 400;
  readonly code = 'invalid_payload';
  constructor(public readonly issues: z.ZodIssue[]) {
    super('Validation failed');
  }
  toJSON() {
    return {
      error: this.code,
      issues: this.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  }
}

/**
 * Parse arbitrary input. Throws `ApiValidationError` on failure so a
 * single try/catch in the handler can produce a 400 response.
 */
export function parseOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new ApiValidationError(result.error.issues);
  return result.data;
}

/** Parse a JSON request body. Tolerates string or pre-parsed object. */
export function parseBody<T>(req: VercelRequest, schema: ZodSchema<T>): T {
  const raw = req.body;
  let body: unknown = raw;
  if (typeof raw === 'string') {
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ApiValidationError([
        { code: 'custom', path: [], message: 'invalid_json' } as z.ZodIssue,
      ]);
    }
  }
  return parseOrThrow(schema, body ?? {});
}

/** Parse the request query string (req.query). */
export function parseQuery<T>(req: VercelRequest, schema: ZodSchema<T>): T {
  return parseOrThrow(schema, req.query ?? {});
}
