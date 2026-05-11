/**
 * Lightweight i18n.
 *
 * Why not react-i18next? For a content-heavy SEO directory we mostly
 * translate UI chrome (nav labels, CTAs, error messages). The article
 * content itself is per-locale rows in the database (see niche_pages.locale).
 * A 50-line typed dictionary is plenty.
 *
 * Adding a locale:
 *   1. Create src/i18n/locales/<code>.ts implementing `Dictionary`
 *   2. Add to LOCALES below
 *   3. Add hreflang in seo/config.ts and the SEO component
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { en } from './locales/en';

export type Locale = 'en' | 'vi';

export const LOCALES: { code: Locale; name: string; nativeName: string }[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
];

// Dictionary shape — derived from the English source.
// We strip `readonly` and string-literal exactness so other locales can supply different strings.
type DeepMutable<T> = T extends readonly (infer U)[]
  ? DeepMutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T extends string
      ? string
      : T;
export type Dictionary = DeepMutable<typeof en>;

interface I18nState {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      locale: detectInitialLocale(),
      setLocale: (l) => set({ locale: l }),
    }),
    { name: 'sx_locale' },
  ),
);

function detectInitialLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en';
  const lang = navigator.language?.split('-')[0]?.toLowerCase() ?? 'en';
  if (LOCALES.find((l) => l.code === lang)) return lang as Locale;
  return 'en';
}

// Lazy-load locales so each translation file is its own chunk
const dictionaries: Partial<Record<Locale, Dictionary>> = { en };

export async function loadDictionary(locale: Locale): Promise<Dictionary> {
  if (dictionaries[locale]) return dictionaries[locale]!;
  if (locale === 'en') return en;
  const mod = await import(/* @vite-ignore */ `./locales/${locale}.ts`);
  dictionaries[locale] = mod.default ?? mod[locale];
  return dictionaries[locale]!;
}

/**
 * Translation hook. Subscribes to the locale store + lazy-loads the dict.
 * Until the dict is loaded, falls back to `en` (so first paint is never blank).
 *
 *   const { t, locale } = useTranslation();
 *   <h1>{t('home.title')}</h1>
 */
import { useEffect, useState } from 'react';

export function useTranslation() {
  const locale = useI18nStore((s) => s.locale);
  const [dict, setDict] = useState<Dictionary>(en);

  useEffect(() => {
    let cancelled = false;
    void loadDictionary(locale).then((d) => {
      if (!cancelled) setDict(d);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  return {
    locale,
    t: (path: string, vars?: Record<string, string | number>): string =>
      lookup(dict, path, vars) ?? lookup(en, path, vars) ?? path,
  };
}

function lookup(
  dict: Dictionary,
  path: string,
  vars?: Record<string, string | number>,
): string | null {
  const parts = path.split('.');
  let cur: unknown = dict;
  for (const p of parts) {
    if (typeof cur !== 'object' || cur === null) return null;
    cur = (cur as Record<string, unknown>)[p];
  }
  if (typeof cur !== 'string') return null;
  if (!vars) return cur;
  return cur.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
