import { create } from 'zustand';
import { type Project, api } from './api';

interface ProjectState {
  all: Project[];
  loadedToken: string | null;
  loading: boolean;
  load: (token: string | null | undefined) => Promise<void>;
  reload: (token: string | null | undefined) => Promise<void>;
  reset: () => void;
}

export const useProjects = create<ProjectState>((set, get) => {
  // Tracks an in-flight load so concurrent callers await the SAME fetch instead
  // of bailing early. On first login, SessionLoader and LandingRedirect both call
  // load(token) at once — if the second caller returned early it would read an
  // empty `all` and LandingRedirect would fall back to "My Issues" instead of the
  // project board (XP-120).
  let inFlight: Promise<void> | null = null;

  return {
    all: [],
    loadedToken: null,
    loading: false,

    async load(token) {
      if (!token) return;
      if (get().loadedToken === token) return;
      if (inFlight) return inFlight;
      set({ loading: true });
      inFlight = (async () => {
        try {
          const r = await api.listProjects(token);
          set({ all: r.projects, loadedToken: token });
        } catch {
          // Soft-fail: sidebar shows empty project list.
        } finally {
          set({ loading: false });
          inFlight = null;
        }
      })();
      return inFlight;
    },

    async reload(token) {
      if (!token) return;
      inFlight = null;
      set({ loading: true });
      try {
        const r = await api.listProjects(token);
        set({ all: r.projects, loadedToken: token });
      } catch {
        // Soft-fail.
      } finally {
        set({ loading: false });
      }
    },

    reset() {
      inFlight = null;
      set({ all: [], loadedToken: null, loading: false });
    },
  };
});
