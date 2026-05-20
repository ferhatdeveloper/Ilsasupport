/**
 * Web oturum varlığı — eşzamanlı giriş limiti ve sekme kapanma (beacon).
 */
import { getSql } from './pg_client.ts';
import { getSiteSettings } from './site_settings.tsx';

export async function countActiveWebSessions(userId: string): Promise<number> {
  const s = getSql();
  const rows = await s`
    SELECT COUNT(*)::int AS c FROM web_presence_sessions
    WHERE user_id = ${userId}::uuid AND ended_at IS NULL
      AND last_seen_at > NOW() - INTERVAL '15 minutes'
  `;
  return Number(rows[0]?.c ?? 0);
}

export async function canOpenWebSession(userId: string): Promise<{
  allowed: boolean;
  max: number;
  active: number;
}> {
  const settings = await getSiteSettings();
  const max = settings.web_max_concurrent_sessions;
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
