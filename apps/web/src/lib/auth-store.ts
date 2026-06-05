import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Workspace, WorkspaceMembership } from './api';

export type SavedWorkspaceSession = {
  token: string;
  workspace: Workspace;
  user: User;
  lastUsedAt: string;
};

type AuthState = {
  workspace: Workspace | null;
  user: User | null;
  token: string | null;
  account: { id: string; email: string } | null;
  sessions: SavedWorkspaceSession[];
  memberships: WorkspaceMembership[];
  isPartialSession: boolean;
  setSession: (s: { workspace: Workspace; user: User; token: string }) => void;
  setPartialSession: (s: { account: { id: string; email: string }; token: string }) => void;
  setProfile: (s: { workspace: Workspace; user: User }) => void;
  setMemberships: (memberships: WorkspaceMembership[]) => void;
  switchSession: (token: string) => void;
  removeSession: (token?: string | null) => void;
  clearAll: () => void;
  clear: () => void;
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      workspace: null,
      user: null,
      token: null,
      account: null,
      sessions: [],
      memberships: [],
      get isPartialSession() {
        const s = get();
        return s.token !== null && s.workspace === null;
      },
      setSession: (s) =>
        set((state) => {
          const next: SavedWorkspaceSession = {
            ...s,
            lastUsedAt: new Date().toISOString(),
          };
          const others = state.sessions.filter(
            (session) =>
              session.token !== s.token &&
              !sameWorkspaceIdentity(session, { workspace: s.workspace, user: s.user }),
          );
          return {
            workspace: s.workspace,
            user: s.user,
            token: s.token,
            account: null,
            sessions: normalizeSessions([next, ...others]),
            memberships: mergeMemberships(state.memberships, {
              workspace: s.workspace,
              user: s.user,
              isCurrent: true,
              isDefault: false,
            }),
          };
        }),
      setPartialSession: (s) =>
        set({
          account: s.account,
          token: s.token,
          workspace: null,
          user: null,
        }),
      setProfile: (s) =>
        set((state) => ({
          workspace: s.workspace,
          user: s.user,
          sessions: normalizeSessions(
            state.sessions.map((session) =>
              session.token === state.token
                ? { ...session, workspace: s.workspace, user: s.user }
                : session,
            ),
          ),
          memberships: mergeMemberships(state.memberships, {
            workspace: s.workspace,
            user: s.user,
            isCurrent: true,
            isDefault: false,
          }),
        })),
      setMemberships: (memberships) => set({ memberships }),
      switchSession: (token) =>
        set((state) => {
          const target = state.sessions.find((session) => session.token === token);
          if (!target) return {};
          const updated = { ...target, lastUsedAt: new Date().toISOString() };
          const sessions = normalizeSessions([
            updated,
            ...state.sessions.filter((session) => session.token !== token),
          ]);
          return {
            token: updated.token,
            workspace: updated.workspace,
            user: updated.user,
            sessions,
          };
        }),
      removeSession: (tokenToRemove) =>
        set((state) => {
          const targetToken = tokenToRemove ?? state.token;
          const sessions = normalizeSessions(
            state.sessions.filter((session) => session.token !== targetToken),
          );
          const next = sessions[0] ?? null;
          return {
            sessions,
            token: next?.token ?? null,
            workspace: next?.workspace ?? null,
            user: next?.user ?? null,
          };
        }),
      clearAll: () =>
        set({ workspace: null, user: null, token: null, account: null, sessions: [], memberships: [] }),
      clear: () => get().removeSession(),
    }),
    {
      name: 'xpntl-auth',
      partialize: (state) => ({
        token: state.token,
        account: state.account,
        sessions: state.sessions,
        memberships: state.memberships,
      }),
    },
  ),
);

function normalizeSessions(sessions: SavedWorkspaceSession[]) {
  const byWorkspace = new Map<string, SavedWorkspaceSession>();
  for (const session of sessions) {
    const key = `${session.workspace.id}:${session.user.email.toLowerCase()}`;
    const existing = byWorkspace.get(key);
    if (!existing || session.lastUsedAt > existing.lastUsedAt) {
      byWorkspace.set(key, session);
    }
  }
  return [...byWorkspace.values()].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
}

function sameWorkspaceIdentity(
  left: SavedWorkspaceSession,
  right: { workspace: Workspace; user: User },
) {
  return (
    left.workspace.id === right.workspace.id &&
    left.user.email.toLowerCase() === right.user.email.toLowerCase()
  );
}

function mergeMemberships(
  memberships: WorkspaceMembership[],
  current: WorkspaceMembership,
): WorkspaceMembership[] {
  // Preserve a server-known default flag for the current workspace even though
  // the synthetic `current` (built from the live session) doesn't carry it.
  const prior = memberships.find((entry) => entry.workspace.id === current.workspace.id);
  const merged: WorkspaceMembership = {
    ...current,
    isCurrent: true,
    isDefault: current.isDefault || prior?.isDefault || false,
  };
  const next = memberships
    .filter((entry) => entry.workspace.id !== current.workspace.id)
    .map((entry) => ({ ...entry, isCurrent: false }));
  return [merged, ...next].sort((a, b) =>
    a.workspace.name.localeCompare(b.workspace.name),
  );
}
