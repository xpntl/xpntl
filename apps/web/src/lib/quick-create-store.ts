import { create } from 'zustand';

interface QuickCreateState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useQuickCreate = create<QuickCreateState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
