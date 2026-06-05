// apps/web/src/lib/user-store.ts
//
// PER-136 — Workspace users cache. Fetched once after sign-in, used by
// Avatar consumers to render real names + initials in place of UUID
// fragments. Refreshes are explicit (no real-time membership stream yet).

import { create } from 'zustand';
import { type WorkspaceUser, api } from './api';

interface UserState {
  byId: Record<string, WorkspaceUser>;
  loadedToken: string | null;
  loading: boolean;
  load: (token: string | null | undefined) => Promise<void>;
  /** Patch a cached user in place (e.g. after the current user renames). */
  upsert: (id: string, patch: Partial<WorkspaceUser>) => void;
  reset: () => void;
}

export const useUsers = create<UserState>((set, get) => ({
  byId: {},
  loadedToken: null,
  loading: false,

  async load(token) {
    if (!token) return;
    const state = get();
    if (state.loadedToken === token || state.loading) return;
    set({ loading: true });
    try {
      const users: WorkspaceUser[] = [];
      let cursor: string | undefined;
      do {
        const page = await api.listUsers(token, { limit: 200, cursor });
        users.push(...page.users);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      set({
        byId: Object.fromEntries(users.map((u) => [u.id, u])),
        loadedToken: token,
      });
    } catch {
      // Soft-fail: avatars will fall back to UUID-derived initials.
    } finally {
      set({ loading: false });
    }
  },

  upsert(id, patch) {
    set((s) => {
      const existing = s.byId[id];
      if (!existing) return s;
      return { byId: { ...s.byId, [id]: { ...existing, ...patch } } };
    });
  },

  reset() {
    set({ byId: {}, loadedToken: null, loading: false });
  },
}));

/** Best-effort display label for a user id; falls back to the id itself. */
export function nameForUser(
  id: string | null | undefined,
  byId: Record<string, WorkspaceUser>,
): string {
  if (!id) return 'Unknown';
  const u = byId[id];
  return u?.displayName ?? u?.email ?? id;
}
