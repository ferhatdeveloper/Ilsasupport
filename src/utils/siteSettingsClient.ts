import { apiFunctionsBase } from './supabase/info';

export type PublicSiteSettings = {
  loginMode: 'electron_only' | 'web_allowed';
  webMaxConcurrentSessions: number;
  webSessionHeartbeatSeconds: number;
  notifyNewFileToast: boolean;
};

let cached: { at: number; data: PublicSiteSettings } | null = null;

export async function fetchPublicSiteSettings(): Promise<PublicSiteSettings> {
  const now = Date.now();
  if (cached && now - cached.at < 30_000) return cached.data;
  const res = await fetch(`${apiFunctionsBase}/public/site-settings`);
  if (!res.ok) {
    return {
      loginMode: 'electron_only',
      webMaxConcurrentSessions: 1,
      webSessionHeartbeatSeconds: 45,
      notifyNewFileToast: true,
    };
  }
  const data = await res.json();
  const out: PublicSiteSettings = {
    loginMode: data.loginMode === 'web_allowed' ? 'web_allowed' : 'electron_only',
    webMaxConcurrentSessions: Number(data.webMaxConcurrentSessions) || 1,
    webSessionHeartbeatSeconds: Number(data.webSessionHeartbeatSeconds) || 45,
    notifyNewFileToast: data.notifyNewFileToast !== false,
  };
  cached = { at: now, data: out };
  return out;
}

export function invalidatePublicSiteSettingsCache(): void {
  cached = null;
}
