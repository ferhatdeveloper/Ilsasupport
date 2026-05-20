import { apiFunctionsBase } from './supabase/info';
import { readResponseJson } from './readResponseJson';
import { setupJsonHeaders } from './setupClientHeaders';

export type DemoPersona = 'admin' | 'premium' | 'free';

const PRESETS: Record<
  DemoPersona,
  { username: string; password: string; name: string; demoRole?: string; demoPlan?: string }
> = {
  admin: {
    username: 'admin',
    password: 'Admin123456!',
    name: 'Admin User',
    demoRole: 'admin',
    demoPlan: 'premium',
  },
  premium: {
    username: 'premium',
    password: 'Premium123456!',
    name: 'Premium User',
    demoRole: 'user',
    demoPlan: 'premium',
  },
  free: {
    username: 'free',
    password: 'Free123456!',
    name: 'Free User',
    demoRole: 'user',
    demoPlan: 'free',
  },
};

/**
 * Admin / premium / free hazır hesaplarla giriş (LoginPage ile aynı mantık).
 * Premium ve free için veritabında kullanıcı yoksa signup ile oluşturulur (plan sunucuda free olabilir; tam plan için setup-all-demo-users).
 */
export async function performDemoQuickLogin(
  persona: DemoPersona,
): Promise<{ accessToken: string; user: unknown } | { error: string }> {
  const { username, password, name, demoRole, demoPlan } = PRESETS[persona];

  try {
    if (demoRole === 'admin') {
      const setupResponse = await fetch(`${apiFunctionsBase}/setup-admin`, {
        method: 'POST',
        headers: setupJsonHeaders(),
        body: JSON.stringify({ username, password, name, force: false }),
      });
      const setupData = await readResponseJson<{ error?: string; details?: string }>(setupResponse);
      if (!setupResponse.ok) {
        const fromBody = [setupData.error, setupData.details].filter(Boolean).join(' — ');
        const fromStatus =
          setupResponse.status === 502 ||
          setupResponse.status === 504 ||
          setupResponse.status === 0
            ? "API'ye bağlanılamıyor. `npm run api` veya `npm run dev:full` ile sunucuyu başlatın."
            : setupResponse.status >= 500
              ? 'Sunucu hatası (veritabanı / .env kontrol edin)'
              : `HTTP ${setupResponse.status}`;
        return { error: fromBody || fromStatus };
      }
    }

    let signinResponse = await fetch(`${apiFunctionsBase}/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, forceLogin: true }),
    });

    if (!signinResponse.ok) {
      const signinError = await readResponseJson<{ error?: string }>(signinResponse);

      if (
        (signinError.error?.includes('Invalid') || signinResponse.status === 400) &&
        demoRole !== 'admin'
      ) {
        const signupResponse = await fetch(`${apiFunctionsBase}/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, name, role: demoRole, plan: demoPlan }),
        });
        const signupErr = await readResponseJson<{ error?: string }>(signupResponse);
        if (!signupResponse.ok) {
          return { error: signupErr.error || 'Demo hesabı oluşturulamadı' };
        }

        signinResponse = await fetch(`${apiFunctionsBase}/signin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, forceLogin: true }),
        });
        if (!signinResponse.ok) {
          const err2 = await readResponseJson<{ error?: string }>(signinResponse);
          return { error: err2.error || 'Giriş başarısız' };
        }
      } else {
        return { error: signinError.error || 'Giriş başarısız' };
      }
    }

    const signinData = await readResponseJson<{ accessToken?: string; user?: unknown }>(signinResponse);
    if (!signinData.accessToken || !signinData.user) {
      return { error: 'Sunucudan geçersiz yanıt (API çalışıyor mu?)' };
    }
    return { accessToken: signinData.accessToken, user: signinData.user };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Demo giriş başarısız';
    return { error: msg };
  }
}
