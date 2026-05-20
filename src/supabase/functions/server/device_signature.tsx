/**
 * Ed25519 cihaz imzası — token çalınsa bile özel anahtar olmadan kullanılamaz.
 */
/** Saat kayması / VM senkron gecikmesi (DEVICE_SIGNATURE_INVALID şikayetleri) */
const MAX_SKEW_MS = 5 * 60 * 1000;
const NONCE_TTL_MS = 120_000;

/** LOGIN replay koruması — kv_store bu anahtarları desteklemez, bellek içi TTL */
const loginNonceUntil = new Map<string, number>();

function purgeExpiredLoginNonces(now = Date.now()): void {
  if (loginNonceUntil.size < 500) return;
  for (const [k, exp] of loginNonceUntil) {
    if (exp <= now) loginNonceUntil.delete(k);
  }
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function buildLoginSignatureMessage(
  username: string,
  hardwareId: string,
  timestampMs: string,
): string {
  return ['ILSA-v1', 'LOGIN', username, hardwareId, timestampMs].join('\n');
}

export function buildApiSignatureMessage(
  method: string,
  path: string,
  timestampMs: string,
  tokenSha256: string,
): string {
  return ['ILSA-v1', 'API', method.toUpperCase(), path, timestampMs, tokenSha256].join('\n');
}

export async function verifyEd25519Signature(
  publicKeySpkiBase64Url: string,
  message: string,
  signatureBase64Url: string,
): Promise<boolean> {
  try {
    const keyBytes = base64UrlToBytes(publicKeySpkiBase64Url.trim());
    const sigBytes = base64UrlToBytes(signatureBase64Url.trim());
    const key = await crypto.subtle.importKey(
      'spki',
      keyBytes,
      { name: 'Ed25519', namedCurve: 'Ed25519' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      sigBytes,
      new TextEncoder().encode(message),
    );
  } catch (e) {
    console.warn('[device_signature] verify failed:', e);
    return false;
  }
}

function consumeLoginNonce(userId: string, nonceKey: string): boolean {
  const k = `${userId}:${nonceKey}`;
  const now = Date.now();
  purgeExpiredLoginNonces(now);
  if (loginNonceUntil.has(k)) return false;
  loginNonceUntil.set(k, now + NONCE_TTL_MS);
  return true;
}

export type DeviceSignatureHeaders = {
  signature?: string;
  timestamp?: string;
  purpose?: string;
};

export async function assertDeviceSignature(opts: {
  userId: string;
  devicePublicKey: string;
  headers: DeviceSignatureHeaders;
  expectedPurpose: 'LOGIN' | 'API';
  method: string;
  path: string;
  bearerToken?: string;
  loginContext?: { username: string; hardwareId: string };
}): Promise<
  | { ok: true }
  | { ok: false; error: string; errorCode: 'DEVICE_SIGNATURE_REQUIRED' | 'DEVICE_SIGNATURE_INVALID' }
> {
  const sig = opts.headers.signature?.trim();
  const tsRaw = opts.headers.timestamp?.trim();
  if (!sig || !tsRaw) {
    return {
      ok: false,
      error: 'Cihaz imzası gerekli. Güncel masaüstü uygulaması ile giriş yapın.',
      errorCode: 'DEVICE_SIGNATURE_REQUIRED',
    };
  }

  const ts = Number(tsRaw);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    return {
      ok: false,
      error: 'Cihaz imzası süresi geçmiş veya saat uyumsuz.',
      errorCode: 'DEVICE_SIGNATURE_INVALID',
    };
  }

  const tsStr = String(Math.trunc(ts));
  let message: string;
  if (opts.expectedPurpose === 'LOGIN') {
    if (!opts.loginContext) {
      return { ok: false, error: 'Login imza bağlamı eksik', errorCode: 'DEVICE_SIGNATURE_INVALID' };
    }
    message = buildLoginSignatureMessage(
      opts.loginContext.username,
      opts.loginContext.hardwareId,
      tsStr,
    );
  } else {
    const token = opts.bearerToken?.trim();
    if (!token) {
      return { ok: false, error: 'Token eksik', errorCode: 'DEVICE_SIGNATURE_INVALID' };
    }
    const tokenSha = await sha256Hex(token);
    message = buildApiSignatureMessage(opts.method, opts.path, tsStr, tokenSha);
  }

  if (opts.expectedPurpose === 'LOGIN') {
    const nonceKey = await sha256Hex(`${sig.slice(0, 24)}|${tsStr}|LOGIN`);
    const nonceOk = consumeLoginNonce(opts.userId, nonceKey);
    if (!nonceOk) {
      return {
        ok: false,
        error: 'İmza tekrar kullanıldı (replay).',
        errorCode: 'DEVICE_SIGNATURE_INVALID',
      };
    }
  }

  const valid = await verifyEd25519Signature(opts.devicePublicKey, message, sig);
  if (!valid) {
    return {
      ok: false,
      error: 'Geçersiz cihaz imzası. Bu oturum bu bilgisayara bağlı değil.',
      errorCode: 'DEVICE_SIGNATURE_INVALID',
    };
  }

  return { ok: true };
}
