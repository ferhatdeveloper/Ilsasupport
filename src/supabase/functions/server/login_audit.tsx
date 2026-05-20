/**
 * Giriş denemeleri ve IP özeti.
 */
import { getSql } from './pg_client.ts';

export async function logLoginEvent(opts: {
  userId?: string | null;
  username?: string | null;
  ipAddress: string;
  userAgent?: string;
  channel: 'web' | 'electron' | 'electron_secure';
  success: boolean;
  errorCode?: string | null;
  message?: string | null;
}): Promise<void> {
  try {
    const s = getSql();
    await s`
      INSERT INTO login_events (user_id, username, ip_address, user_agent, channel, success, error_code, message)
      VALUES (
        ${opts.userId ? String(opts.userId) : null}::uuid,
        ${opts.username ?? null},
        ${String(opts.ipAddress || 'unknown').slice(0, 200)},
        ${opts.userAgent ?? null},
        ${opts.channel},
        ${opts.success},
        ${opts.errorCode ?? null},
        ${opts.message ?? null}
      )
    `;
  } catch (e) {
    console.warn('[login_audit] log failed:', e);
  }
}

export async function getIpLoginSummary(limit = 50): Promise<
  Array<{
    ipAddress: string;
    userCount: number;
    usernames: string[];
    lastAt: string;
  }>
> {
  const s = getSql();
  const rows = await s`
    SELECT
      ip_address,
      COUNT(DISTINCT COALESCE(user_id::text, username))::int AS user_count,
      array_agg(DISTINCT username) FILTER (WHERE username IS NOT NULL) AS usernames,
      MAX(created_at) AS last_at
    FROM login_events
    WHERE success = true
      AND ip_address IS NOT NULL
      AND ip_address != ''
      AND ip_address NOT IN ('unknown', '127.0.0.1', '::1')
    GROUP BY ip_address
    HAVING COUNT(DISTINCT COALESCE(user_id::text, username)) > 1
    ORDER BY user_count DESC, last_at DESC
    LIMIT ${limit}
  `;
  return (rows || []).map((r: {
    ip_address: string;
    user_count: number;
    usernames: string[] | null;
    last_at: string;
  }) => ({
    ipAddress: r.ip_address,
    userCount: Number(r.user_count),
    usernames: (r.usernames || []).filter(Boolean),
    lastAt: r.last_at,
  }));
}
