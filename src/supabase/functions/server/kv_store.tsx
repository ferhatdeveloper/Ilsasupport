/**
 * Geriye uyum: get/set/del/getByPrefix API’si korunur; veri ayrı PostgreSQL tablolarında tutulur
 * (kv_store_47081311 kullanılmaz).
 */
import { getSql } from './pg_client.ts';
import { canonicalLoginUsernameFromUserRow, normalizeLoginUsername } from './login_username.ts';

function ttlToExpires(ttlSeconds?: number): string | null {
  if (ttlSeconds == null || ttlSeconds <= 0) return null;
  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}

function deriveUsernameForPg(id: string, value: any): string {
  return canonicalLoginUsernameFromUserRow({
    id,
    username: value?.username,
    email: value?.email,
  });
}

/** legacy_profile: yalnızca value içinde gönderilen alanlar güncellenir (giriş/oturum expiresAt silmesin) */
function mergeLegacyProfile(
  prevLp: Record<string, unknown>,
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const lp = { ...prevLp };
  if (!value || typeof value !== 'object') return lp;
  if ('role' in value) lp.kvRole = value.role;
  if ('plan' in value) lp.kvPlan = value.plan;
  if ('maxSessions' in value) lp.maxSessions = value.maxSessions;
  if ('downloadLimit' in value) lp.downloadLimit = value.downloadLimit;
  if ('expiresAt' in value) lp.expiresAt = value.expiresAt;
  if ('downloadCount' in value) lp.downloadCount = value.downloadCount;
  if ('activeSessions' in value) lp.activeSessions = value.activeSessions;
  if ('lastLoginAt' in value) lp.lastLoginAt = value.lastLoginAt;
  if ('downloadsToday' in value) lp.downloadsToday = value.downloadsToday;
  if ('registeredDeviceId' in value) lp.registeredDeviceId = value.registeredDeviceId;
  if ('registeredAt' in value) lp.registeredAt = value.registeredAt;
  return lp;
}

function rowToKvUser(row: any): any {
  const lp = (row.legacy_profile && typeof row.legacy_profile === 'object') ? row.legacy_profile : {};
  const plan = row.plan || 'free';
  const isAdmin = row.role === 'admin' || plan === 'admin';
  const username =
    row.username != null && String(row.username).trim()
      ? normalizeLoginUsername(String(row.username))
      : deriveUsernameForPg(String(row.id), { email: row.email });
  return {
    id: row.id,
    username,
    email: row.email ?? null,
    name: row.name,
    role: isAdmin ? 'admin' : (lp.kvRole ?? row.role ?? 'user'),
    plan: isAdmin ? (lp.kvPlan ?? 'admin') : (lp.kvPlan ?? plan),
    maxSessions: lp.maxSessions ?? (isAdmin ? 10 : plan === 'premium' ? 3 : 1),
    downloadLimit: lp.downloadLimit ?? (plan === 'premium' || isAdmin ? -1 : 5),
    createdAt: row.created_at,
    expiresAt: lp.expiresAt ?? null,
    downloadCount: lp.downloadCount ?? 0,
    activeSessions: lp.activeSessions ?? 0,
    hardwareId: row.registered_hardware_id ?? lp.hardwareId ?? null,
    lastLoginAt: lp.lastLoginAt ?? null,
    dailyDownloads: row.daily_downloads ?? 0,
    lastDownloadReset: row.last_download_reset,
    downloadsToday: lp.downloadsToday ?? row.daily_downloads ?? 0,
    registeredDeviceId: lp.registeredDeviceId ?? null,
    registeredAt: row.registered_at ?? lp.registeredAt ?? null,
  };
}

async function userRowToKv(id: string): Promise<any | null> {
  const s = getSql();
  const rows = await s`SELECT * FROM users WHERE id = ${id}::uuid LIMIT 1`;
  const data = rows[0];
  return data ? rowToKvUser(data) : null;
}

async function upsertUserFromKv(id: string, value: any): Promise<void> {
  const s = getSql();
  const existingRows = await s`SELECT legacy_profile FROM users WHERE id = ${id}::uuid LIMIT 1`;
  const existing = existingRows[0];
  const prevLp =
    existing?.legacy_profile && typeof existing.legacy_profile === 'object'
      ? (existing.legacy_profile as Record<string, unknown>)
      : {};

  const roleCol = value?.role === 'admin' || value?.plan === 'admin' ? 'admin' : 'user';
  let planCol = 'free';
  if (value?.plan === 'premium' || value?.plan === 'admin') planCol = 'premium';
  if (value?.plan === 'free') planCol = 'free';

  const lp = mergeLegacyProfile(prevLp, value);

  const row = {
    id,
    username: deriveUsernameForPg(id, value),
    email:
      value?.email != null && String(value.email).trim() !== ''
        ? String(value.email).trim()
        : null,
    password_hash: value?.passwordHash ?? value?.password_hash ?? '',
    name: value?.name ?? '',
    role: roleCol,
    plan: planCol,
    registered_hardware_id: value?.hardwareId ?? value?.registered_hardware_id ?? null,
    registered_device_info: value?.registeredDeviceInfo ?? null,
    registered_at: value?.registeredAt ?? null,
    daily_downloads: value?.dailyDownloads ?? value?.daily_downloads ?? 0,
    last_download_reset: value?.lastDownloadReset ?? value?.last_download_reset ?? new Date().toISOString(),
    legacy_profile: lp,
  };

  await s`
    INSERT INTO users (
      id, username, email, password_hash, name, role, plan,
      registered_hardware_id, registered_device_info, registered_at,
      daily_downloads, last_download_reset, legacy_profile
    ) VALUES (
      ${row.id}::uuid,
      ${row.username},
      ${row.email},
      ${row.password_hash},
      ${row.name},
      ${row.role},
      ${row.plan},
      ${row.registered_hardware_id},
      ${row.registered_device_info as any},
      ${row.registered_at as any},
      ${row.daily_downloads},
      ${row.last_download_reset as any},
      ${s.json(row.legacy_profile as Record<string, unknown>)}
    )
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username,
      email = COALESCE(EXCLUDED.email, users.email),
      password_hash = CASE
        WHEN EXCLUDED.password_hash IS NOT NULL AND EXCLUDED.password_hash::text <> '' THEN EXCLUDED.password_hash
        ELSE users.password_hash
      END,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      plan = EXCLUDED.plan,
      registered_hardware_id = COALESCE(EXCLUDED.registered_hardware_id, users.registered_hardware_id),
      registered_device_info = COALESCE(EXCLUDED.registered_device_info, users.registered_device_info),
      registered_at = COALESCE(EXCLUDED.registered_at, users.registered_at),
      daily_downloads = EXCLUDED.daily_downloads,
      last_download_reset = EXCLUDED.last_download_reset,
      legacy_profile = EXCLUDED.legacy_profile,
      updated_at = NOW()
  `;
}

async function sessionRowToValue(row: any): Promise<any> {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  return {
    ...payload,
    key: `session:${row.user_id}:${row.device_id}`,
    userId: row.user_id,
    sessionId: row.device_id,
    accessToken: row.access_token_snapshot ?? payload.accessToken,
    hardwareId: row.hardware_id ?? payload.hardwareId,
    userAgent: row.user_agent ?? payload.userAgent,
    ip: row.ip_address ?? payload.ip,
    ipAddress: row.ip_address ?? payload.ipAddress,
    createdAt: row.created_at ?? payload.createdAt,
    lastActivity: row.last_activity ?? payload.lastActivity,
    expiresAt: row.expires_at ?? payload.expiresAt,
    isValid: payload.isValid !== false,
    tokenHash: payload.tokenHash,
    usageCount: payload.usageCount ?? 0,
    devicePublicKey: payload.devicePublicKey ?? null,
  };
}

export const set = async (key: string, value: any, ttlSeconds?: number): Promise<void> => {
  const s = getSql();
  const exp = ttlToExpires(ttlSeconds);

  if (key.startsWith('user:')) {
    const id = key.slice('user:'.length);
    await upsertUserFromKv(id, value);
    return;
  }

  if (key.startsWith('session:token:')) {
    const hash = key.slice('session:token:'.length);
    const userId = value?.userId;
    const sessionId = value?.sessionId ?? value?.deviceId;
    if (!userId || !sessionId) throw new Error('session:token requires userId and sessionId');
    await s`
      INSERT INTO session_token_lookup (token_hash, user_id, device_id)
      VALUES (${hash}, ${userId}::uuid, ${String(sessionId)})
      ON CONFLICT (token_hash) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        device_id = EXCLUDED.device_id
    `;
    return;
  }

  if (key.startsWith('session:') && !key.startsWith('session:token:')) {
    const rest = key.slice('session:'.length);
    const idx = rest.indexOf(':');
    if (idx < 0) throw new Error('Invalid session key');
    const userId = rest.slice(0, idx);
    const deviceId = rest.slice(idx + 1);
    const payload = { ...value };
    delete payload.key;
    delete payload.userId;
    delete payload.sessionId;
    const accessToken = value?.accessToken ?? null;
    const row: any = {
      user_id: userId,
      device_id: deviceId,
      hardware_id: value?.hardwareId ?? null,
      user_agent: value?.userAgent ?? value?.user_agent ?? null,
      ip_address: value?.ipAddress ?? value?.ip ?? null,
      is_active: value?.isValid !== false,
      last_activity: value?.lastActivity ?? new Date().toISOString(),
      payload,
      access_token_snapshot: accessToken,
      expires_at: value?.expiresAt ?? null,
    };
    await s`
      INSERT INTO sessions (
        user_id, device_id, hardware_id, user_agent, ip_address,
        is_active, last_activity, payload, access_token_snapshot, expires_at
      ) VALUES (
        ${row.user_id}::uuid,
        ${row.device_id},
        ${row.hardware_id},
        ${row.user_agent},
        ${row.ip_address},
        ${row.is_active},
        ${row.last_activity}::timestamptz,
        ${s.json(payload as Record<string, unknown>)},
        ${row.access_token_snapshot},
        ${row.expires_at as string | null}
      )
      ON CONFLICT (user_id, device_id) DO UPDATE SET
        hardware_id = EXCLUDED.hardware_id,
        user_agent = EXCLUDED.user_agent,
        ip_address = EXCLUDED.ip_address,
        is_active = EXCLUDED.is_active,
        last_activity = EXCLUDED.last_activity,
        payload = EXCLUDED.payload,
        access_token_snapshot = EXCLUDED.access_token_snapshot,
        expires_at = EXCLUDED.expires_at
    `;
    return;
  }

  if (key.startsWith('category:')) {
    const id = key.slice('category:'.length);
    await s`
      INSERT INTO demo_categories (
        id, name, slug, icon, description, file_count, created_at, created_by
      ) VALUES (
        ${id}::uuid,
        ${value?.name},
        ${value?.slug},
        ${value?.icon ?? '📱'},
        ${value?.description ?? ''},
        ${value?.fileCount ?? 0},
        ${value?.createdAt ?? new Date().toISOString()}::timestamptz,
        ${value?.createdBy ?? null}::uuid
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        icon = EXCLUDED.icon,
        description = EXCLUDED.description,
        file_count = EXCLUDED.file_count,
        created_by = EXCLUDED.created_by
    `;
    return;
  }

  if (key.startsWith('subcategory:')) {
    const id = key.slice('subcategory:'.length);
    await s`
      INSERT INTO demo_subcategories (id, category_id, name, icon, file_count, created_at)
      VALUES (
        ${id}::uuid,
        ${value?.categoryId}::uuid,
        ${value?.name},
        ${value?.icon ?? '📁'},
        ${value?.fileCount ?? 0},
        ${value?.createdAt ?? new Date().toISOString()}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        category_id = EXCLUDED.category_id,
        name = EXCLUDED.name,
        icon = EXCLUDED.icon,
        file_count = EXCLUDED.file_count
    `;
    return;
  }

  if (key.startsWith('file:')) {
    const id = key.slice('file:'.length);
    await s`
      INSERT INTO demo_files (
        id, category_id, subcategory_id, name, description, file_type, version, size,
        download_url, is_premium, download_count, created_by, created_at
      ) VALUES (
        ${id}::uuid,
        ${value?.categoryId}::uuid,
        ${value?.subcategoryId}::uuid,
        ${value?.name},
        ${value?.description ?? ''},
        ${value?.fileType ?? 'firmware'},
        ${value?.version ?? null},
        ${value?.size ?? null},
        ${value?.downloadUrl ?? ''},
        ${!!value?.isPremium},
        ${value?.downloadCount ?? 0},
        ${value?.createdBy ?? null}::uuid,
        ${value?.createdAt ?? new Date().toISOString()}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        category_id = EXCLUDED.category_id,
        subcategory_id = EXCLUDED.subcategory_id,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        file_type = EXCLUDED.file_type,
        version = EXCLUDED.version,
        size = EXCLUDED.size,
        download_url = EXCLUDED.download_url,
        is_premium = EXCLUDED.is_premium,
        download_count = EXCLUDED.download_count,
        created_by = EXCLUDED.created_by
    `;
    return;
  }

  if (key.startsWith('download:')) {
    const parts = key.split(':');
    if (parts.length === 2) {
      const token = parts[1];
      const ex = value?.expiresAt ?? exp ?? new Date(Date.now() + 3600_000).toISOString();
      await s`
        INSERT INTO download_gates (token, file_id, user_id, used, speed, created_at, expires_at)
        VALUES (
          ${token},
          ${String(value?.fileId ?? '')},
          ${String(value?.userId ?? 'anonymous')},
          ${!!value?.used},
          ${value?.speed ?? null},
          ${value?.createdAt ?? new Date().toISOString()}::timestamptz,
          ${ex}::timestamptz
        )
        ON CONFLICT (token) DO UPDATE SET
          file_id = EXCLUDED.file_id,
          user_id = EXCLUDED.user_id,
          used = EXCLUDED.used,
          speed = EXCLUDED.speed,
          expires_at = EXCLUDED.expires_at
      `;
      return;
    }
    if (parts.length === 3) {
      const userId = parts[1];
      const recordId = parts[2];
      await s`
        INSERT INTO user_download_history (
          id, user_id, file_id, file_name, category_name, subcategory_name, file_type, size, downloaded_at,
          hidden_from_user, hidden_at
        ) VALUES (
          ${recordId}::uuid,
          ${userId}::uuid,
          ${String(value?.fileId ?? '')},
          ${value?.fileName ?? null},
          ${value?.categoryName ?? null},
          ${value?.subcategoryName ?? null},
          ${value?.fileType ?? null},
          ${value?.size != null ? String(value.size) : null},
          ${value?.downloadedAt ?? new Date().toISOString()}::timestamptz,
          ${!!value?.hiddenFromUser},
          ${value?.hiddenAt ?? null}::timestamptz
        )
        ON CONFLICT (id) DO UPDATE SET
          file_id = EXCLUDED.file_id,
          file_name = EXCLUDED.file_name,
          category_name = EXCLUDED.category_name,
          subcategory_name = EXCLUDED.subcategory_name,
          file_type = EXCLUDED.file_type,
          size = EXCLUDED.size,
          downloaded_at = EXCLUDED.downloaded_at,
          hidden_from_user = EXCLUDED.hidden_from_user,
          hidden_at = EXCLUDED.hidden_at
      `;
      return;
    }
  }

  if (key.startsWith('download_token:')) {
    const token = key.slice('download_token:'.length);
    const ex = value?.expiresAt ?? exp ?? new Date(Date.now() + 600_000).toISOString();
    await s`
      INSERT INTO file_download_tokens (
        token, session_kind, file_id, user_id, google_drive_url, direct_link, drive_file_id,
        file_name, file_size, ip_address, link_type, used, used_at, created_at, expires_at
      ) VALUES (
        ${token},
        'otp',
        ${String(value?.fileId ?? '')},
        ${value?.userId != null ? String(value.userId) : null},
        ${value?.googleDriveUrl ?? null},
        ${value?.directLink ?? null},
        ${value?.driveFileId ?? null},
        ${value?.fileName ?? null},
        ${value?.fileSize != null ? String(value.fileSize) : null},
        ${value?.ipAddress ?? null},
        ${value?.linkType ?? null},
        ${!!value?.used},
        ${value?.usedAt ?? null}::timestamptz,
        ${value?.createdAt ?? new Date().toISOString()}::timestamptz,
        ${ex}::timestamptz
      )
      ON CONFLICT (token) DO UPDATE SET
        file_id = EXCLUDED.file_id,
        used = EXCLUDED.used,
        expires_at = EXCLUDED.expires_at
    `;
    return;
  }

  if (key.startsWith('downloadsession:')) {
    const token = key.slice('downloadsession:'.length);
    const ex = value?.expiresAt ?? exp ?? new Date(Date.now() + 600_000).toISOString();
    await s`
      INSERT INTO file_download_tokens (
        token, session_kind, file_id, user_id, google_drive_url, direct_link, drive_file_id,
        file_name, file_size, ip_address, link_type, used, used_at, created_at, expires_at
      ) VALUES (
        ${token},
        'browser_session',
        ${String(value?.fileId ?? '')},
        ${value?.userId != null ? String(value.userId) : null},
        ${value?.googleDriveUrl ?? null},
        ${value?.directLink ?? null},
        ${value?.driveFileId ?? null},
        ${value?.fileName ?? null},
        ${value?.fileSize != null ? String(value.fileSize) : null},
        ${value?.ipAddress ?? null},
        ${value?.linkType ?? null},
        ${!!value?.used},
        ${value?.usedAt ?? null}::timestamptz,
        ${value?.createdAt ?? new Date().toISOString()}::timestamptz,
        ${ex}::timestamptz
      )
      ON CONFLICT (token) DO UPDATE SET
        file_id = EXCLUDED.file_id,
        used = EXCLUDED.used,
        expires_at = EXCLUDED.expires_at
    `;
    return;
  }

  if (key.startsWith('support-request:')) {
    const supportId = key.slice('support-request:'.length);
    const ex = exp ?? new Date(Date.now() + 3600_000).toISOString();
    await s`
      INSERT INTO support_requests (
        support_id, request_id, supporter_name, status, session_id, created_at, updated_at, expires_at
      ) VALUES (
        ${supportId},
        ${(value?.requestId ?? crypto.randomUUID())}::uuid,
        ${value?.supporterName ?? null},
        ${value?.status ?? 'pending'},
        ${value?.sessionId ?? null}::uuid,
        ${value?.createdAt ?? new Date().toISOString()}::timestamptz,
        ${new Date().toISOString()}::timestamptz,
        ${ex}::timestamptz
      )
      ON CONFLICT (support_id) DO UPDATE SET
        status = EXCLUDED.status,
        session_id = EXCLUDED.session_id,
        updated_at = EXCLUDED.updated_at
    `;
    return;
  }

  if (key.startsWith('support-session:')) {
    const sessionId = key.slice('support-session:'.length);
    const ex = exp ?? new Date(Date.now() + 7200_000).toISOString();
    await s`
      INSERT INTO support_sessions (
        session_id, support_id, request_id, status, started_at, expires_at
      ) VALUES (
        ${sessionId}::uuid,
        ${value?.supportId},
        ${(value?.requestId ?? crypto.randomUUID())}::uuid,
        ${value?.status ?? 'active'},
        ${value?.startedAt ?? new Date().toISOString()}::timestamptz,
        ${ex}::timestamptz
      )
      ON CONFLICT (session_id) DO UPDATE SET
        status = EXCLUDED.status,
        expires_at = EXCLUDED.expires_at
    `;
    return;
  }

  if (key.startsWith('webrtc-offer:')) {
    const supportId = key.slice('webrtc-offer:'.length);
    const ex = exp ?? new Date(Date.now() + 300_000).toISOString();
    const offerText = typeof value?.offer === 'string' ? value.offer : JSON.stringify(value?.offer ?? {});
    await s`
      INSERT INTO webrtc_offers (support_id, offer, created_ms, expires_at)
      VALUES (${supportId}, ${offerText}, ${value?.timestamp ?? Date.now()}, ${ex}::timestamptz)
      ON CONFLICT (support_id) DO UPDATE SET
        offer = EXCLUDED.offer,
        created_ms = EXCLUDED.created_ms,
        expires_at = EXCLUDED.expires_at
    `;
    return;
  }

  if (key.startsWith('webrtc-answer:')) {
    const supportId = key.slice('webrtc-answer:'.length);
    const ex = exp ?? new Date(Date.now() + 300_000).toISOString();
    const answerText = typeof value?.answer === 'string' ? value.answer : JSON.stringify(value?.answer ?? {});
    await s`
      INSERT INTO webrtc_answers (support_id, answer, created_ms, expires_at)
      VALUES (${supportId}, ${answerText}, ${value?.timestamp ?? Date.now()}, ${ex}::timestamptz)
      ON CONFLICT (support_id) DO UPDATE SET
        answer = EXCLUDED.answer,
        created_ms = EXCLUDED.created_ms,
        expires_at = EXCLUDED.expires_at
    `;
    return;
  }

  if (key.startsWith('webrtc-ice:')) {
    const rest = key.slice('webrtc-ice:'.length);
    const lastColon = rest.lastIndexOf(':');
    const supportId = rest.slice(0, lastColon);
    const sender = rest.slice(lastColon + 1);
    const ex = exp ?? new Date(Date.now() + 300_000).toISOString();
    await s`
      INSERT INTO webrtc_ice_candidates (support_id, sender, candidates, expires_at)
      VALUES (${supportId}, ${sender}, ${s.json((value?.candidates ?? []) as unknown[])}, ${ex}::timestamptz)
      ON CONFLICT (support_id, sender) DO UPDATE SET
        candidates = EXCLUDED.candidates,
        expires_at = EXCLUDED.expires_at
    `;
    return;
  }

  if (key.startsWith('webrtc-status:')) {
    const rest = key.slice('webrtc-status:'.length);
    const lastColon = rest.lastIndexOf(':');
    const supportId = rest.slice(0, lastColon);
    const sender = rest.slice(lastColon + 1);
    const ex = exp ?? new Date(Date.now() + 600_000).toISOString();
    await s`
      INSERT INTO webrtc_connection_status (support_id, sender, status, updated_ms, expires_at)
      VALUES (${supportId}, ${sender}, ${value?.status ?? 'unknown'}, ${value?.timestamp ?? Date.now()}, ${ex}::timestamptz)
      ON CONFLICT (support_id, sender) DO UPDATE SET
        status = EXCLUDED.status,
        updated_ms = EXCLUDED.updated_ms,
        expires_at = EXCLUDED.expires_at
    `;
    return;
  }

  if (key.startsWith('browser_handoff:')) {
    const handoffId = key.slice('browser_handoff:'.length);
    const ex = exp ?? new Date(Date.now() + 120_000).toISOString();
    await s`
      INSERT INTO browser_handoffs (handoff_id, user_id, access_token, payload, expires_at)
      VALUES (
        ${handoffId}::uuid,
        ${String(value?.userId)}::uuid,
        ${String(value?.accessToken ?? '')},
        ${s.json({ user: value?.user ?? null, createdAt: value?.createdAt ?? null })},
        ${ex}::timestamptz
      )
      ON CONFLICT (handoff_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        access_token = EXCLUDED.access_token,
        payload = EXCLUDED.payload,
        expires_at = EXCLUDED.expires_at
    `;
    return;
  }

  throw new Error(`kv_store.set: desteklenmeyen anahtar: ${key}`);
};

export const get = async (key: string): Promise<any> => {
  const s = getSql();

  if (key.startsWith('user:')) {
    const id = key.slice('user:'.length);
    return await userRowToKv(id);
  }

  if (key.startsWith('session:token:')) {
    const hash = key.slice('session:token:'.length);
    const rows = await s`SELECT * FROM session_token_lookup WHERE token_hash = ${hash} LIMIT 1`;
    const link = rows[0];
    if (!link) return null;
    return { sessionId: link.device_id, userId: link.user_id };
  }

  if (key.startsWith('session:') && !key.startsWith('session:token:')) {
    const rest = key.slice('session:'.length);
    const idx = rest.indexOf(':');
    if (idx < 0) return null;
    const userId = rest.slice(0, idx);
    const deviceId = rest.slice(idx + 1);
    const rows = await s`
      SELECT * FROM sessions WHERE user_id = ${userId}::uuid AND device_id = ${deviceId} LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return await sessionRowToValue(row);
  }

  if (key.startsWith('category:')) {
    const id = key.slice('category:'.length);
    const rows = await s`SELECT * FROM demo_categories WHERE id = ${id}::uuid LIMIT 1`;
    const data = rows[0];
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      icon: data.icon,
      description: data.description,
      fileCount: data.file_count,
      createdAt: data.created_at,
    };
  }

  if (key.startsWith('subcategory:')) {
    const id = key.slice('subcategory:'.length);
    const rows = await s`SELECT * FROM demo_subcategories WHERE id = ${id}::uuid LIMIT 1`;
    const data = rows[0];
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      categoryId: data.category_id,
      icon: data.icon,
      fileCount: data.file_count,
      createdAt: data.created_at,
    };
  }

  if (key.startsWith('file:')) {
    const id = key.slice('file:'.length);
    const rows = await s`SELECT * FROM demo_files WHERE id = ${id}::uuid LIMIT 1`;
    const data = rows[0];
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      categoryId: data.category_id,
      subcategoryId: data.subcategory_id,
      fileType: data.file_type,
      version: data.version,
      size: data.size,
      downloadUrl: data.download_url,
      isPremium: data.is_premium,
      downloadCount: data.download_count,
      createdBy: data.created_by,
      createdAt: data.created_at,
    };
  }

  if (key.startsWith('download:')) {
    const parts = key.split(':');
    if (parts.length === 2) {
      const token = parts[1];
      const rows = await s`SELECT * FROM download_gates WHERE token = ${token} LIMIT 1`;
      const data = rows[0];
      if (!data) return null;
      return {
        fileId: data.file_id,
        userId: data.user_id,
        used: data.used,
        speed: data.speed,
        createdAt: data.created_at,
        expiresAt: data.expires_at,
      };
    }
    if (parts.length === 3) {
      const recordId = parts[2];
      const rows = await s`SELECT * FROM user_download_history WHERE id = ${recordId}::uuid LIMIT 1`;
      const data = rows[0];
      if (!data) return null;
      return {
        id: data.id,
        userId: data.user_id,
        fileId: data.file_id,
        fileName: data.file_name,
        categoryName: data.category_name,
        subcategoryName: data.subcategory_name,
        fileType: data.file_type,
        size: data.size,
        downloadedAt: data.downloaded_at,
        hiddenFromUser: data.hidden_from_user === true,
        hiddenAt: data.hidden_at ?? undefined,
      };
    }
  }

  if (key.startsWith('download_token:') || key.startsWith('downloadsession:')) {
    const token = key.startsWith('download_token:')
      ? key.slice('download_token:'.length)
      : key.slice('downloadsession:'.length);
    const rows = await s`SELECT * FROM file_download_tokens WHERE token = ${token} LIMIT 1`;
    const data = rows[0];
    if (!data) return null;
    return {
      fileId: data.file_id,
      userId: data.user_id,
      googleDriveUrl: data.google_drive_url,
      directLink: data.direct_link,
      driveFileId: data.drive_file_id,
      fileName: data.file_name,
      fileSize: data.file_size,
      ipAddress: data.ip_address,
      linkType: data.link_type,
      used: data.used,
      usedAt: data.used_at,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
    };
  }

  if (key.startsWith('support-request:')) {
    const supportId = key.slice('support-request:'.length);
    const rows = await s`SELECT * FROM support_requests WHERE support_id = ${supportId} LIMIT 1`;
    const data = rows[0];
    if (!data) return null;
    return {
      requestId: data.request_id,
      supportId: data.support_id,
      supporterName: data.supporter_name,
      status: data.status,
      sessionId: data.session_id,
      createdAt: data.created_at,
    };
  }

  if (key.startsWith('support-session:')) {
    const sessionId = key.slice('support-session:'.length);
    const rows = await s`SELECT * FROM support_sessions WHERE session_id = ${sessionId}::uuid LIMIT 1`;
    const data = rows[0];
    if (!data) return null;
    return {
      sessionId: data.session_id,
      supportId: data.support_id,
      requestId: data.request_id,
      status: data.status,
      startedAt: data.started_at,
    };
  }

  if (key.startsWith('webrtc-offer:')) {
    const supportId = key.slice('webrtc-offer:'.length);
    const rows = await s`SELECT * FROM webrtc_offers WHERE support_id = ${supportId} LIMIT 1`;
    const data = rows[0];
    if (!data) return null;
    return { offer: data.offer, timestamp: Number(data.created_ms) };
  }

  if (key.startsWith('webrtc-answer:')) {
    const supportId = key.slice('webrtc-answer:'.length);
    const rows = await s`SELECT * FROM webrtc_answers WHERE support_id = ${supportId} LIMIT 1`;
    const data = rows[0];
    if (!data) return null;
    return { answer: data.answer, timestamp: Number(data.created_ms) };
  }

  if (key.startsWith('webrtc-ice:')) {
    const rest = key.slice('webrtc-ice:'.length);
    const lastColon = rest.lastIndexOf(':');
    const supportId = rest.slice(0, lastColon);
    const sender = rest.slice(lastColon + 1);
    const rows = await s`
      SELECT * FROM webrtc_ice_candidates WHERE support_id = ${supportId} AND sender = ${sender} LIMIT 1
    `;
    const data = rows[0];
    if (!data) return { candidates: [] };
    return { candidates: data.candidates ?? [] };
  }

  if (key.startsWith('webrtc-status:')) {
    const rest = key.slice('webrtc-status:'.length);
    const lastColon = rest.lastIndexOf(':');
    const supportId = rest.slice(0, lastColon);
    const sender = rest.slice(lastColon + 1);
    const rows = await s`
      SELECT * FROM webrtc_connection_status WHERE support_id = ${supportId} AND sender = ${sender} LIMIT 1
    `;
    const data = rows[0];
    if (!data) return null;
    return { status: data.status, timestamp: Number(data.updated_ms) };
  }

  if (key.startsWith('browser_handoff:')) {
    const handoffId = key.slice('browser_handoff:'.length);
    const rows = await s`
      SELECT * FROM browser_handoffs
      WHERE handoff_id = ${handoffId}::uuid AND expires_at > NOW()
      LIMIT 1
    `;
    const data = rows[0];
    if (!data) return null;
    const payload = (data.payload ?? {}) as { user?: unknown; createdAt?: string };
    return {
      accessToken: data.access_token,
      userId: data.user_id,
      user: payload.user,
      createdAt: payload.createdAt ?? data.created_at,
    };
  }

  return null;
};

export const del = async (key: string): Promise<void> => {
  const s = getSql();

  if (key.startsWith('user:')) {
    const id = key.slice('user:'.length);
    await s`DELETE FROM users WHERE id = ${id}::uuid`;
    return;
  }

  if (key.startsWith('session:token:')) {
    const hash = key.slice('session:token:'.length);
    await s`DELETE FROM session_token_lookup WHERE token_hash = ${hash}`;
    return;
  }

  if (key.startsWith('session:') && !key.startsWith('session:token:')) {
    const rest = key.slice('session:'.length);
    const idx = rest.indexOf(':');
    const userId = rest.slice(0, idx);
    const deviceId = rest.slice(idx + 1);
    await s`DELETE FROM session_token_lookup WHERE user_id = ${userId}::uuid AND device_id = ${deviceId}`;
    await s`DELETE FROM sessions WHERE user_id = ${userId}::uuid AND device_id = ${deviceId}`;
    return;
  }

  if (key.startsWith('category:')) {
    const id = key.slice('category:'.length);
    await s`DELETE FROM demo_categories WHERE id = ${id}::uuid`;
    return;
  }
  if (key.startsWith('subcategory:')) {
    const id = key.slice('subcategory:'.length);
    await s`DELETE FROM demo_subcategories WHERE id = ${id}::uuid`;
    return;
  }
  if (key.startsWith('file:')) {
    const id = key.slice('file:'.length);
    await s`DELETE FROM demo_files WHERE id = ${id}::uuid`;
    return;
  }

  if (key.startsWith('download:')) {
    const parts = key.split(':');
    if (parts.length === 2) {
      await s`DELETE FROM download_gates WHERE token = ${parts[1]}`;
      return;
    }
    if (parts.length === 3) {
      await s`DELETE FROM user_download_history WHERE id = ${parts[2]}::uuid`;
      return;
    }
  }

  if (key.startsWith('download_token:') || key.startsWith('downloadsession:')) {
    const token = key.includes('downloadsession:')
      ? key.slice('downloadsession:'.length)
      : key.slice('download_token:'.length);
    await s`DELETE FROM file_download_tokens WHERE token = ${token}`;
    return;
  }

  if (key.startsWith('support-request:')) {
    const supportId = key.slice('support-request:'.length);
    await s`DELETE FROM support_requests WHERE support_id = ${supportId}`;
    return;
  }

  if (key.startsWith('support-session:')) {
    const sessionId = key.slice('support-session:'.length);
    await s`DELETE FROM support_sessions WHERE session_id = ${sessionId}::uuid`;
    return;
  }

  if (key.startsWith('webrtc-offer:')) {
    const supportId = key.slice('webrtc-offer:'.length);
    await s`DELETE FROM webrtc_offers WHERE support_id = ${supportId}`;
    return;
  }
  if (key.startsWith('webrtc-answer:')) {
    const supportId = key.slice('webrtc-answer:'.length);
    await s`DELETE FROM webrtc_answers WHERE support_id = ${supportId}`;
    return;
  }
  if (key.startsWith('webrtc-ice:')) {
    const rest = key.slice('webrtc-ice:'.length);
    const lastColon = rest.lastIndexOf(':');
    const supportId = rest.slice(0, lastColon);
    const sender = rest.slice(lastColon + 1);
    await s`DELETE FROM webrtc_ice_candidates WHERE support_id = ${supportId} AND sender = ${sender}`;
    return;
  }
  if (key.startsWith('webrtc-status:')) {
    const rest = key.slice('webrtc-status:'.length);
    const lastColon = rest.lastIndexOf(':');
    const supportId = rest.slice(0, lastColon);
    const sender = rest.slice(lastColon + 1);
    await s`DELETE FROM webrtc_connection_status WHERE support_id = ${supportId} AND sender = ${sender}`;
    return;
  }

  if (key.startsWith('browser_handoff:')) {
    const handoffId = key.slice('browser_handoff:'.length);
    await s`DELETE FROM browser_handoffs WHERE handoff_id = ${handoffId}::uuid`;
    return;
  }
};

export const mset = async (keys: string[], values: any[]): Promise<void> => {
  for (let i = 0; i < keys.length; i++) {
    await set(keys[i], values[i]);
  }
};

export const mget = async (keys: string[]): Promise<any[]> => {
  const out: any[] = [];
  for (const k of keys) {
    out.push(await get(k));
  }
  return out;
};

export const mdel = async (keys: string[]): Promise<void> => {
  for (const k of keys) {
    await del(k);
  }
};

export const getByPrefix = async (prefix: string): Promise<any[]> => {
  const s = getSql();

  if (prefix.startsWith('user:')) {
    const data = await s`SELECT * FROM users`;
    return (data ?? []).map((row: any) => ({
      key: `user:${row.id}`,
      value: rowToKvUser(row),
    }));
  }

  if (prefix.startsWith('session:')) {
    const out: { key: string; value: any }[] = [];
    if (prefix.startsWith('session:token:')) {
      const suffix = prefix.slice('session:token:'.length).replace(/%/g, '');
      const rows = suffix.length > 0
        ? await s`SELECT * FROM session_token_lookup WHERE token_hash LIKE ${suffix + '%'}`
        : await s`SELECT * FROM session_token_lookup`;
      for (const row of rows ?? []) {
        out.push({
          key: `session:token:${row.token_hash}`,
          value: { sessionId: row.device_id, userId: row.user_id },
        });
      }
      return out;
    }
    const userPrefix = prefix.slice('session:'.length);
    const uuidLen = 36;
    if (userPrefix.length >= uuidLen && userPrefix[uuidLen] === ':') {
      const userId = userPrefix.slice(0, uuidLen);
      const data = await s`SELECT * FROM sessions WHERE user_id = ${userId}::uuid`;
      for (const row of data ?? []) {
        out.push({
          key: `session:${row.user_id}:${row.device_id}`,
          value: await sessionRowToValue(row),
        });
      }
      const tokens = await s`SELECT * FROM session_token_lookup WHERE user_id = ${userId}::uuid`;
      for (const row of tokens ?? []) {
        out.push({
          key: `session:token:${row.token_hash}`,
          value: { sessionId: row.device_id, userId: row.user_id },
        });
      }
      return out;
    }
    const sess = await s`SELECT * FROM sessions`;
    for (const row of sess ?? []) {
      out.push({
        key: `session:${row.user_id}:${row.device_id}`,
        value: await sessionRowToValue(row),
      });
    }
    const allTokens = await s`SELECT * FROM session_token_lookup`;
    for (const row of allTokens ?? []) {
      out.push({
        key: `session:token:${row.token_hash}`,
        value: { sessionId: row.device_id, userId: row.user_id },
      });
    }
    return out;
  }

  if (prefix.startsWith('category:')) {
    const data = await s`SELECT * FROM demo_categories`;
    return (data ?? []).map((row: any) => ({
      key: `category:${row.id}`,
      value: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        icon: row.icon,
        description: row.description,
        fileCount: row.file_count,
        createdAt: row.created_at,
      },
    }));
  }

  if (prefix.startsWith('subcategory:')) {
    const data = await s`SELECT * FROM demo_subcategories`;
    return (data ?? []).map((row: any) => ({
      key: `subcategory:${row.id}`,
      value: {
        id: row.id,
        name: row.name,
        categoryId: row.category_id,
        icon: row.icon,
        fileCount: row.file_count,
        createdAt: row.created_at,
      },
    }));
  }

  if (prefix.startsWith('file:')) {
    const data = await s`SELECT * FROM demo_files`;
    return (data ?? []).map((row: any) => ({
      key: `file:${row.id}`,
      value: {
        id: row.id,
        name: row.name,
        description: row.description,
        categoryId: row.category_id,
        subcategoryId: row.subcategory_id,
        fileType: row.file_type,
        version: row.version,
        size: row.size,
        downloadUrl: row.download_url,
        isPremium: row.is_premium,
        downloadCount: row.download_count,
        createdBy: row.created_by,
        createdAt: row.created_at,
      },
    }));
  }

  if (prefix.startsWith('download:')) {
    const out: { key: string; value: any }[] = [];
    const parts = prefix.split(':');
    if (parts.length >= 3 && parts[1].length === 36) {
      const userId = parts[1];
      const data = await s`SELECT * FROM user_download_history WHERE user_id = ${userId}::uuid`;
      for (const row of data ?? []) {
        out.push({
          key: `download:${row.user_id}:${row.id}`,
          value: {
            id: row.id,
            userId: row.user_id,
            fileId: row.file_id,
            fileName: row.file_name,
            categoryName: row.category_name,
            subcategoryName: row.subcategory_name,
            fileType: row.file_type,
            size: row.size,
            downloadedAt: row.downloaded_at,
            hiddenFromUser: row.hidden_from_user === true,
            hiddenAt: row.hidden_at ?? undefined,
          },
        });
      }
      return out;
    }
    const gates = await s`SELECT * FROM download_gates`;
    for (const row of gates ?? []) {
      out.push({
        key: `download:${row.token}`,
        value: {
          fileId: row.file_id,
          userId: row.user_id,
          used: row.used,
          speed: row.speed,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
        },
      });
    }
    const hist = await s`SELECT * FROM user_download_history`;
    for (const row of hist ?? []) {
      out.push({
        key: `download:${row.user_id}:${row.id}`,
        value: {
          id: row.id,
          userId: row.user_id,
          fileId: row.file_id,
          fileName: row.file_name,
          categoryName: row.category_name,
          subcategoryName: row.subcategory_name,
          fileType: row.file_type,
          size: row.size,
          downloadedAt: row.downloaded_at,
          hiddenFromUser: row.hidden_from_user === true,
          hiddenAt: row.hidden_at ?? undefined,
        },
      });
    }
    return out;
  }

  return [];
};
