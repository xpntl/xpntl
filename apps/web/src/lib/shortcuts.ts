import { useEffect } from 'react';

type Handler = (e: KeyboardEvent) => void;

type Opts = {
  /** Default true. When false, the shortcut is disabled (e.g. while a modal is open). */
  enabled?: boolean;
  /** Default true. When true, the shortcut is ignored if focus is in a text input. */
  ignoreInputs?: boolean;
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Bind a keyboard shortcut. Combo syntax: `mod+k`, `c`, `/`, `shift+?`, `alt+enter`.
 *
 * `mod` resolves to `cmd` on Mac and `ctrl` elsewhere.
 *
 * Shortcuts fire on `keydown`. By default they ignore presses while a text input
 * or textarea is focused; pass `ignoreInputs: false` to override (useful for
 * palette open shortcuts like Cmd+K).
 */
export function useShortcut(combo: string, handler: Handler, opts: Opts = {}): void {
  useEffect(() => {
    if (opts.enabled === false) return;
    const onKey = (e: KeyboardEvent) => {
      if (opts.ignoreInputs !== false && isFocusInInput()) return;
      if (matchCombo(e, combo)) {
        e.preventDefault();
        handler(e);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [combo, handler, opts.enabled, opts.ignoreInputs]);
}

function isFocusInInput(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  if (el instanceof HTMLInputElement)
    return el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'button';
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
}

function matchCombo(e: KeyboardEvent, combo: string): boolean {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((p) => p.trim());
  const key = parts[parts.length - 1];
  if (!key) return false;

  const wantMod = parts.includes('mod');
  const wantCtrl = parts.includes('ctrl');
  const wantCmd = parts.includes('cmd') || parts.includes('meta');
  const wantShift = parts.includes('shift');
  const wantAlt = parts.includes('alt') || parts.includes('option');

  const modPressed = isMac ? e.metaKey : e.ctrlKey;
  if (wantMod && !modPressed) return false;
  if (wantCtrl && !e.ctrlKey) return false;
  if (wantCmd && !e.metaKey) return false;
  if (wantShift !== e.shiftKey) return false;
  if (wantAlt !== e.altKey) return false;

  // If no modifier specifier in combo, modifiers must NOT be pressed (except shift for symbols).
  if (!wantMod && !wantCtrl && !wantCmd && !wantAlt && (e.ctrlKey || e.metaKey || e.altKey)) {
    return false;
  }

  return e.key.toLowerCase() === key;
}

export const SHORTCUT_PALETTE = isMac ? 'cmd+k' : 'ctrl+k';

/**
 * Bind a 2-key chord shortcut: press `leader`, then `follower` within `window` ms.
 * Common pattern: `g` then `i` → go-to-inbox.
 *
 * The leader key is "armed" by the first press, and clears either after the
 * window expires or after the second press (whether matched or not).
 */
export function useChord(
  leader: string,
  followers: Record<string, Handler>,
  opts: Opts & { window?: number } = {},
): void {
  useEffect(() => {
    if (opts.enabled === false) return;
    const window = opts.window ?? 1500;
    let armed = false;
    let timer: number | null = null;

    const disarm = () => {
      armed = false;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (opts.ignoreInputs !== false && isFocusInInput()) return;
      // Modifier-key chords don't make sense for this pattern.
      if (e.ctrlKey || e.metaKey || e.altKey) {
        disarm();
        return;
      }
      const key = e.key.toLowerCase();
      if (!armed) {
        if (key === leader.toLowerCase()) {
          armed = true;
          timer = setTimeout(disarm, window) as unknown as number;
        }
        return;
      }
      // Armed — try to match a follower.
      const handler = followers[key];
      disarm();
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      disarm();
    };
  }, [leader, followers, opts.enabled, opts.ignoreInputs, opts.window]);
}
