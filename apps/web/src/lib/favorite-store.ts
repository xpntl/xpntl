import { create } from 'zustand';
import { type Favorite, api } from './api';

interface FavoriteState {
  items: Favorite[];
  ids: Set<string>;
  loaded: boolean;
  load: (token?: string | null) => Promise<void>;
  toggle: (
    entityType: Favorite['entityType'],
    entityId: string,
    token?: string | null,
  ) => Promise<boolean>;
  reset: () => void;
}

export const useFavorites = create<FavoriteState>((set, get) => ({
  items: [],
  ids: new Set(),
  loaded: false,

  async load(token) {
    if (get().loaded) return;
    try {
      const { favorites } = await api.listFavorites(undefined, token);
      set({
        items: favorites,
        ids: new Set(favorites.map((f) => `${f.entityType}:${f.entityId}`)),
        loaded: true,
      });
    } catch {
      // best-effort
    }
  },

  async toggle(entityType, entityId, token) {
    const key = `${entityType}:${entityId}`;
    const was = get().ids.has(key);

    // Optimistic
    const nextIds = new Set(get().ids);
    if (was) nextIds.delete(key);
    else nextIds.add(key);
    set({ ids: nextIds });

    try {
      const { favorited } = await api.toggleFavorite(entityType, entityId, token);
      const { favorites } = await api.listFavorites(undefined, token);
      set({
        items: favorites,
        ids: new Set(favorites.map((f) => `${f.entityType}:${f.entityId}`)),
      });
      return favorited;
    } catch {
      // Revert
      const revert = new Set(get().ids);
      if (was) revert.add(key);
      else revert.delete(key);
      set({ ids: revert });
      return was;
    }
  },

  reset() {
    set({ items: [], ids: new Set(), loaded: false });
  },
}));
