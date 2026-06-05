// apps/web/src/lib/confirm-store.ts
//
// Zustand store powering the imperative confirm() / alertNotice() helpers.
// Replaces all window.confirm() and window.alert() calls with styled dialogs.

import { create } from 'zustand';

export type ConfirmVariant = 'danger' | 'default';

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: ConfirmVariant;
  /** When true, show only an "OK" button (alert mode). */
  alertOnly: boolean;
  resolve: ((confirmed: boolean) => void) | null;
}

interface ConfirmActions {
  /** Show a confirm dialog and return a promise that resolves true/false. */
  confirm: (opts: {
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ConfirmVariant;
  }) => Promise<boolean>;
  /** Show an alert dialog (single OK button) and return a promise that resolves when dismissed. */
  alert: (opts: {
    title?: string;
    message: string;
  }) => Promise<void>;
  /** Called by the dialog component when the user responds. */
  respond: (confirmed: boolean) => void;
}

export const useConfirmStore = create<ConfirmState & ConfirmActions>((set, get) => ({
  open: false,
  title: '',
  message: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  variant: 'default',
  alertOnly: false,
  resolve: null,

  confirm: (opts) => {
    // If a previous dialog is still open, resolve it as cancelled.
    const prev = get().resolve;
    if (prev) prev(false);

    return new Promise<boolean>((resolve) => {
      set({
        open: true,
        title: opts.title ?? 'Confirm',
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Confirm',
        cancelLabel: opts.cancelLabel ?? 'Cancel',
        variant: opts.variant ?? 'default',
        alertOnly: false,
        resolve,
      });
    });
  },

  alert: (opts) => {
    const prev = get().resolve;
    if (prev) prev(false);

    return new Promise<void>((resolve) => {
      set({
        open: true,
        title: opts.title ?? 'Notice',
        message: opts.message,
        confirmLabel: 'OK',
        cancelLabel: 'Cancel',
        variant: 'default',
        alertOnly: true,
        resolve: () => resolve(),
      });
    });
  },

  respond: (confirmed) => {
    const { resolve } = get();
    if (resolve) resolve(confirmed);
    set({ open: false, resolve: null });
  },
}));

/** Imperative confirm — use inside event handlers.
 *  `const ok = await confirm({ message: 'Delete this?' })` */
export function confirm(opts: Parameters<ConfirmActions['confirm']>[0]) {
  return useConfirmStore.getState().confirm(opts);
}

/** Imperative alert — use inside event handlers.
 *  `await alertNotice({ message: 'Done!' })` */
export function alertNotice(opts: Parameters<ConfirmActions['alert']>[0]) {
  return useConfirmStore.getState().alert(opts);
}
