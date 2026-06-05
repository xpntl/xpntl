// apps/web/src/lib/theme.ts
//
// PER-100 — Theme store. Three modes: light / dark / system. The choice
// persists in localStorage; when `system`, the resolved theme follows
// `prefers-color-scheme` and updates live as the OS theme changes.
//
// The DS reads `data-theme` from `<html>`. This module is the only place
// that writes it (main.tsx no longer hard-codes a value).

import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'xp-theme-mode';

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  if (IS_TAURI) return 'system';
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return mode;
}

function applyToRoot(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolved);
}

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  /** Call once at app boot to wire up the matchMedia listener. */
  hydrate: () => () => void;
}

export const useTheme = create<ThemeState>((set, get) => {
  const initialMode = readStoredMode();
  const initialResolved = resolve(initialMode);
  applyToRoot(initialResolved);

  return {
    mode: initialMode,
    resolved: initialResolved,

    setMode(mode) {
      if (IS_TAURI) mode = 'system';
      try {
        window.localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // Private mode — best-effort.
      }
      const resolved = resolve(mode);
      applyToRoot(resolved);
      set({ mode, resolved });
    },

    hydrate() {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => undefined;
      }
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => {
        if (get().mode !== 'system') return;
        const resolved: ResolvedTheme = mq.matches ? 'dark' : 'light';
        applyToRoot(resolved);
        set({ resolved });
      };
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
  };
});
