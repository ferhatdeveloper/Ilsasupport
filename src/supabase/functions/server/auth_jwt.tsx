/**
 * JWT — HS256 + PostgreSQL jti (tek kullanımlık rotasyon).
 */
import {
  looksLikeJwt,
  registerJwtSession,
  revokeAllJwtSessionsForUser,
  revokeJwtSessionByToken,
  verifyAccessTokenActive,
  verifyAndRotateAccessToken,
  type JwtRotateResult,
} from './jwt_sessions.tsx';

export type { JwtRotateResult };

function isProductionLike(): boolean {
  const a = (Deno.env.get('ILSA_PRODUCTION') || '').trim().toLowerCase();
  if (a === '1' || a === 'true' || a === 'yes') return true;
  const n = (Deno.env.get('NODE_ENV') || '').trim().toLowerCase();
  return n === 'production';
}

export function assertJwtEnvironmentOrThrow(): void {
  if (!isProductionLike()) return;
  const s = (Deno.env.get('JWT_SECRET') || '').trim();
  if (!s) {
    throw new Error('ILSA_PRODUCTION=true veya NODE_ENV=production iken JWT_SECRET zorunludur.');
  }
}

export {
  looksLikeJwt,
  revokeAllJwtSessionsForUser,
  revokeJwtSessionByToken,
  verifyAndRotateAccessToken,
  verifyAccessTokenActive,
};

/** Yeni oturum: DB kaydı + JWT */
export async function signAccessToken(
  userId: string,
  username: string,
  meta?: { ipAddress?: string; userAgent?: string },
): Promise<string> {
  return await registerJwtSession(userId, username, meta);
}

/** @deprecated verifyAndRotateAccessToken veya verifyAccessTokenActive kullanın */
export async function verifyAccessToken(
  token: string,
): Promise<{ sub: string; username: string } | null> {
  return await verifyAccessTokenActive(token);
}
