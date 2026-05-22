/**
 * JWT access token — DB'de jti ile kullanıcıya bağlı, istek başına tek kullanım + rotasyon.
 */
import { SignJWT, jwtVerify } from 'npm:jose@5';
import { getSql } from './pg_client.ts';
import { cacheDel, cacheGet, cacheSet } from './cache/index.ts';

const JWT_TTL_MS = 24 * 60 * 60 * 1000;

function getSecret(): Uint8Array {
  const s = (Deno.env.get('JWT_SECRET') || '').trim();
  return new TextEncoder().encode(s || 'dev-only-change-JWT_SECRET-in-production');
}

export function looksLikeJwt(token: string): boolean {
  const parts = String(token ?? '').split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

export type JwtRotateResult =
  | { ok: true; sub: string; username: string; newToken: string }
  | { ok: false; errorCode: 'TOKEN_INVALID' | 'TOKEN_ALREADY_USED' | 'TOKEN_LEGACY' };

export async function registerJwtSession(
  userId: string,
  username: string,
  meta?: { ipAddress?: string; userAgent?: string },
): Promise<string> {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + JWT_TTL_MS);
  const s = getSql();
  await s`
    INSERT INTO jwt_access_sessions (jti, user_id, expires_at, ip_address, user_agent)
    VALUES (
      ${jti}::uuid,
      ${userId}::uuid,
      ${expiresAt.toISOString()},
      ${meta?.ipAddress ?? null},
      ${meta?.userAgent ?? null}
    )
  `;
  return await new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret());
}

/** İmza doğrula, jti'yi tüket, yeni JWT üret */
export async function verifyAndRotateAccessToken(
  token: string,
  meta?: { ipAddress?: string; userAgent?: string },
): Promise<JwtRotateResult> {
  let payload: { sub?: string; username?: string; jti?: string };
  try {
    const { payload: p } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    payload = p as typeof payload;
  } catch {
    return { ok: false, errorCode: 'TOKEN_INVALID' };
  }

  const sub = payload.sub;
  const jti = payload.jti;
  if (!sub || typeof sub !== 'string') {
    return { ok: false, errorCode: 'TOKEN_INVALID' };
  }
  if (!jti || typeof jti !== 'string') {
    return { ok: false, errorCode: 'TOKEN_LEGACY' };
  }

  const username =
    typeof payload.username === 'string'
      ? payload.username
      : typeof (payload as { email?: string }).email === 'string'
        ? (payload as { email: string }).email
        : '';

  const s = getSql();
  const newJti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + JWT_TTL_MS);

  const consumed = await s`
    UPDATE jwt_access_sessions
    SET consumed_at = NOW(), replaced_by_jti = ${newJti}::uuid
    WHERE jti = ${jti}::uuid
      AND user_id = ${sub}::uuid
      AND consumed_at IS NULL
      AND expires_at > NOW()
    RETURNING jti
  `;

  if (!consumed.length) {
    return { ok: false, errorCode: 'TOKEN_ALREADY_USED' };
  }

  await invalidateJwtActiveCache(jti);

  await s`
    INSERT INTO jwt_access_sessions (jti, user_id, expires_at, ip_address, user_agent)
    VALUES (
      ${newJti}::uuid,
      ${sub}::uuid,
      ${expiresAt.toISOString()},
      ${meta?.ipAddress ?? null},
      ${meta?.userAgent ?? null}
    )
  `;

  const newToken = await new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setJti(newJti)
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret());

  return { ok: true, sub, username, newToken };
}

const JWT_ACTIVE_CACHE_SEC = Math.min(
  120,
  Math.max(15, parseInt(Deno.env.get('JWT_ACTIVE_CACHE_SEC') || '45', 10) || 45),
);

/** Sadece doğrulama — tüketmez; Redis/bellek ile DB yükü azaltılır */
export async function verifyAccessTokenActive(
  token: string,
): Promise<{ sub: string; username: string } | null> {
  let payload: { sub?: string; username?: string; jti?: string };
  try {
    const { payload: p } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    payload = p as typeof payload;
  } catch {
    return null;
  }
  const sub = payload.sub;
  const jti = payload.jti;
  if (!sub || !jti) return null;

  const cacheKey = `jwt:active:${jti}`;
  const hit = await cacheGet(cacheKey);
  if (hit === '1') {
    const username = typeof payload.username === 'string' ? payload.username : '';
    return { sub, username };
  }

  const s = getSql();
  const rows = await s`
    SELECT 1 FROM jwt_access_sessions
    WHERE jti = ${jti}::uuid
      AND user_id = ${sub}::uuid
      AND consumed_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  `;
  if (!rows.length) return null;

  const username = typeof payload.username === 'string' ? payload.username : '';
  await cacheSet(cacheKey, '1', JWT_ACTIVE_CACHE_SEC);
  return { sub, username };
}

export async function invalidateJwtActiveCache(jti: string): Promise<void> {
  await cacheDel(`jwt:active:${jti}`);
}

/** Çıkış: jti tüketilir, yeni JWT üretilmez */
export async function revokeJwtSessionByToken(token: string): Promise<boolean> {
  let payload: { sub?: string; jti?: string };
  try {
    const { payload: p } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    payload = p as typeof payload;
  } catch {
    return false;
  }
  const sub = payload.sub;
  const jti = payload.jti;
  if (!sub || !jti) return false;

  const s = getSql();
  const rows = await s`
    UPDATE jwt_access_sessions
    SET consumed_at = COALESCE(consumed_at, NOW())
    WHERE jti = ${jti}::uuid
      AND user_id = ${sub}::uuid
      AND consumed_at IS NULL
    RETURNING jti
  `;
  return rows.length > 0;
}

export async function revokeAllJwtSessionsForUser(userId: string): Promise<number> {
  const uid = String(userId ?? '').trim();
  if (!uid) return 0;
  const s = getSql();
  const rows = await s`
    UPDATE jwt_access_sessions
    SET consumed_at = COALESCE(consumed_at, NOW())
    WHERE user_id = ${uid}::uuid AND consumed_at IS NULL
    RETURNING jti
  `;
  return rows.length;
}

/** Süresi dolmuş ve tüketilmiş eski JWT oturum kayıtlarını temizle */
export async function purgeExpiredJwtSessions(): Promise<number> {
  const s = getSql();
  const rows = await s`
    DELETE FROM jwt_access_sessions
    WHERE expires_at < NOW()
       OR (
         consumed_at IS NOT NULL
         AND consumed_at < NOW() - INTERVAL '3 days'
       )
    RETURNING jti
  `;
  return rows.length;
}
