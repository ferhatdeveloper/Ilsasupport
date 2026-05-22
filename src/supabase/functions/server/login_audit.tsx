/**
 * Giriş denemeleri — kuyruk ile toplu yazma (ana istek beklemez).
 */
import { getSql } from './pg_client.ts';
import { enqueue, registerQueueHandler } from './queue/message_queue.ts';

export type LoginEventPayload = {
  userId?: string | null;
  username?: string | null;
  ipAddress: string;
  userAgent?: string;
  channel: 'web' | 'electron' | 'electron_secure';
  success: boolean;
  errorCode?: string | null;
  message?: string | null;
};

async function flushLoginEventsBatch(batch: LoginEventPayload[]): Promise<void> {
  if (batch.length === 0) return;
  const s = getSql();
  const rows = batch.map((opts) => ({
    user_id: opts.userId ? String(opts.userId) : null,
    username: opts.username ?? null,
    ip_address: String(opts.ipAddress || 'unknown').slice(0, 200),
    user_agent: opts.userAgent ?? null,
    channel: opts.channel,
    success: opts.success,
    error_code: opts.errorCode ?? null,
    message: opts.message ?? null,
  }));
  try {
    await s`
      INSERT INTO login_events ${s(
        rows,
        'user_id',
        'username',
        'ip_address',
        'user_agent',
        'channel',
        'success',
        'error_code',
        'message',
      )}
    `;
  } catch (e) {
    console.warn('[login_audit] batch insert, tek tek deneniyor:', e);
    for (const opts of batch) {
      try {
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
      } catch (inner) {
        console.warn('[login_audit] insert:', inner);
      }
    }
  }
}

export function initLoginAuditQueue(): void {
  registerQueueHandler('login_event', async (payload) => {
    await flushLoginEventsBatch([payload as LoginEventPayload]);
  });
}

/** Tek yol: kuyruk (RabbitMQ veya bellek içi yedek) — çift INSERT yok */
export function logLoginEvent(opts: LoginEventPayload): void {
  enqueue('login_event', opts as unknown as Record<string, unknown>);
}

export async function getIpLoginSummary(limit = 50): Promise<
  Array<{
    ipAddress: string;
    userCount: number;
    usernames: string[];
    lastAt: string;
    location?: string;
    country?: string;
    city?: string;
    isp?: string;
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
  const base = (rows || []).map((r: {
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

  const { resolveManyIpLocations } = await import('./ip_geolocation.tsx');
  const locMap = await resolveManyIpLocations(base.map((b) => b.ipAddress));
  return base.map((b) => {
    const loc = locMap.get(b.ipAddress);
    return {
      ...b,
      location: loc?.label,
      country: loc?.country,
      city: loc?.city,
      isp: loc?.isp,
    };
  });
}

export async function getRecentLoginsWithGeo(limit = 25): Promise<
  Array<{
    id: string;
    username: string | null;
    ipAddress: string;
    channel: string;
    success: boolean;
    createdAt: string;
    location: string;
  }>
> {
  const s = getSql();
  const rows = await s`
    SELECT id::text, username, ip_address, channel, success, created_at
    FROM login_events
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  const { resolveManyIpLocations } = await import('./ip_geolocation.tsx');
  const ips = (rows || []).map((r: { ip_address: string }) => r.ip_address);
  const locMap = await resolveManyIpLocations(ips);
  return (rows || []).map((r: {
    id: string;
    username: string | null;
    ip_address: string;
    channel: string;
    success: boolean;
    created_at: string;
  }) => ({
    id: r.id,
    username: r.username,
    ipAddress: r.ip_address,
    channel: r.channel,
    success: r.success,
    createdAt: r.created_at,
    location: locMap.get(r.ip_address)?.label || '—',
  }));
}
