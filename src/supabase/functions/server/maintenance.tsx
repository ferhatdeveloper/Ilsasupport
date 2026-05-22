/**
 * Arka plan bakım — JWT oturum temizliği vb.
 */
import { purgeExpiredJwtSessions } from './jwt_sessions.tsx';

const PURGE_INTERVAL_MS = Math.min(
  24 * 60 * 60 * 1000,
  Math.max(60 * 60 * 1000, parseInt(Deno.env.get('JWT_PURGE_INTERVAL_MS') || String(6 * 60 * 60 * 1000), 10) || 6 * 60 * 60 * 1000),
);

let purgeTimer: number | null = null;

export async function runJwtSessionPurge(): Promise<number> {
  const n = await purgeExpiredJwtSessions();
  if (n > 0) console.log(`[maintenance] jwt_access_sessions silindi: ${n}`);
  return n;
}

/** Yalnızca schema-ensure worker'da (ILSA_RUN_SCHEMA_ENSURE≠0) çağırın */
export function scheduleJwtSessionPurge(): void {
  if (purgeTimer != null) return;
  purgeTimer = setInterval(() => {
    runJwtSessionPurge().catch((e) => console.warn('[maintenance] jwt purge:', e));
  }, PURGE_INTERVAL_MS);
}
