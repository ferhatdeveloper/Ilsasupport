/**
 * Tek kullanımlık token oturumları (Electron + web secure mode)
 */
import * as kv from './kv_store.tsx';
import * as deviceSig from './device_signature.tsx';
import * as db from './db_helpers.tsx';

export type SessionData = {
  sessionId: string;
  userId: string;
  accessToken?: string;
  hardwareId?: string | null;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  lastActivity: string;
  expiresAt: string;
  isValid: boolean;
  tokenHash?: string;
  usageCount?: number;
};

export type SecurityContext = {
  hardwareId?: string | null;
  devicePublicKey?: string | null;
  ipAddress: string;
  userAgent: string;
  fingerprint: string;
  timestamp: number;
};

export function readDeviceSignatureHeaders(c: {
  req: { header: (name: string) => string | undefined };
}): deviceSig.DeviceSignatureHeaders {
  return {
    signature: c.req.header('X-Device-Signature') || c.req.header('x-device-signature'),
    timestamp: c.req.header('X-Device-Timestamp') || c.req.header('x-device-timestamp'),
    purpose: c.req.header('X-Device-Purpose') || c.req.header('x-device-purpose'),
  };
}

const SESSION_TTL_MS = 60 * 60 * 1000;
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const ipAnomalyMap = new Map<string, { ips: Set<string>; windowStart: number }>();

export function generateOneTimeToken(): string {
  return `${crypto.randomUUID()}.${crypto.randomUUID().replace(/-/g, '')}`;
}

export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateFingerprint(ctx: SecurityContext): string {
  const raw = `${ctx.hardwareId ?? ''}|${ctx.userAgent}|${ctx.ipAddress}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
  return `fp_${Math.abs(h)}`;
}

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; resetAt: number }> {
  const now = Date.now();
  const state = rateLimitMap.get(key);
  if (!state || now - state.windowStart >= windowMs) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return { allowed: true, resetAt: now + windowMs };
  }
  if (state.count >= maxRequests) {
    return { allowed: false, resetAt: state.windowStart + windowMs };
  }
  state.count++;
  return { allowed: true, resetAt: state.windowStart + windowMs };
}

export async function detectIPAnomaly(userId: string, ipAddress: string): Promise<boolean> {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  let entry = ipAnomalyMap.get(userId);
  if (!entry || now - entry.windowStart >= windowMs) {
    entry = { ips: new Set([ipAddress]), windowStart: now };
    ipAnomalyMap.set(userId, entry);
    return false;
  }
  entry.ips.add(ipAddress);
  return entry.ips.size > 5;
}

/** Güvenlik olaylarını loglar */
export async function logSecurityEvent(event: {
  userId?: string;
  eventType: string;
  severity: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  timestamp?: string;
}): Promise<void> {
  console.log('[security]', event.severity, event.eventType, {
    userId: event.userId,
    ip: event.ipAddress,
    at: event.timestamp ?? new Date().toISOString(),
    ...event.details,
  });
}

export async function createSecureSession(
  userId: string,
  accessToken: string,
  ctx: SecurityContext,
): Promise<{ sessionId: string; oneTimeToken: string }> {
  const sessionId = crypto.randomUUID();
  const oneTimeToken = generateOneTimeToken();
  const tokenHash = await hashToken(oneTimeToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const session: SessionData = {
    sessionId,
    userId,
    accessToken,
    hardwareId: ctx.hardwareId ?? null,
    devicePublicKey: ctx.devicePublicKey ?? null,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    createdAt: now.toISOString(),
    lastActivity: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    isValid: true,
    tokenHash,
    usageCount: 0,
  };

  await kv.set(`session:${userId}:${sessionId}`, session);
  await kv.set(`session:token:${tokenHash}`, { sessionId, userId });

  return { sessionId, oneTimeToken };
}

/** Aynı bearer ile eşzamanlı isteklerde çift rotate → TOKEN_INVALID önlenir */
const rotateInflight = new Map<
  string,
  Promise<{ valid: boolean; newToken?: string; error?: string }>
>();

async function rotateTokenOnce(
  tokenHash: string,
  _ctx: SecurityContext,
): Promise<{ valid: boolean; newToken?: string; error?: string }> {
  const tokenLookup = await kv.get(`session:token:${tokenHash}`);
  if (!tokenLookup) {
    return { valid: false, error: 'Token geçersiz veya zaten kullanıldı' };
  }

  const { sessionId, userId } = tokenLookup;
  const sessionKey = `session:${userId}:${sessionId}`;
  const session: SessionData = await kv.get(sessionKey);

  if (!session || !session.isValid) {
    return { valid: false, error: 'Session geçersiz' };
  }
  if (new Date(session.expiresAt) < new Date()) {
    await kv.del(sessionKey);
    await kv.del(`session:token:${tokenHash}`);
    return { valid: false, error: 'Session süresi doldu' };
  }

  await kv.del(`session:token:${tokenHash}`);

  const newToken = generateOneTimeToken();
  const newHash = await hashToken(newToken);
  session.tokenHash = newHash;
  session.lastActivity = new Date().toISOString();
  session.usageCount = (session.usageCount ?? 0) + 1;
  await kv.set(sessionKey, session);
  await kv.set(`session:token:${newHash}`, { sessionId, userId });

  return { valid: true, newToken };
}

export async function rotateToken(
  tokenHash: string,
  ctx: SecurityContext,
): Promise<{ valid: boolean; newToken?: string; error?: string }> {
  const existing = rotateInflight.get(tokenHash);
  if (existing) return existing;

  const work = rotateTokenOnce(tokenHash, ctx).finally(() => {
    setTimeout(() => rotateInflight.delete(tokenHash), 2000);
  });
  rotateInflight.set(tokenHash, work);
  return work;
}

export async function invalidateSession(userId: string, sessionId: string): Promise<void> {
  const sessionKey = `session:${userId}:${sessionId}`;
  const session: SessionData = await kv.get(sessionKey);
  if (session?.tokenHash) {
    await kv.del(`session:token:${session.tokenHash}`);
  }
  await kv.del(sessionKey);
}

async function assertSessionDeviceSignature(
  session: SessionData,
  userId: string,
  opts: {
    headers: deviceSig.DeviceSignatureHeaders;
    method: string;
    path: string;
    bearerToken: string;
  },
): Promise<
  | { ok: true }
  | { ok: false; error: string; errorCode: 'DEVICE_SIGNATURE_REQUIRED' | 'DEVICE_SIGNATURE_INVALID' }
> {
  const boundKey = session.devicePublicKey?.trim();
  if (!boundKey) {
    return {
      ok: false,
      error:
        'Eski oturum kaydı geçersiz. Portable uygulamayı kapatıp yeniden açın ve tekrar giriş yapın.',
      errorCode: 'DEVICE_SESSION_UPGRADE',
    };
  }
  return await deviceSig.assertDeviceSignature({
    userId,
    devicePublicKey: boundKey,
    headers: opts.headers,
    expectedPurpose: 'API',
    method: opts.method,
    path: opts.path,
    bearerToken: opts.bearerToken,
  });
}

/** Masaüstü oturumunda kayıtlı donanım zorunlu — başlık yoksa veya uyuşmuyorsa reddet */
function assertSessionHardware(
  session: SessionData,
  hardwareId: string | undefined,
): { ok: true } | { ok: false; error: string; errorCode: 'HARDWARE_MISMATCH' } {
  const bound = session.hardwareId?.trim();
  if (!bound) return { ok: true };
  const received = (hardwareId ?? '').trim();
  if (!received || received !== bound) {
    return {
      ok: false,
      error:
        'Bu oturum yalnızca kayıtlı cihazdan kullanılabilir. Başka bilgisayardan token kopyalanmış olabilir.',
      errorCode: 'HARDWARE_MISMATCH',
    };
  }
  return { ok: true };
}

/** Kullanıcının tüm secure + web oturum kayıtlarını sil */
export async function revokeAllSessionsForUser(userId: string): Promise<number> {
  const uid = String(userId ?? '').trim();
  if (!uid) return 0;
  const prefix = `session:${uid}:`;
  const entries = await kv.getByPrefix(prefix);
  let removed = 0;
  for (const entry of entries) {
    const key = String(entry?.key ?? '');
    if (!key.startsWith(prefix) || key.startsWith('session:token:')) continue;
    const sessionId = key.slice(prefix.length);
    if (!sessionId) continue;
    await invalidateSession(uid, sessionId);
    removed++;
  }
  return removed;
}

/** Aynı donanımdan biriken eski oturumları temizle (yalnızca KV + SQL yedek kayıtları) */
export async function pruneStaleSessionsForHardware(
  userId: string,
  hardwareId: string,
  keepLatest = 1,
): Promise<number> {
  const uid = String(userId ?? '').trim();
  const hw = String(hardwareId ?? '').trim();
  if (!uid || !hw) return 0;

  const keep = Math.max(1, Math.floor(keepLatest));
  const prefix = `session:${uid}:`;
  const entries = await kv.getByPrefix(prefix);
  const matching: { key: string; sessionId: string; lastActivity: number }[] = [];

  for (const entry of entries) {
    const key = String(entry?.key ?? '');
    if (!key.startsWith(prefix) || key.startsWith('session:token:')) continue;
    const v = entry.value ?? {};
    const entryHw = v.hardwareId != null ? String(v.hardwareId).trim() : '';
    if (entryHw !== hw) continue;
    const sessionId = key.slice(prefix.length);
    const last = v.lastActivity ? new Date(String(v.lastActivity)).getTime() : 0;
    matching.push({ key, sessionId, lastActivity: last });
  }

  matching.sort((a, b) => b.lastActivity - a.lastActivity);
  const toRemove = matching.slice(keep);
  for (const row of toRemove) {
    await invalidateSession(uid, row.sessionId);
  }

  const sqlRows = await db.getAllSessionsForUser(uid);
  const sqlForHw = sqlRows
    .filter((r: { hardware_id?: string | null }) => r.hardware_id && String(r.hardware_id) === hw)
    .sort(
      (a: { last_activity?: string }, b: { last_activity?: string }) =>
        new Date(String(b.last_activity ?? 0)).getTime() -
        new Date(String(a.last_activity ?? 0)).getTime(),
    );
  for (const row of sqlForHw.slice(keep)) {
    await db.deleteSession(uid, String(row.device_id));
  }

  return toRemove.length + Math.max(0, sqlForHw.length - keep);
}

export async function validateSecureRequest(c: {
  req: {
    header: (name: string) => string | undefined;
    method?: string;
    path?: string;
  };
}): Promise<{
  valid: boolean;
  user?: unknown;
  session?: SessionData;
  newToken?: string;
  error?: string;
  errorCode?: string;
  statusCode?: number;
}> {
  try {
    const authHeader = c.req.header('Authorization');
    const hardwareId = c.req.header('X-Hardware-ID');
    const ipAddress = c.req.header('x-forwarded-for') ||
      c.req.header('cf-connecting-ip') ||
      'unknown';
    const userAgent = c.req.header('user-agent') || 'unknown';

    if (!authHeader) {
      return {
        valid: false,
        error: 'Authorization header gerekli',
        errorCode: 'NO_AUTH',
        statusCode: 401,
      };
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return {
        valid: false,
        error: 'Geçersiz Authorization format',
        errorCode: 'INVALID_AUTH_FORMAT',
        statusCode: 401,
      };
    }

    const ctx: SecurityContext = {
      hardwareId,
      ipAddress,
      userAgent,
      fingerprint: '',
      timestamp: Date.now(),
    };
    ctx.fingerprint = generateFingerprint(ctx);

    const tokenHash = await hashToken(token);
    const rotationResult = await rotateToken(tokenHash, ctx);

    if (!rotationResult.valid) {
      return {
        valid: false,
        error: rotationResult.error,
        errorCode: 'TOKEN_INVALID',
        statusCode: 401,
      };
    }

    const newTokenHash = await hashToken(rotationResult.newToken!);
    const tokenLookup = await kv.get(`session:token:${newTokenHash}`);
    if (!tokenLookup) {
      return {
        valid: false,
        error: 'Session lookup failed',
        errorCode: 'SESSION_NOT_FOUND',
        statusCode: 401,
      };
    }

    const { sessionId, userId } = tokenLookup;
    const session: SessionData = await kv.get(`session:${userId}:${sessionId}`);

    if (!session) {
      return {
        valid: false,
        error: 'Session not found',
        errorCode: 'SESSION_NOT_FOUND',
        statusCode: 401,
      };
    }

    const sigHeaders = readDeviceSignatureHeaders(c);
    const reqPath =
      c.req.path ||
      (() => {
        try {
          return new URL(c.req.url || '/', 'http://localhost').pathname;
        } catch {
          return '/';
        }
      })();
    const sigCheck = await assertSessionDeviceSignature(session, userId, {
      headers: sigHeaders,
      method: c.req.method || 'GET',
      path: reqPath,
      bearerToken: token,
    });
    if (!sigCheck.ok) {
      await logSecurityEvent({
        userId,
        eventType: sigCheck.errorCode,
        severity: 'critical',
        details: { sessionId, path: reqPath },
        ipAddress,
        timestamp: new Date().toISOString(),
      });
      await kv.del(`session:${userId}:${sessionId}`);
      await kv.del(`session:token:${newTokenHash}`);
      return {
        valid: false,
        error: sigCheck.error,
        errorCode: sigCheck.errorCode,
        statusCode: 403,
      };
    }

    const hwCheck = assertSessionHardware(session, hardwareId);
    if (!hwCheck.ok) {
      await logSecurityEvent({
        userId,
        eventType: 'HARDWARE_MISMATCH',
        severity: 'critical',
        details: {
          expected: session.hardwareId,
          received: hardwareId ?? null,
          sessionId,
        },
        ipAddress,
        timestamp: new Date().toISOString(),
      });
      await kv.del(`session:${userId}:${sessionId}`);
      await kv.del(`session:token:${newTokenHash}`);
      return {
        valid: false,
        error: hwCheck.error,
        errorCode: hwCheck.errorCode,
        statusCode: 403,
      };
    }

    if (session.ipAddress !== ipAddress) {
      const isAnomalous = await detectIPAnomaly(userId, ipAddress);
      if (isAnomalous) {
        await kv.del(`session:${userId}:${sessionId}`);
        await kv.del(`session:token:${newTokenHash}`);
        return {
          valid: false,
          error: 'Şüpheli aktivite tespit edildi.',
          errorCode: 'IP_ANOMALY',
          statusCode: 403,
        };
      }
      session.ipAddress = ipAddress;
      await kv.set(`session:${userId}:${sessionId}`, session);
    }

    const rateLimit = await checkRateLimit(`user:${userId}`, 100, 60 * 1000);
    if (!rateLimit.allowed) {
      return {
        valid: false,
        error: 'Rate limit aşıldı.',
        errorCode: 'RATE_LIMIT_EXCEEDED',
        statusCode: 429,
      };
    }

    const userData = await kv.get(`user:${userId}`);
    if (!userData) {
      return {
        valid: false,
        error: 'Kullanıcı bulunamadı',
        errorCode: 'USER_NOT_FOUND',
        statusCode: 404,
      };
    }

    return {
      valid: true,
      user: userData,
      session,
      newToken: rotationResult.newToken,
    };
  } catch (error) {
    console.error('Security validation error:', error);
    return {
      valid: false,
      error: 'Güvenlik doğrulama hatası',
      errorCode: 'VALIDATION_ERROR',
      statusCode: 500,
    };
  }
}

/** İndirme vb.: token tüketmeden secure oturum doğrula (Electron) */
export async function validateSecureSessionActive(c: {
  req: {
    header: (name: string) => string | undefined;
    method?: string;
    path?: string;
  };
}): Promise<{
  valid: boolean;
  user?: unknown;
  session?: SessionData;
  error?: string;
  errorCode?: string;
  statusCode?: number;
}> {
  try {
    const authHeader = c.req.header('Authorization');
    const hardwareId = c.req.header('X-Hardware-ID');
    const ipAddress = c.req.header('x-forwarded-for') ||
      c.req.header('cf-connecting-ip') ||
      'unknown';

    if (!authHeader) {
      return { valid: false, error: 'Authorization header gerekli', errorCode: 'NO_AUTH', statusCode: 401 };
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return { valid: false, error: 'Geçersiz Authorization format', errorCode: 'INVALID_AUTH_FORMAT', statusCode: 401 };
    }

    const tokenHash = await hashToken(token);
    const tokenLookup = await kv.get(`session:token:${tokenHash}`);
    if (!tokenLookup) {
      return { valid: false, error: 'Token geçersiz veya süresi dolmuş', errorCode: 'TOKEN_INVALID', statusCode: 401 };
    }

    const { sessionId, userId } = tokenLookup;
    const sessionKey = `session:${userId}:${sessionId}`;
    const session: SessionData = await kv.get(sessionKey);

    if (!session || !session.isValid) {
      return { valid: false, error: 'Session geçersiz', errorCode: 'SESSION_NOT_FOUND', statusCode: 401 };
    }
    if (new Date(session.expiresAt) < new Date()) {
      await kv.del(sessionKey);
      await kv.del(`session:token:${tokenHash}`);
      return { valid: false, error: 'Session süresi doldu', errorCode: 'TOKEN_INVALID', statusCode: 401 };
    }

    const reqPath =
      c.req.path ||
      (() => {
        try {
          return new URL(c.req.url || '/', 'http://localhost').pathname;
        } catch {
          return '/';
        }
      })();

    const sigHeaders = readDeviceSignatureHeaders(c);
    const sigCheck = await assertSessionDeviceSignature(session, userId, {
      headers: sigHeaders,
      method: c.req.method || 'GET',
      path: reqPath,
      bearerToken: token,
    });
    if (!sigCheck.ok) {
      return { valid: false, error: sigCheck.error, errorCode: sigCheck.errorCode, statusCode: 403 };
    }

    const hwCheck = assertSessionHardware(session, hardwareId);
    if (!hwCheck.ok) {
      return { valid: false, error: hwCheck.error, errorCode: hwCheck.errorCode, statusCode: 403 };
    }

    const userData = await kv.get(`user:${userId}`);
    if (!userData) {
      return { valid: false, error: 'Kullanıcı bulunamadı', errorCode: 'USER_NOT_FOUND', statusCode: 404 };
    }

    session.lastActivity = new Date().toISOString();
    await kv.set(sessionKey, session);

    return { valid: true, user: userData, session };
  } catch (error) {
    console.error('validateSecureSessionActive error:', error);
    return {
      valid: false,
      error: 'Güvenlik doğrulama hatası',
      errorCode: 'VALIDATION_ERROR',
      statusCode: 500,
    };
  }
}

export async function getUserFromSecureToken(
  token: string,
  opts?: {
    hardwareId?: string;
    signatureHeaders?: deviceSig.DeviceSignatureHeaders;
    method?: string;
    path?: string;
  },
): Promise<{
  success: boolean;
  userId?: string;
  userData?: unknown;
  newToken?: string;
  error?: string;
  errorCode?: string;
}> {
  const hardwareId = opts?.hardwareId;
  try {
    const tokenHash = await hashToken(token);
    const tokenLookup = await kv.get(`session:token:${tokenHash}`);

    if (!tokenLookup) {
      return { success: false, error: 'Token bulunamadı veya zaten kullanıldı' };
    }

    const { sessionId, userId } = tokenLookup;
    const sessionKey = `session:${userId}:${sessionId}`;
    const session: SessionData = await kv.get(sessionKey);

    if (!session || !session.isValid) {
      return { success: false, error: 'Session geçersiz' };
    }
    if (new Date(session.expiresAt) < new Date()) {
      await kv.del(sessionKey);
      return { success: false, error: 'Session expired' };
    }
    const sigCheck = await assertSessionDeviceSignature(session, userId, {
      headers: opts?.signatureHeaders ?? {},
      method: opts?.method ?? 'GET',
      path: opts?.path ?? '/',
      bearerToken: token,
    });
    if (!sigCheck.ok) {
      await kv.del(sessionKey);
      await kv.del(`session:token:${tokenHash}`);
      return { success: false, error: sigCheck.error, errorCode: sigCheck.errorCode };
    }

    const hwCheck = assertSessionHardware(session, hardwareId);
    if (!hwCheck.ok) {
      await kv.del(sessionKey);
      await kv.del(`session:token:${tokenHash}`);
      return { success: false, error: hwCheck.error, errorCode: hwCheck.errorCode };
    }

    await kv.del(`session:token:${tokenHash}`);

    const newToken = generateOneTimeToken();
    const newTokenHash = await hashToken(newToken);
    session.tokenHash = newTokenHash;
    session.lastActivity = new Date().toISOString();
    session.usageCount = (session.usageCount ?? 0) + 1;
    await kv.set(sessionKey, session);
    await kv.set(`session:token:${newTokenHash}`, { sessionId, userId });

    const userData = await kv.get(`user:${userId}`);
    return { success: true, userId, userData, newToken };
  } catch (error: unknown) {
    console.error('getUserFromSecureToken error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Token validation failed',
    };
  }
}
