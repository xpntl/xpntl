import { create } from 'zustand';
import { type SavedView, api } from './api';

interface ViewState {
  views: SavedView[];
  loaded: boolean;
  load: (token?: string | null) => Promise<void>;
  create: (
    input: { name: string; filters: Record<string, string>; scope?: string },
    token?: string | null,
  ) => Promise<SavedView>;
  remove: (id: string, token?: string | null) => Promise<void>;
  reset: () => void;
}

export const useViews = create<ViewState>((set, get) => ({
  views: [],
  loaded: false,

  async load(token) {
    if (get().loaded) return;
    try {
      const { views } = await api.listViews(token);
      set({ views, loaded: true });
    } catch {
      // best-effort
    }
  },

  async create(input, token) {
    const { view } = await api.createView(input, token);
    set({ views: [...get().views, view] });
    return view;
  },

  async remove(id, token) {
    await api.deleteView(id, token);
    set({ views: get().views.filter((v) => v.id !== id) });
  },

  reset() {
    set({ views: [], loaded: false });
  },
}));
