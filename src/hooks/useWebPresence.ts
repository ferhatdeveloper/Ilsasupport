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

export function useWebPresence(user: { id?: string } | null, heartbeatSeconds = 45): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user?.id || isElectronShell()) return;
    const jwt = getStoredJwtAccessToken();
    if (!jwt || !isJwtAccessToken(jwt)) return;

    const sessionKey = getStoredWebPresenceKey();
    if (!sessionKey) return;

    const ping = async () => {
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

    void ping();
    const ms = Math.max(15, heartbeatSeconds) * 1000;
    intervalRef.current = setInterval(() => void ping(), ms);

    const onUnload = () => {
      sendPresenceEndBeacon(sessionKey, String(user.id));
    };
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [user?.id, heartbeatSeconds]);
}
