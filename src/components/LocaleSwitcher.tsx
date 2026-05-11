import { Globe } from 'lucide-react';
import { useI18nStore, LOCALES, type Locale } from '@/i18n';

export default function LocaleSwitcher({ className = '' }: { className?: string }) {
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);

  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <Globe className="absolute left-3 h-4 w-4 text-gray-500 pointer-events-none" />
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        aria-label="Select language"
        className="appearance-none rounded-lg border border-gray-200 bg-white pl-9 pr-8 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}
