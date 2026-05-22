/**
 * Web oturum varlığı — eşzamanlı giriş limiti ve sekme kapanma (beacon).
 */
import { getSql } from './pg_client.ts';
import { getSiteSettings } from './site_settings.tsx';
import * as kv from './kv_store.tsx';

const ONLINE_WINDOW_MINUTES = 15;

export async function countActiveWebSessions(userId: string): Promise<number> {
  const s = getSql();
  const rows = await s`
    SELECT COUNT(*)::int AS c FROM web_presence_sessions
    WHERE user_id = ${userId}::uuid AND ended_at IS NULL
      AND last_seen_at > NOW() - INTERVAL '15 minutes'
  `;
  return Number(rows[0]?.c ?? 0);
}

export async function canOpenWebSession(
  userId: string,
  userMaxSessions?: number,
): Promise<{
  allowed: boolean;
  max: number;
  active: number;
}> {
  const settings = await getSiteSettings();
  const siteMax = Math.min(50, Math.max(1, Math.floor(settings.web_max_concurrent_sessions) || 1));
  const userMax =
    userMaxSessions != null && Number.isFinite(userMaxSessions)
      ? Math.min(50, Math.max(1, Math.floor(userMaxSessions)))
      : null;
  const max = userMax != null ? userMax : siteMax;
  const active = await countActiveWebSessions(userId);
  return { allowed: active < max, max, active };
}

export async function startWebPresence(opts: {
  userId: string;
  sessionKey: string;
  ipAddress: string;
  userAgent?: string;
  deviceId?: string;
}): Promise<string> {
  const s = getSql();
  const rows = await s`
    INSERT INTO web_presence_sessions (user_id, session_key, ip_address, user_agent, device_id)
    VALUES (
      ${opts.userId}::uuid,
      ${opts.sessionKey},
      ${opts.ipAddress},
      ${opts.userAgent ?? null},
      ${opts.deviceId ?? null}
    )
    RETURNING id::text
  `;
  return String(rows[0]?.id ?? '');
}

export async function touchWebPresence(sessionKey: string, userId: string): Promise<boolean> {
  const s = getSql();
  const rows = await s`
    UPDATE web_presence_sessions
    SET last_seen_at = NOW()
    WHERE session_key = ${sessionKey}
      AND user_id = ${userId}::uuid
      AND ended_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

export async function endWebPresence(
  sessionKey: string,
  userId: string,
  reason: string,
): Promise<void> {
  const s = getSql();
  await s`
    UPDATE web_presence_sessions
    SET ended_at = NOW(), end_reason = ${reason}
    WHERE session_key = ${sessionKey}
      AND user_id = ${userId}::uuid
      AND ended_at IS NULL
  `;
}

export async function endAllWebPresenceForUser(userId: string, reason: string): Promise<void> {
  const s = getSql();
  await s`
    UPDATE web_presence_sessions
    SET ended_at = NOW(), end_reason = ${reason}
    WHERE user_id = ${userId}::uuid AND ended_at IS NULL
  `;
}

export async function endStaleWebPresence(): Promise<number> {
  const settings = await getSiteSettings();
  const sec = settings.web_session_heartbeat_seconds;
  const s = getSql();
  const rows = await s`
    UPDATE web_presence_sessions
    SET ended_at = NOW(), end_reason = 'timeout'
    WHERE ended_at IS NULL
      AND last_seen_at < NOW() - (${sec * 3}::int * INTERVAL '1 second')
    RETURNING id
  `;
  return rows.length;
}

/** Admin panel — çevrimiçi kullanıcı / oturum özeti */
export async function getGlobalOnlineSummary(): Promise<{
  onlineUsers: number;
  webSessions: number;
  webUsers: number;
  kvSessions: number;
  sqlSessions: number;
  totalConnections: number;
}> {
  await endStaleWebPresence();
  const s = getSql();
  const window = `${ONLINE_WINDOW_MINUTES} minutes`;

  const webAgg = await s`
    SELECT
      COUNT(*)::int AS sessions,
      COUNT(DISTINCT user_id)::int AS users
    FROM web_presence_sessions
    WHERE ended_at IS NULL
      AND last_seen_at > NOW() - ${window}::interval
  `;
  const sqlAgg = await s`
    SELECT COUNT(*)::int AS sessions
    FROM sessions
    WHERE is_active = true
      AND last_activity > NOW() - ${window}::interval
  `;

  const webUserRows = await s`
    SELECT DISTINCT user_id::text AS uid
    FROM web_presence_sessions
    WHERE ended_at IS NULL
      AND last_seen_at > NOW() - ${window}::interval
  `;
  const sqlUserRows = await s`
    SELECT DISTINCT user_id::text AS uid
    FROM sessions
    WHERE is_active = true
      AND last_activity > NOW() - ${window}::interval
  `;

  const onlineUserIds = new Set<string>();
  for (const r of webUserRows || []) onlineUserIds.add(String(r.uid));
  for (const r of sqlUserRows || []) onlineUserIds.add(String(r.uid));

  const cutoff = Date.now() - ONLINE_WINDOW_MINUTES * 60 * 1000;
  let kvSessions = 0;
  const kvEntries = await kv.getByPrefix('session:');
  for (const entry of kvEntries) {
    const key = String(entry?.key ?? '');
    if (!key.startsWith('session:') || key.startsWith('session:token:')) continue;
    const parts = key.split(':');
    if (parts.length < 3) continue;
    const userId = parts[1];
    const val = entry.value as { lastActivity?: string } | undefined;
    const lastMs = val?.lastActivity ? new Date(val.lastActivity).getTime() : Date.now();
    if (lastMs < cutoff) continue;
    kvSessions++;
    onlineUserIds.add(userId);
  }

  const webSessions = Number(webAgg[0]?.sessions ?? 0);
  const webUsers = Number(webAgg[0]?.users ?? 0);
  const sqlSessions = Number(sqlAgg[0]?.sessions ?? 0);
  const totalConnections = webSessions + sqlSessions + kvSessions;

  return {
    onlineUsers: onlineUserIds.size,
    onlineUserIds: [...onlineUserIds],
    webSessions,
    webUsers,
    kvSessions,
    sqlSessions,
    totalConnections,
  };
}

/** Tek web oturumunu sonlandır (admin) */
export async function adminKickWebPresence(presenceId: string): Promise<{
  userId: string | null;
  sessionKey: string | null;
}> {
  const s = getSql();
  const rows = await s`
    SELECT user_id::text AS user_id, session_key
    FROM web_presence_sessions
    WHERE id = ${presenceId}::uuid AND ended_at IS NULL
    LIMIT 1
  `;
  if (!rows.length) return { userId: null, sessionKey: null };
  const userId = String(rows[0].user_id);
  const sessionKey = String(rows[0].session_key ?? '');
  await s`
    UPDATE web_presence_sessions
    SET ended_at = NOW(), end_reason = 'admin_kick'
    WHERE id = ${presenceId}::uuid AND ended_at IS NULL
  `;
  if (sessionKey) {
    await kv.del(sessionKey).catch(() => undefined);
  }
  return { userId, sessionKey: sessionKey || null };
}
