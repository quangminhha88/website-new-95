/**
 * Advanced A/B testing engine.
 *
 * Two phases:
 *   1. ASSIGN  → on first visit, pick a variant for this visitor + record
 *                in a long-lived cookie so the same person sees the same
 *                variant on every return (deterministic).
 *   2. RESOLVE → if the resource has a winner promoted in `ab_experiments`,
 *                everyone sees it (no more random splits).
 *
 * The selectVariantForVisitor() in ctr-optimizer.ts already does the
 * deterministic hash. This module layers on:
 *   - cookie persistence so the visitor ID survives session/storage clears
 *   - the winner-resolution short-circuit
 *   - typed assignment result for tracking
 */
import { selectVariantForVisitor, type TitleVariant } from './ctr-optimizer';

const COOKIE_NAME = 'sx_ab';
const COOKIE_MAX_AGE_DAYS = 90;

export interface VariantAssignment {
  variant: TitleVariant;
  variantIndex: number;
  /** Whether this variant was forced because a winner is promoted */
  isWinner: boolean;
  /** Visitor ID used for the deterministic hash */
  visitorId: string;
}

/**
 * Get or create a stable visitor ID stored in a first-party cookie.
 * Falls back to localStorage if cookies are blocked.
 */
export function getVisitorId(): string {
  if (typeof document === 'undefined') return 'ssr';

  // Cookie path
  const fromCookie = readCookie(COOKIE_NAME);
  if (fromCookie) return fromCookie;

  // localStorage fallback (some users block cookies)
  const fromLS = window.localStorage?.getItem(COOKIE_NAME) ?? null;
  if (fromLS) {
    writeCookie(COOKIE_NAME, fromLS, COOKIE_MAX_AGE_DAYS);
    return fromLS;
  }

  // Fresh ID
  const id = crypto.randomUUID?.() ?? `v${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeCookie(COOKIE_NAME, id, COOKIE_MAX_AGE_DAYS);
  try {
    window.localStorage?.setItem(COOKIE_NAME, id);
  } catch {
    // localStorage may be disabled in private mode — that's OK
  }
  return id;
}

/**
 * Pick the variant a visitor should see for a given resource.
 *
 * @param variants     all candidate variants (from tools.seo_variants etc)
 * @param pageSlug     the resource slug — used in the hash so a visitor
 *                     gets different variants per page (correct A/B math)
 * @param winnerIndex  if a winner has been promoted, force everyone to it
 */
export function assignVariant(
  variants: TitleVariant[],
  pageSlug: string,
  winnerIndex?: number,
): VariantAssignment {
  const visitorId = getVisitorId();

  // Winner short-circuit — once a variant wins, stop the experiment
  if (typeof winnerIndex === 'number' && variants[winnerIndex]) {
    return {
      variant: variants[winnerIndex],
      variantIndex: winnerIndex,
      isWinner: true,
      visitorId,
    };
  }

  if (variants.length === 0) {
    throw new Error('No variants available for assignment');
  }

  const variant = selectVariantForVisitor(variants, visitorId, pageSlug);
  const variantIndex = variants.indexOf(variant);
  return { variant, variantIndex, isWinner: false, visitorId };
}

// ── Cookie helpers ─────────────────────────────────────────────────────

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, maxAgeDays: number): void {
  if (typeof document === 'undefined') return;
  const maxAge = maxAgeDays * 24 * 60 * 60;
  const isSecure = window.location.protocol === 'https:';
  document.cookie =
    `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; ` +
    `path=/; samesite=lax${isSecure ? '; secure' : ''}`;
}
