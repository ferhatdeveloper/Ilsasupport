/**
 * Kurulum uçları (setup-admin, setup-all-*) ve genel IP tabanlı hız sınırı.
 *
 * Not: rate limit KV’de `rate:public:*` anahtarı desteklenmediği için bellek içi tutulur
 * (tek Deno süreci; yeniden başlatınca sıfırlanır).
 */
type RateEntry = { count: number; windowStart: number };
const rateState = new Map<string, RateEntry>();

function pruneRateState(now: number, windowMs: number): void {
  if (rateState.size < 4000) return;
  for (const [k, v] of rateState) {
    if (now - v.windowStart > windowMs) rateState.delete(k);
  }
}

export function getSetupSecretTrimmed(): string {
  return (Deno.env.get('SETUP_SECRET') || '').trim();
}

/** Üretimde web /signin kapalı; giriş Electron + cihaz kilidi (admin web istisna). */
export function electronLoginRequired(): boolean {
  const flag = (Deno.env.get('ILSA_REQUIRE_ELECTRON_LOGIN') || '').trim().toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'yes') return true;
  if (flag === '0' || flag === 'false' || flag === 'no') return false;
  return (Deno.env.get('ILSA_PRODUCTION') || '').trim().toLowerCase() === 'true';
}

/** SETUP_SECRET tanımlıysa X-Setup-Secret başlığı aynı olmalı; tanımsızsa yerel demo için kontrol yok. */
export function assertSetupSecretIfConfigured(c: { json: (b: unknown, s: number) => Response } & {
  req: { header: (n: string) => string | undefined };
}): Response | null {
  const secret = getSetupSecretTrimmed();
  if (!secret) return null;
  const h = (c.req.header('X-Setup-Secret') || '').trim();
  if (h !== secret) {
    return c.json(
      {
        error: 'Kurulum anahtarı gerekli veya geçersiz (SETUP_SECRET / X-Setup-Secret).',
        code: 'SETUP_SECRET_REQUIRED',
      },
      403,
    );
  }
  return null;
}

/**
 * setup-admin force=true: SETUP_SECRET yoksa reddet; varsa başlık eşleşmeli.
 * (SETUP_SECRET yokken force ile admin devralma kapatılır.)
 */
export function assertForceAdminAllowed(
  c: { json: (b: unknown, s: number) => Response } & { req: { header: (n: string) => string | undefined } },
  force: boolean,
): Response | null {
  if (!force) return null;
  const secret = getSetupSecretTrimmed();
  if (!secret) {
    return c.json(
      {
        error:
          'Admin sıfırlama (force) için sunucuda SETUP_SECRET tanımlayın ve istekte X-Setup-Secret gönderin.',
        code: 'SETUP_FORCE_BLOCKED',
      },
      403,
    );
  }
  const h = (c.req.header('X-Setup-Secret') || '').trim();
  if (h !== secret) {
    return c.json({ error: 'Geçersiz kurulum anahtarı', code: 'SETUP_SECRET_MISMATCH' }, 403);
  }
  return null;
}

/** Kayıt / giriş / Electron girişi için IP başına sınırlama (bellek, tek süreç). */
export async function rateLimitPublic(
  bucket: string,
  ipAddress: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; resetAt: number }> {
  const b = String(bucket || 'default').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const ip = String(ipAddress || 'unknown').slice(0, 200);
  const key = `${b}:${ip}`;
  const now = Date.now();
  pruneRateState(now, windowMs);

  const state = rateState.get(key) ?? null;
  if (!state) {
    rateState.set(key, { count: 1, windowStart: now });
    return { allowed: true, resetAt: now + windowMs };
  }
  if (now - state.windowStart >= windowMs) {
    rateState.set(key, { count: 1, windowStart: now });
    return { allowed: true, resetAt: now + windowMs };
  }
  if (state.count >= maxRequests) {
    return { allowed: false, resetAt: state.windowStart + windowMs };
  }
  rateState.set(key, { count: state.count + 1, windowStart: state.windowStart });
  return { allowed: true, resetAt: state.windowStart + windowMs };
}
