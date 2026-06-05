import { useCallback, useLayoutEffect, type RefObject } from 'react';

// XP-85: grow a textarea to fit its content (up to maxHeight, then scroll).
// Re-measures whenever `value` changes; returns a manual resize() for events.
export function useAutoGrowTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxHeight = 200,
) {
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [ref, maxHeight]);

  useLayoutEffect(resize, [value, resize]);

  return resize;
}
