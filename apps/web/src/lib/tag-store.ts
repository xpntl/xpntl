// apps/web/src/lib/tag-store.ts
//
// Workspace tags cache, fetched once per session. Mirrors the label-store
// pattern. Mutations go through `api.*` directly; the store is refreshed
// when a new tag is created so the picker shows it.

import { create } from 'zustand';
import { type Tag, api } from './api';

interface TagState {
  all: Tag[];
  loadedToken: string | null;
  loading: boolean;
  load: (token: string | null | undefined) => Promise<void>;
  reload: (token: string | null | undefined) => Promise<void>;
  reset: () => void;
}

export const useTags = create<TagState>((set, get) => ({
  all: [],
  loadedToken: null,
  loading: false,

  async load(token) {
    if (!token) return;
    const state = get();
    if (state.loadedToken === token || state.loading) return;
    set({ loading: true });
    try {
      const r = await api.listTags(token);
      set({ all: r.tags, loadedToken: token });
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
      const r = await api.listTags(token);
      set({ all: r.tags, loadedToken: token });
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
