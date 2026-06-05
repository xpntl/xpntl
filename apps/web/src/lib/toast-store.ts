// apps/web/src/lib/toast-store.ts
//
// Lightweight toast queue. Uses Zustand so any component can fire a toast
// without prop-drilling. Auto-dismisses after `duration` ms.

import { create } from 'zustand';
import type { ToastKind } from '@xpntl/ui';

export interface ToastEntry {
  id: string;
  kind: ToastKind;
  title: string;
}

interface ToastState {
  toasts: ToastEntry[];
  push: (kind: ToastKind, title: string) => void;
  dismiss: (id: string) => void;
}

let counter = 0;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, title) => {
    const id = `toast-${++counter}-${Date.now()}`;
    set((s) => ({ toasts: [...s.toasts, { id, kind, title }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
