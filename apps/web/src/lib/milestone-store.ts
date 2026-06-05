import { create } from 'zustand';
import { type Milestone, api } from './api';

interface MilestoneState {
  byProject: Record<string, Milestone[]>;
  loading: boolean;
  load: (projectId: string, token: string | null | undefined) => Promise<void>;
  reset: () => void;
}

export const useMilestones = create<MilestoneState>((set, get) => ({
  byProject: {},
  loading: false,

  async load(projectId, token) {
    if (!token || !projectId) return;
    if (get().byProject[projectId]) return;
    set({ loading: true });
    try {
      const r = await api.listMilestones(projectId, token);
      set((s) => ({ byProject: { ...s.byProject, [projectId]: r.milestones } }));
    } catch {
      // soft-fail
    } finally {
      set({ loading: false });
    }
  },

  reset() {
    set({ byProject: {}, loading: false });
  },
}));
