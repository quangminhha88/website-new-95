/**
 * UI state store — banners, modals, transient toasts.
 * Persists nothing; resets on reload.
 */
import { create } from 'zustand';

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

interface UIState {
  toasts: Toast[];
  configBannerDismissed: boolean;
  pushToast: (msg: string, type?: Toast['type']) => void;
  removeToast: (id: string) => void;
  dismissConfigBanner: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  toasts: [],
  configBannerDismissed: false,

  pushToast: (message, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    // Auto-dismiss after 4s
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },

  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  dismissConfigBanner: () => set({ configBannerDismissed: true }),
}));
