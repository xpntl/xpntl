import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth-store';

const IDLE_MS = 30 * 60 * 1000;
const WARNING_MS = 2 * 60 * 1000;
const THROTTLE_MS = 30 * 1000;

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;

export function useIdleTimeout() {
  const { token, clear } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const lastActivity = useRef(Date.now());
  const warningTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const signoutTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const throttleRef = useRef(0);

  const resetTimers = useCallback(() => {
    lastActivity.current = Date.now();
    setShowWarning(false);
    clearTimeout(warningTimer.current);
    clearTimeout(signoutTimer.current);

    warningTimer.current = setTimeout(() => {
      setShowWarning(true);
      signoutTimer.current = setTimeout(() => {
        if (token) {
          api.logout(token).catch(() => {});
        }
        clear();
        window.location.href = '/signin?reason=idle';
      }, WARNING_MS);
    }, IDLE_MS - WARNING_MS);
  }, [token, clear]);

  const handleActivity = useCallback(() => {
    const now = Date.now();
    if (now - throttleRef.current < THROTTLE_MS) return;
    throttleRef.current = now;
    resetTimers();
  }, [resetTimers]);

  const staySignedIn = useCallback(() => {
    resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    if (!token) return;

    resetTimers();

    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, handleActivity, { passive: true });
    }
    return () => {
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, handleActivity);
      }
      clearTimeout(warningTimer.current);
      clearTimeout(signoutTimer.current);
    };
  }, [token, handleActivity, resetTimers]);

  return { showWarning, staySignedIn };
}
