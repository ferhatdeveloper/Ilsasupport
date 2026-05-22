import { useEffect, useRef } from 'react';
import { apiFunctionsBase } from '../utils/supabase/info';
import { getStoredJwtAccessToken, isJwtAccessToken } from '../utils/authTokens';
import { isElectronShell } from '../utils/secureApi';

const STORAGE_KEY = 'ilsa_web_presence_key';

export function getStoredWebPresenceKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredWebPresenceKey(key: string | null): void {
  try {
    if (key) localStorage.setItem(STORAGE_KEY, key);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function sendPresenceEndBeacon(sessionKey: string, userId: string): void {
  const jwt = getStoredJwtAccessToken();
  const body = JSON.stringify({ sessionKey, userId });
  const url = `${apiFunctionsBase}/web-presence/end?reason=tab_close`;
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon(url, blob);
    return;
  }
  void fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body,
    keepalive: true,
  });
}

/** Sekme gizliyken nabız durur — sunucu yükünü azaltır */
export function useWebPresence(user: { id?: string } | null, heartbeatSeconds = 90): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPingRef = useRef(0);

  useEffect(() => {
    if (!user?.id || isElectronShell()) return;
    const jwt = getStoredJwtAccessToken();
    if (!jwt || !isJwtAccessToken(jwt)) return;

    const sessionKey = getStoredWebPresenceKey();
    if (!sessionKey) return;

    const minMs = Math.max(30_000, heartbeatSeconds * 1000);

    const ping = async () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastPingRef.current < minMs - 2000) return;
      lastPingRef.current = now;
      try {
        await fetch(`${apiFunctionsBase}/web-presence/ping`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({ sessionKey }),
        });
      } catch {
        /* ignore */
      }
    };

    const startInterval = () => {
      if (intervalRef.current) return;
      void ping();
      intervalRef.current = setInterval(() => void ping(), minMs);
    };

    const stopInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') startInterval();
      else stopInterval();
    };

    startInterval();
    document.addEventListener('visibilitychange', onVisibility);

    const onUnload = () => {
      sendPresenceEndBeacon(sessionKey, String(user.id));
    };
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);

    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [user?.id, heartbeatSeconds]);
}
