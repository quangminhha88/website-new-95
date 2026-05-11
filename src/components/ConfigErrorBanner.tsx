import { AlertTriangle, ExternalLink, X } from 'lucide-react';
import { env, isConfigValid } from '@/config/env';
import { useUIStore } from '@/stores/ui';

export function ConfigErrorBanner() {
  const dismissed = useUIStore((s) => s.configBannerDismissed);
  const dismiss = useUIStore((s) => s.dismissConfigBanner);

  // Mock mode: hide banner regardless of config
  if (env.VITE_MOCK_SERVICES) return null;
  if (isConfigValid()) return null;
  if (dismissed) return null;

  const urlLooksLikeKey =
    env.VITE_SUPABASE_URL.startsWith('sb_') ||
    env.VITE_SUPABASE_URL.startsWith('eyJ');

  return (
    <div className="bg-red-50 border-b border-red-200 px-4 py-3 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-red-100 p-2 rounded-full text-red-600">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-red-900">Supabase Configuration Error</p>
            <p className="text-xs text-red-700">
              {urlLooksLikeKey
                ? 'VITE_SUPABASE_URL looks like an API key. Use your Project URL instead (https://xyz.supabase.co).'
                : 'Your Supabase credentials are missing or invalid in your environment variables.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://supabase.com/dashboard/project/_/settings/api"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors"
          >
            Open Supabase Dashboard
            <ExternalLink size={14} />
          </a>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss configuration banner"
            className="p-1.5 rounded-lg text-red-700 hover:bg-red-100 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
