/**
 * Favoriler ve dosya istekleri API
 */
import type { Hono } from 'npm:hono';
import * as jwtAuth from './auth_jwt.tsx';
import * as security from './security_middleware.tsx';
import { getSql } from './pg_client.ts';
import { getFileById } from './postgresql_helpers.tsx';

async function resolveUserId(c: any): Promise<string | null> {
  const accessToken = c.req.header('Authorization')?.split(' ')[1];
  if (!accessToken) return null;

  const method = (c.req.method || 'GET').toUpperCase();
  const isRead = method === 'GET' || method === 'HEAD';
  const hardwareId = c.req.header('X-Hardware-ID');

  if (hardwareId) {
    if (isRead) {
      const sec = await security.validateSecureSessionActive(c);
      if (sec.valid && sec.user && typeof sec.user === 'object' && 'id' in sec.user) {
        return String((sec.user as { id: string }).id);
      }
    } else {
      const secure = await security.getUserFromSecureToken(accessToken, {
        hardwareId,
        signatureHeaders: security.readDeviceSignatureHeaders(c),
        method: c.req.method,
        path: c.req.path,
      });
      if (secure.success && secure.userId) {
        if (secure.newToken) c.header('X-New-Token', secure.newToken);
        return secure.userId;
      }
    }
  }

  if (jwtAuth.looksLikeJwt(accessToken)) {
    if (isRead) {
      const active = await jwtAuth.verifyAccessTokenActive(accessToken);
      if (active) return active.sub;
    } else {
      const active = await jwtAuth.verifyAccessTokenActive(accessToken);
      if (active) return active.sub;
    }
  }

  if (!isRead) {
    const sec = await security.validateSecureRequest(c);
    if (sec.valid && sec.user && typeof sec.user === 'object' && 'id' in sec.user) {
      if (sec.newToken) c.header('X-New-Token', sec.newToken);
      return String((sec.user as { id: string }).id);
    }
  }

  return null;
}

export function setupUserFeaturesEndpoints(app: Hono) {
  app.get('/make-server-47081311/favorites', async (c) => {
    try {
      const userId = await resolveUserId(c);
      if (!userId) return c.json({ error: 'Giriş gerekli', errorCode: 'LOGIN_REQUIRED' }, 401);

      const s = getSql();
      const rows = await s`
        SELECT file_id, file_name, file_meta, created_at
        FROM user_favorites
        WHERE user_id = ${userId}::uuid
        ORDER BY created_at DESC
      `;

      const favorites = await Promise.all(
        rows.map(async (r: {
          file_id: string;
          file_name: string | null;
          file_meta: unknown;
          created_at: string;
        }) => {
          const meta =
            r.file_meta && typeof r.file_meta === 'object' && !Array.isArray(r.file_meta)
              ? (r.file_meta as Record<string, unknown>)
              : {};
          const file = await getFileById(String(r.file_id));
          return {
            fileId: String(r.file_id),
            fileName: r.file_name || file?.name || null,
            meta,
            driveFileId: file?.driveFileId ?? null,
            googleDriveLink: file?.googleDriveLink ?? '',
            driveWebViewUrl: file?.driveWebViewUrl ?? '',
            createdAt: r.created_at,
          };
        }),
      );

      return c.json({
        favorites,
        fileIds: favorites.map((f) => f.fileId),
      });
    } catch (e) {
      console.error('favorites GET:', e);
      return c.json({ error: 'Favoriler yüklenemedi' }, 500);
    }
  });

  app.post('/make-server-47081311/favorites/toggle', async (c) => {
    try {
      const userId = await resolveUserId(c);
      if (!userId) return c.json({ error: 'Giriş gerekli', errorCode: 'LOGIN_REQUIRED' }, 401);

      const body = await c.req.json();
      const fileId = String(body.fileId ?? '').trim();
      if (!fileId) return c.json({ error: 'Dosya kimliği gerekli' }, 400);

      const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
      const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};

      const s = getSql();
      const existing = await s`
        SELECT 1 FROM user_favorites
        WHERE user_id = ${userId}::uuid AND file_id = ${fileId}
        LIMIT 1
      `;

      if (existing.length) {
        await s`
          DELETE FROM user_favorites
          WHERE user_id = ${userId}::uuid AND file_id = ${fileId}
        `;
        return c.json({ success: true, favorited: false, fileId });
      }

      await s`
        INSERT INTO user_favorites (user_id, file_id, file_name, file_meta)
        VALUES (${userId}::uuid, ${fileId}, ${fileName || null}, ${JSON.stringify(meta)}::jsonb)
        ON CONFLICT (user_id, file_id) DO UPDATE SET
          file_name = COALESCE(EXCLUDED.file_name, user_favorites.file_name),
          file_meta = EXCLUDED.file_meta
      `;
      return c.json({ success: true, favorited: true, fileId });
    } catch (e) {
      console.error('favorites toggle:', e);
      return c.json({ error: 'Favori güncellenemedi' }, 500);
    }
  });

  app.post('/make-server-47081311/file-requests', async (c) => {
    try {
      const userId = await resolveUserId(c);
      if (!userId) return c.json({ error: 'Giriş gerekli', errorCode: 'LOGIN_REQUIRED' }, 401);

      const body = await c.req.json();
      const title = String(body.title ?? '').trim();
      const description = String(body.description ?? '').trim();
      const brandHint = typeof body.brandHint === 'string' ? body.brandHint.trim() : '';

      if (title.length < 3) {
        return c.json({ error: 'Başlık en az 3 karakter olmalı' }, 400);
      }
      if (description.length < 10) {
        return c.json({ error: 'Açıklama en az 10 karakter olmalı' }, 400);
      }

      const s = getSql();
      const id = crypto.randomUUID();
      await s`
        INSERT INTO file_requests (id, user_id, title, description, brand_hint, status)
        VALUES (${id}::uuid, ${userId}::uuid, ${title}, ${description}, ${brandHint || null}, 'pending')
      `;
      return c.json({ success: true, id });
    } catch (e) {
      console.error('file-requests:', e);
      return c.json({ error: 'İstek gönderilemedi' }, 500);
    }
  });

  app.get('/make-server-47081311/file-requests/mine', async (c) => {
    try {
      const userId = await resolveUserId(c);
      if (!userId) return c.json({ error: 'Giriş gerekli', errorCode: 'LOGIN_REQUIRED' }, 401);

      const s = getSql();
      const rows = await s`
        SELECT id, title, description, brand_hint, status, created_at
        FROM file_requests
        WHERE user_id = ${userId}::uuid
        ORDER BY created_at DESC
        LIMIT 50
      `;
      return c.json({
        requests: rows.map(
          (r: {
            id: string;
            title: string;
            description: string;
            brand_hint: string | null;
            status: string;
            created_at: string;
          }) => ({
            id: r.id,
            title: r.title,
            description: r.description,
            brandHint: r.brand_hint,
            status: r.status,
            createdAt: r.created_at,
          }),
        ),
      });
    } catch (e) {
      console.error('file-requests mine:', e);
      return c.json({ error: 'İstekler yüklenemedi' }, 500);
    }
  });
}
