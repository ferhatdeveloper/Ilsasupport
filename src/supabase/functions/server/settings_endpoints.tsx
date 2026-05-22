/**
 * Site ayarları, web oturum varlığı, IP özeti, Electron hata logları.
 */
import { Hono } from 'npm:hono';
import * as jwtAuth from './auth_jwt.tsx';
import * as kv from './kv_store.tsx';
import * as db from './db_helpers.tsx';
import { getSql } from './pg_client.ts';
import {
  getSiteSettings,
  updateSiteSettings,
  bumpLastPublishedFileId,
  type SiteSettingsMap,
} from './site_settings.tsx';
import {
  canOpenWebSession,
  startWebPresence,
  touchWebPresence,
  endWebPresence,
  endStaleWebPresence,
  countActiveWebSessions,
  getGlobalOnlineSummary,
  adminKickWebPresence,
} from './web_presence.tsx';
import { logLoginEvent, getIpLoginSummary } from './login_audit.tsx';
import { requireAdmin } from './admin_endpoints.tsx';
import { effectiveMaxSessions } from './subscription_helpers.tsx';
import { getServerHealth } from './server_health.tsx';
import { resolveIpLocation } from './ip_geolocation.tsx';

function clientIp(c: { req: { header: (n: string) => string | undefined } }): string {
  const raw = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';
  return String(raw).split(',')[0].trim().slice(0, 200);
}

async function resolveUserFromBearer(c: {
  req: { header: (n: string) => string | undefined };
  json: (b: unknown, s?: number) => Response;
}): Promise<{ userId: string; userData: Record<string, unknown> } | Response> {
  const auth = c.req.header('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const payload = await jwtAuth.verifyAccessToken(token);
  if (!payload?.sub) return c.json({ error: 'Invalid token' }, 401);
  const userId = String(payload.sub);
  let userData = (await kv.get(`user:${userId}`)) as Record<string, unknown> | null;
  if (!userData) {
    const row = await db.getUserById(userId);
    if (!row) return c.json({ error: 'User not found' }, 401);
    userData = {
      id: row.id,
      username: row.username,
      role: row.role,
      plan: row.plan,
    };
  }
  return { userId, userData };
}

export function setupSettingsEndpoints(app: Hono): void {
  app.get('/make-server-47081311/public/health-scale', async (c) => {
    const { cacheBackend, cacheHealth } = await import('./cache/index.ts');
    const { queueBackend, getQueueHealth } = await import('./queue/message_queue.ts');
    const ch = await cacheHealth();
    const qh = getQueueHealth();
    return c.json({
      ok: true,
      cache: cacheBackend(),
      cacheConnected: ch.connected,
      queue: queueBackend(),
      queueConnected: qh.connected,
      queueConsumerActive: qh.consumerActive,
      queueMode: qh.mode,
      queuePendingMemoryJobs: qh.pendingMemoryJobs,
      pgPoolMax: Deno.env.get('PG_POOL_MAX') || '40',
      jwtRotateEveryRequest: (Deno.env.get('JWT_ROTATE_EVERY_REQUEST') || '0') === '1',
    });
  });

  app.get('/make-server-47081311/public/site-settings', async (c) => {
    try {
      const s = await getSiteSettings();
      return c.json({
        loginMode: s.login_mode,
        webMaxConcurrentSessions: s.web_max_concurrent_sessions,
        webSessionHeartbeatSeconds: s.web_session_heartbeat_seconds,
        notifyNewFileToast: s.notify_new_file_toast,
        fileRowAdminActionsEnabled: !!s.file_row_admin_actions_enabled,
      });
    } catch (e) {
      console.error('[public/site-settings]', e);
      return c.json({ error: 'Ayarlar yüklenemedi' }, 500);
    }
  });

  app.get('/make-server-47081311/public/new-file-poll', async (c) => {
    try {
      const auth = await resolveUserFromBearer(c);
      if (auth instanceof Response) return auth;
      const settings = await getSiteSettings();
      if (!settings.notify_new_file_toast) {
        return c.json({ hasNew: false, lastFileId: settings.last_published_file_id });
      }
      const since = Math.max(0, parseInt(c.req.query('sinceId') || '0', 10));
      const last = settings.last_published_file_id;
      if (last <= since) {
        return c.json({ hasNew: false, lastFileId: last });
      }
      const sql = getSql();
      const rows = await sql`
        SELECT id, adi FROM bilgi WHERE id = ${last} LIMIT 1
      `;
      const file = rows[0];
      return c.json({
        hasNew: true,
        lastFileId: last,
        file: file
          ? { id: Number(file.id), name: String(file.adi || '') }
          : { id: last, name: 'Yeni dosya' },
      });
    } catch (e) {
      console.error('[new-file-poll]', e);
      return c.json({ error: 'Poll başarısız' }, 500);
    }
  });

  app.post('/make-server-47081311/web-presence/start', async (c) => {
    try {
      const auth = await resolveUserFromBearer(c);
      if (auth instanceof Response) return auth;
      const body = await c.req.json().catch(() => ({}));
      const sessionKey = String(body.sessionKey || '').trim();
      if (!sessionKey || sessionKey.length > 120) {
        return c.json({ error: 'sessionKey gerekli' }, 400);
      }
      const gate = await canOpenWebSession(auth.userId, effectiveMaxSessions(auth.userData));
      if (!gate.allowed) {
        return c.json({
          error: `Web oturum limiti (${gate.max}). Aktif: ${gate.active}. Çıkış yapmadan yeni sekme açılamaz.`,
          errorCode: 'WEB_PRESENCE_LIMIT',
          max: gate.max,
          active: gate.active,
        }, 403);
      }
      const id = await startWebPresence({
        userId: auth.userId,
        sessionKey,
        ipAddress: clientIp(c),
        userAgent: c.req.header('user-agent'),
        deviceId: body.deviceId ? String(body.deviceId) : undefined,
      });
      return c.json({ success: true, presenceId: id });
    } catch (e) {
      console.error('[web-presence/start]', e);
      return c.json({ error: 'Oturum başlatılamadı' }, 500);
    }
  });

  app.post('/make-server-47081311/web-presence/ping', async (c) => {
    try {
      const auth = await resolveUserFromBearer(c);
      if (auth instanceof Response) return auth;
      const body = await c.req.json().catch(() => ({}));
      const sessionKey = String(body.sessionKey || '').trim();
      if (!sessionKey) return c.json({ error: 'sessionKey gerekli' }, 400);
      await endStaleWebPresence();
      const ok = await touchWebPresence(sessionKey, auth.userId);
      return c.json({ success: ok });
    } catch (e) {
      return c.json({ error: 'Ping başarısız' }, 500);
    }
  });

  app.post('/make-server-47081311/web-presence/end', async (c) => {
    try {
      let sessionKey = '';
      let userId = '';
      const auth = c.req.header('Authorization') || '';
      if (auth.startsWith('Bearer ')) {
        const resolved = await resolveUserFromBearer(c);
        if (!(resolved instanceof Response)) {
          userId = resolved.userId;
        }
      }
      const ct = c.req.header('content-type') || '';
      if (ct.includes('application/json')) {
        const body = await c.req.json().catch(() => ({}));
        sessionKey = String(body.sessionKey || '').trim();
        if (!userId && body.userId) userId = String(body.userId);
      } else {
        const raw = await c.req.text().catch(() => '');
        try {
          const body = JSON.parse(raw);
          sessionKey = String(body.sessionKey || '').trim();
          if (!userId && body.userId) userId = String(body.userId);
        } catch {
          /* ignore */
        }
      }
      if (!sessionKey || !userId) {
        return c.json({ success: false }, 400);
      }
      await endWebPresence(sessionKey, userId, String(c.req.query('reason') || 'client_end'));
      return c.json({ success: true });
    } catch {
      return c.json({ success: true });
    }
  });

  app.post('/make-server-47081311/electron-client-error', async (c) => {
    try {
      const body = await c.req.json();
      const message = String(body.message || body.error || '').trim().slice(0, 4000);
      if (!message) return c.json({ error: 'message gerekli' }, 400);
      let userId: string | null = null;
      let username: string | null = body.username ? String(body.username) : null;
      const auth = c.req.header('Authorization') || '';
      if (auth.startsWith('Bearer ')) {
        const payload = await jwtAuth.verifyAccessToken(auth.slice(7).trim());
        if (payload?.sub) userId = String(payload.sub);
      }
      const s = getSql();
      await s`
        INSERT INTO electron_client_errors (user_id, username, hardware_id, client_version, error_code, message, detail)
        VALUES (
          ${userId}::uuid,
          ${username},
          ${body.hardwareId ? String(body.hardwareId).slice(0, 200) : null},
          ${body.clientVersion ? String(body.clientVersion).slice(0, 64) : null},
          ${body.errorCode ? String(body.errorCode).slice(0, 120) : null},
          ${message},
          ${body.detail ? JSON.stringify(body.detail) : null}::jsonb
        )
      `;
      return c.json({ success: true });
    } catch (e) {
      console.error('[electron-client-error]', e);
      return c.json({ error: 'Kayıt başarısız' }, 500);
    }
  });

  app.get('/make-server-47081311/admin/settings', requireAdmin, async (c) => {
    try {
      const settings = await getSiteSettings();
      return c.json({ settings });
    } catch (e) {
      return c.json({ error: 'Ayarlar alınamadı' }, 500);
    }
  });

  app.put('/make-server-47081311/admin/settings', requireAdmin, async (c) => {
    try {
      const body = await c.req.json();
      const patch: Partial<SiteSettingsMap> = {};
      if (body.loginMode === 'web_allowed' || body.loginMode === 'electron_only') {
        patch.login_mode = body.loginMode;
      }
      if (body.login_mode === 'web_allowed' || body.login_mode === 'electron_only') {
        patch.login_mode = body.login_mode;
      }
      if (body.webMaxConcurrentSessions != null) {
        patch.web_max_concurrent_sessions = Number(body.webMaxConcurrentSessions);
      }
      if (body.web_max_concurrent_sessions != null) {
        patch.web_max_concurrent_sessions = Number(body.web_max_concurrent_sessions);
      }
      if (body.webSessionHeartbeatSeconds != null) {
        patch.web_session_heartbeat_seconds = Number(body.webSessionHeartbeatSeconds);
      }
      if (body.web_session_heartbeat_seconds != null) {
        patch.web_session_heartbeat_seconds = Number(body.web_session_heartbeat_seconds);
      }
      if (body.notifyNewFileToast != null) {
        patch.notify_new_file_toast = !!body.notifyNewFileToast;
      }
      if (body.notify_new_file_toast != null) {
        patch.notify_new_file_toast = !!body.notify_new_file_toast;
      }
      const settings = await updateSiteSettings(patch);
      return c.json({ success: true, settings });
    } catch (e) {
      return c.json({ error: 'Ayarlar kaydedilemedi' }, 500);
    }
  });

  app.get('/make-server-47081311/admin/login-ip-summary', requireAdmin, async (c) => {
    try {
      const summary = await getIpLoginSummary(80);
      return c.json({ summary });
    } catch (e) {
      return c.json({ error: 'IP özeti alınamadı' }, 500);
    }
  });

  app.get('/make-server-47081311/admin/server-health', requireAdmin, async (c) => {
    try {
      const health = await getServerHealth();
      return c.json({ health });
    } catch (e) {
      return c.json({ error: 'Sunucu durumu alınamadı' }, 500);
    }
  });

  app.get('/make-server-47081311/admin/ip-lookup', requireAdmin, async (c) => {
    try {
      const ip = c.req.query('ip') || '';
      const loc = await resolveIpLocation(ip);
      return c.json({ location: loc });
    } catch (e) {
      return c.json({ error: 'IP sorgusu başarısız' }, 500);
    }
  });

  app.get('/make-server-47081311/admin/web-presence', requireAdmin, async (c) => {
    try {
      await endStaleWebPresence();
      const s = getSql();
      const rows = await s`
        SELECT
          p.id::text,
          p.user_id::text,
          p.session_key,
          p.ip_address,
          p.user_agent,
          p.started_at,
          p.last_seen_at,
          p.end_reason,
          u.username,
          u.name
        FROM web_presence_sessions p
        LEFT JOIN users u ON u.id = p.user_id
        WHERE p.ended_at IS NULL
          AND p.last_seen_at > NOW() - INTERVAL '15 minutes'
        ORDER BY p.last_seen_at DESC
        LIMIT 200
      `;
      const { resolveManyIpLocations } = await import('./ip_geolocation.tsx');
      const ips = (rows || []).map((r: { ip_address: string }) => r.ip_address);
      const locMap = await resolveManyIpLocations(ips);
      const sessions = (rows || []).map((r: Record<string, unknown>) => ({
        ...r,
        location: locMap.get(String(r.ip_address || ''))?.label || '—',
      }));
      return c.json({ sessions });
    } catch (e) {
      return c.json({ error: 'Oturumlar alınamadı' }, 500);
    }
  });

  app.get('/make-server-47081311/admin/online-summary', requireAdmin, async (c) => {
    try {
      const online = await getGlobalOnlineSummary();
      return c.json({ online });
    } catch (e) {
      console.error('online-summary error:', e);
      return c.json({ error: 'Çevrimiçi özet alınamadı' }, 500);
    }
  });

  app.post('/make-server-47081311/admin/web-presence/:presenceId/kick', requireAdmin, async (c) => {
    try {
      const presenceId = c.req.param('presenceId');
      if (!presenceId) return c.json({ error: 'Oturum kimliği gerekli' }, 400);
      const result = await adminKickWebPresence(presenceId);
      if (!result.userId) return c.json({ error: 'Aktif oturum bulunamadı' }, 404);
      return c.json({ success: true, ...result });
    } catch (e) {
      console.error('web-presence kick error:', e);
      return c.json({ error: 'Oturum kapatılamadı' }, 500);
    }
  });

  app.get('/make-server-47081311/admin/electron-errors', requireAdmin, async (c) => {
    try {
      const limit = Math.min(200, Math.max(10, parseInt(c.req.query('limit') || '50', 10)));
      const s = getSql();
      const rows = await s`
        SELECT id::text, user_id::text, username, hardware_id, client_version,
               error_code, message, detail, created_at
        FROM electron_client_errors
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return c.json({ errors: rows || [] });
    } catch (e) {
      return c.json({ error: 'Hatalar alınamadı' }, 500);
    }
  });
}

export { bumpLastPublishedFileId, logLoginEvent, canOpenWebSession, startWebPresence };
