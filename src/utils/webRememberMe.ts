import { apiFunctionsBase } from './supabase/info';
import { readResponseJson } from './readResponseJson';
import { setStoredWebPresenceKey } from '../hooks/useWebPresence';
import { activateWebJwtSession } from './secureApi';

const KEY_ENABLED = 'ilsa_web_remember';
const KEY_USER = 'ilsa_web_remember_user';
const KEY_PASS = 'ilsa_web_remember_pass';

function encodeSecret(value: string): string {
  try {
    return btoa(encodeURIComponent(value));
  } catch {
    return '';
  }
}

function decodeSecret(encoded: string): string {
  try {
    return decodeURIComponent(atob(encoded));
  } catch {
    return '';
  }
}

export function isWebRememberEnabled(): boolean {
  try {
    return localStorage.getItem(KEY_ENABLED) === '1';
  } catch {
    return false;
  }
}

export function getWebRememberPrefill(): { enabled: boolean; username: string } {
  try {
    return {
      enabled: isWebRememberEnabled(),
      username: localStorage.getItem(KEY_USER) || '',
    };
  } catch {
    return { enabled: false, username: '' };
  }
}

export function saveWebRemember(username: string, password: string): void {
  try {
    localStorage.setItem(KEY_ENABLED, '1');
    localStorage.setItem(KEY_USER, String(username || '').trim().toLowerCase());
    localStorage.setItem(KEY_PASS, encodeSecret(password));
  } catch {
    /* ignore */
  }
}

export function clearWebRemember(): void {
  try {
    localStorage.removeItem(KEY_ENABLED);
    localStorage.removeItem(KEY_USER);
    localStorage.removeItem(KEY_PASS);
  } catch {
    /* ignore */
  }
}

export type WebSignInResult = {
  ok: boolean;
  accessToken?: string;
  user?: unknown;
  webPresenceKey?: string;
  error?: string;
  errorCode?: string;
};

export async function webSignIn(opts: {
  username: string;
  password: string;
  forceLogin?: boolean;
  rememberMe?: boolean;
}): Promise<WebSignInResult> {
  const username = String(opts.username || '').trim().toLowerCase();
  const response = await fetch(`${apiFunctionsBase}/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: opts.password,
      forceLogin: !!opts.forceLogin,
    }),
  });

  const data = await readResponseJson<{
    error?: string;
    errorCode?: string;
    accessToken?: string;
    user?: unknown;
    webPresenceKey?: string;
  }>(response);

  if (!response.ok) {
    return {
      ok: false,
      error: data.error || 'Giriş başarısız',
      errorCode: data.errorCode,
    };
  }

  if (!data.accessToken || !data.user) {
    return { ok: false, error: 'Sunucudan geçersiz yanıt' };
  }

  if (data.webPresenceKey) setStoredWebPresenceKey(data.webPresenceKey);

  if (opts.rememberMe) {
    saveWebRemember(username, opts.password);
  } else {
    clearWebRemember();
  }

  return {
    ok: true,
    accessToken: data.accessToken,
    user: data.user,
    webPresenceKey: data.webPresenceKey,
  };
}

/** JWT yokken kayıtlı hesapla otomatik web girişi */
export async function tryWebRememberSignIn(): Promise<WebSignInResult | null> {
  if (!isWebRememberEnabled()) return null;
  const username = localStorage.getItem(KEY_USER);
  const passEnc = localStorage.getItem(KEY_PASS);
  if (!username || !passEnc) return null;
  const password = decodeSecret(passEnc);
  if (!password) {
    clearWebRemember();
    return null;
  }
  const result = await webSignIn({ username, password, forceLogin: false, rememberMe: true });
  if (!result.ok) clearWebRemember();
  return result.ok ? result : null;
}
