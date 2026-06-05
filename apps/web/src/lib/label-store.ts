// apps/web/src/lib/label-store.ts
//
// PER-43 — Workspace labels cache, fetched once per session. Mirrors the
// shape of user-store.ts. Mutations (create / attach / detach) bypass the
// store and go through `api.*` directly; the store is refreshed when a new
// label is created so the picker shows it.

import { create } from 'zustand';
import { type Label, api } from './api';

interface LabelState {
  all: Label[];
  loadedToken: string | null;
  loading: boolean;
  load: (token: string | null | undefined) => Promise<void>;
  reload: (token: string | null | undefined) => Promise<void>;
  reset: () => void;
}

export const useLabels = create<LabelState>((set, get) => ({
  all: [],
  loadedToken: null,
  loading: false,

  async load(token) {
    if (!token) return;
    const state = get();
    if (state.loadedToken === token || state.loading) return;
    set({ loading: true });
    try {
      const r = await api.listLabels(token);
      set({ all: r.labels, loadedToken: token });
    } catch {
      // Soft-fail: picker shows empty list.
    } finally {
      set({ loading: false });
    }
  },

  async reload(token) {
    if (!token) return;
    set({ loading: true });
    try {
      const r = await api.listLabels(token);
      set({ all: r.labels, loadedToken: token });
    } catch {
      // Soft-fail.
    } finally {
      set({ loading: false });
    }
  },

  reset() {
    set({ all: [], loadedToken: null, loading: false });
  },
}));
