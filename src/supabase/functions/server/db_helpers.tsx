// ============================================
// DATABASE HELPERS — doğrudan PostgreSQL (postgres.js)
// ============================================

import { getSql } from './pg_client.ts';
import { normalizeLoginUsername } from './login_username.ts';

function sql() {
  return getSql();
}

// ===== USER İŞLEMLERİ =====

export async function createUser(data: {
  id: string;
  username: string;
  email?: string | null;
  passwordHash: string;
  name: string;
  role?: string;
  plan?: string;
}) {
  const username = normalizeLoginUsername(data.username);
  const email =
    data.email != null && String(data.email).trim() !== '' ? String(data.email).trim() : null;
  const s = sql();
  const rows = await s`
    INSERT INTO users (id, username, email, password_hash, name, role, plan)
    VALUES (
      ${data.id}::uuid,
      ${username},
      ${email},
      ${data.passwordHash},
      ${data.name},
      ${data.role || 'user'},
      ${data.plan || 'free'}
    )
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username,
      email = COALESCE(EXCLUDED.email, users.email),
      password_hash = CASE
        WHEN EXCLUDED.password_hash IS NOT NULL AND EXCLUDED.password_hash <> '' THEN EXCLUDED.password_hash
        ELSE users.password_hash
      END,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      plan = EXCLUDED.plan,
      updated_at = NOW()
    RETURNING *
  `;
  const user = rows[0];
  if (!user) throw new Error('User create/update error');
  return user;
}

/** Eski kayıtlar / isteğe bağlı iletişim e-postası (girişte kullanılmaz). */
export async function getUserByEmail(email: string) {
  const em = String(email ?? '').trim();
  if (!em) return null;
  const s = sql();
  const rows = await s`
    SELECT * FROM users
    WHERE email IS NOT NULL AND length(trim(email)) > 0 AND lower(trim(email)) = lower(${em})
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getUserByUsername(username: string) {
  const u = normalizeLoginUsername(username);
  if (!u) return null;
  const s = sql();
  const rows = await s`SELECT * FROM users WHERE lower(trim(username)) = ${u} LIMIT 1`;
  return rows[0] ?? null;
}

export async function getUserById(id: string) {
  const s = sql();
  const rows = await s`SELECT * FROM users WHERE id = ${id}::uuid LIMIT 1`;
  return rows[0] ?? null;
}

export async function updateUser(id: string, updates: Record<string, unknown>) {
  const s = sql();
  const allowed = [
    'username',
    'email',
    'name',
    'role',
    'plan',
    'registered_hardware_id',
    'registered_device_info',
    'registered_at',
    'daily_downloads',
    'last_download_reset',
    'legacy_profile',
  ] as const;
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in updates) patch[k] = updates[k];
  }
  if (Object.keys(patch).length === 0) {
    const u = await getUserById(id);
    if (!u) throw new Error('User not found');
    return u;
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    sets.push(`${k} = $${i++}`);
    vals.push(v);
  }
  vals.push(id);
  const q = `UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i}::uuid RETURNING *`;
  const out = await s.unsafe(q, vals);
  const row = out[0];
  if (!row) throw new Error('User update error');
  return row;
}

export async function updateUserPassword(id: string, passwordHash: string) {
  const s = sql();
  const rows = await s`
    UPDATE users SET password_hash = ${passwordHash}, updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING *
  `;
  if (!rows[0]) throw new Error('User update password error');
  return rows[0];
}

export async function deleteUser(id: string) {
  const s = sql();
  await s`DELETE FROM users WHERE id = ${id}::uuid`;
}

export async function getAllUsers() {
  const s = sql();
  return await s`SELECT * FROM users ORDER BY created_at DESC`;
}

export async function getUsersByRole(role: string) {
  const s = sql();
  return await s`SELECT * FROM users WHERE role = ${role}`;
}

// ===== HARDWARE LOCK İŞLEMLERİ =====

export async function registerHardwareId(userId: string, hardwareId: string, deviceInfo: unknown) {
  const s = sql();
  const rows = await s`
    UPDATE users SET
      registered_hardware_id = ${hardwareId},
      registered_device_info = ${deviceInfo as any}::jsonb,
      registered_at = NOW(),
      updated_at = NOW()
    WHERE id = ${userId}::uuid
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Hardware register error');
  return rows[0];
}

export async function checkHardwareLock(userId: string, hardwareId: string) {
  const user = await getUserById(userId);

  if (!user) {
    throw new Error('User not found');
  }

  if (!user.registered_hardware_id) {
    return { isLocked: false, needsRegistration: true };
  }

  if (user.registered_hardware_id === hardwareId) {
    return { isLocked: false, needsRegistration: false };
  }

  return {
    isLocked: true,
    needsRegistration: false,
    registeredDevice: user.registered_device_info,
  };
}

export async function clearRegisteredHardware(userId: string) {
  const s = sql();
  await s`
    UPDATE users SET
      registered_hardware_id = NULL,
      registered_device_info = NULL,
      registered_at = NULL,
      updated_at = NOW()
    WHERE id = ${userId}::uuid
  `;
}

export async function clearRegisteredHardwareIfMatch(userId: string, hardwareId: string) {
  const s = sql();
  const hw = String(hardwareId ?? '').trim();
  if (!hw) return;
  await s`
    UPDATE users SET
      registered_hardware_id = NULL,
      registered_device_info = NULL,
      registered_at = NULL,
      updated_at = NOW()
    WHERE id = ${userId}::uuid AND LOWER(registered_hardware_id) = LOWER(${hw})
  `;
}

// ===== SESSION İŞLEMLERİ =====

export async function createSession(data: {
  userId: string;
  deviceId: string;
  hardwareId?: string;
  userAgent?: string;
  ipAddress?: string;
}) {
  const s = sql();
  const rows = await s`
    INSERT INTO sessions (user_id, device_id, hardware_id, user_agent, ip_address, is_active, last_activity)
    VALUES (
      ${data.userId}::uuid,
      ${data.deviceId},
      ${data.hardwareId ?? null},
      ${data.userAgent ?? null},
      ${data.ipAddress ?? null},
      true,
      NOW()
    )
    ON CONFLICT (user_id, device_id) DO UPDATE SET
      is_active = true,
      last_activity = NOW(),
      hardware_id = COALESCE(EXCLUDED.hardware_id, sessions.hardware_id),
      user_agent = COALESCE(EXCLUDED.user_agent, sessions.user_agent),
      ip_address = COALESCE(EXCLUDED.ip_address, sessions.ip_address)
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Session create error');
  return rows[0];
}

export async function getActiveSessions(userId: string) {
  const s = sql();
  return await s`
    SELECT * FROM sessions
    WHERE user_id = ${userId}::uuid AND is_active = true
    ORDER BY last_activity DESC
  `;
}

export async function getAllSessionsForUser(userId: string) {
  const s = sql();
  return await s`
    SELECT * FROM sessions
    WHERE user_id = ${userId}::uuid
    ORDER BY last_activity DESC NULLS LAST
  `;
}

export async function setSessionActive(userId: string, deviceId: string, isActive: boolean) {
  const s = sql();
  await s`
    UPDATE sessions
    SET is_active = ${isActive}, last_activity = NOW()
    WHERE user_id = ${userId}::uuid AND device_id = ${deviceId}
  `;
}

export async function deleteSession(userId: string, deviceId: string) {
  const s = sql();
  await s`DELETE FROM sessions WHERE user_id = ${userId}::uuid AND device_id = ${deviceId}`;
}

export async function deleteSessionsByHardwareId(userId: string, hardwareId: string) {
  const s = sql();
  const hw = String(hardwareId ?? '').trim();
  if (!hw) return;
  await s`
    DELETE FROM sessions
    WHERE user_id = ${userId}::uuid AND LOWER(hardware_id) = LOWER(${hw})
  `;
}

/** Oturum token kayıtları — donanım kimliğine göre (büyük/küçük harf duyarsız) */
export async function deleteSessionTokensByHardwareId(userId: string, hardwareId: string) {
  const s = sql();
  const hw = String(hardwareId ?? '').trim();
  if (!hw) return;
  const rows = (await s`
    SELECT device_id FROM sessions
    WHERE user_id = ${userId}::uuid AND LOWER(hardware_id) = LOWER(${hw})
  `) as Array<{ device_id: string }>;
  const ids = rows.map((r) => String(r.device_id)).filter(Boolean);
  if (ids.length === 0) return;
  await s`
    DELETE FROM session_token_lookup
    WHERE user_id = ${userId}::uuid AND device_id = ANY(${ids}::text[])
  `;
}

export async function deleteAllSessions(userId: string) {
  const s = sql();
  await s`DELETE FROM sessions WHERE user_id = ${userId}::uuid`;
}

export async function checkSessionLimit(userId: string, maxSessions: number) {
  const sessions = await getActiveSessions(userId);
  return {
    currentSessions: sessions.length,
    maxSessions,
    canCreateNew: sessions.length < maxSessions,
  };
}

// ===== ELECTRON TOKEN İŞLEMLERİ =====

export async function createElectronToken(userId: string, hardwareId: string, expiresInHours = 24) {
  const s = sql();
  const token = `electron_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  const rows = await s`
    INSERT INTO electron_tokens (token, user_id, hardware_id, expires_at)
    VALUES (${token}, ${userId}::uuid, ${hardwareId}, ${expiresAt}::timestamptz)
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Token create error');
  return token;
}

export async function validateElectronToken(token: string) {
  const s = sql();
  const rows = await s`SELECT * FROM electron_tokens WHERE token = ${token} LIMIT 1`;
  const data = rows[0];
  if (!data) return null;

  if (new Date(data.expires_at as string) < new Date()) {
    await deleteElectronToken(token);
    return null;
  }

  return data;
}

export async function deleteElectronToken(token: string) {
  const s = sql();
  await s`DELETE FROM electron_tokens WHERE token = ${token}`;
}

export async function cleanupExpiredTokens() {
  const s = sql();
  await s`DELETE FROM electron_tokens WHERE expires_at < NOW()`;
}

// ===== BRAND İŞLEMLERİ =====

export async function createBrand(name: string, logoUrl?: string) {
  const s = sql();
  const rows = await s`
    INSERT INTO brands (name, logo_url) VALUES (${name}, ${logoUrl ?? null})
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Brand create error');
  return rows[0];
}

export async function getAllBrands() {
  const s = sql();
  return await s`SELECT * FROM brands ORDER BY name`;
}

export async function getBrandByName(name: string) {
  const s = sql();
  const rows = await s`SELECT * FROM brands WHERE name = ${name} LIMIT 1`;
  return rows[0] ?? null;
}

// ===== CATEGORY İŞLEMLERİ =====

export async function createCategory(brandId: string, name: string) {
  const s = sql();
  const rows = await s`
    INSERT INTO categories (brand_id, name) VALUES (${brandId}::uuid, ${name})
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Category create error');
  return rows[0];
}

export async function getCategoriesByBrand(brandId: string) {
  const s = sql();
  return await s`SELECT * FROM categories WHERE brand_id = ${brandId}::uuid ORDER BY name`;
}

// ===== FILE İŞLEMLERİ =====

export async function createFile(data: {
  categoryId: string;
  name: string;
  description?: string;
  googleDriveLink: string;
  fileSize?: string;
  version?: string;
  requiredPlan?: string;
}) {
  const s = sql();
  const rows = await s`
    INSERT INTO files (
      category_id, name, description, google_drive_link, file_size, version, required_plan
    ) VALUES (
      ${data.categoryId}::uuid,
      ${data.name},
      ${data.description ?? null},
      ${data.googleDriveLink},
      ${data.fileSize ?? null},
      ${data.version ?? null},
      ${data.requiredPlan || 'free'}
    )
    RETURNING *
  `;
  if (!rows[0]) throw new Error('File create error');
  return rows[0];
}

export async function getFilesByCategory(categoryId: string) {
  const s = sql();
  return await s`
    SELECT * FROM files WHERE category_id = ${categoryId}::uuid ORDER BY created_at DESC
  `;
}

export async function incrementDownloadCount(fileId: string) {
  const s = sql();
  try {
    await s`SELECT increment(${fileId}::uuid, 'files', 'download_count')`;
  } catch {
    const rows = await s`SELECT download_count FROM files WHERE id = ${fileId}::uuid LIMIT 1`;
    const file = rows[0] as { download_count?: number } | undefined;
    if (file) {
      await s`
        UPDATE files SET download_count = COALESCE(download_count, 0) + 1
        WHERE id = ${fileId}::uuid
      `;
    }
  }
}

// ===== DOWNLOAD LINK İŞLEMLERİ =====

export async function createDownloadLink(fileId: string, userId: string, expiresInMinutes = 5) {
  const s = sql();
  const tempToken = `dl_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

  const rows = await s`
    INSERT INTO download_links (file_id, user_id, temp_token, expires_at)
    VALUES (${fileId}::uuid, ${userId}::uuid, ${tempToken}, ${expiresAt}::timestamptz)
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Download link create error');
  return tempToken;
}

export async function validateDownloadLink(tempToken: string) {
  const s = sql();
  const linkRows = await s`
    SELECT * FROM download_links
    WHERE temp_token = ${tempToken} AND used = false
    LIMIT 1
  `;
  const data = linkRows[0] as Record<string, unknown> | undefined;
  if (!data) return null;

  if (new Date(data.expires_at as string) < new Date()) {
    return null;
  }

  const fileRows = await s`SELECT * FROM files WHERE id = ${data.file_id}::uuid LIMIT 1`;
  const file = fileRows[0];
  return { ...data, files: file };
}

export async function markDownloadLinkAsUsed(tempToken: string) {
  const s = sql();
  await s`
    UPDATE download_links SET used = true, used_at = NOW()
    WHERE temp_token = ${tempToken}
  `;
}

// ===== DOWNLOAD LİMİT İŞLEMLERİ =====

export async function checkDownloadLimit(userId: string, dailyLimit: number) {
  const user = await getUserById(userId);

  if (!user) {
    throw new Error('User not found');
  }

  if (dailyLimit === -1) {
    return { canDownload: true, remaining: -1 };
  }

  const lastReset = new Date(user.last_download_reset as string);
  const today = new Date();

  if (lastReset.toDateString() !== today.toDateString()) {
    await updateUser(userId, {
      daily_downloads: 0,
      last_download_reset: today.toISOString(),
    });
    return { canDownload: true, remaining: dailyLimit };
  }

  const remaining = dailyLimit - (Number(user.daily_downloads) || 0);
  return {
    canDownload: remaining > 0,
    remaining: Math.max(0, remaining),
  };
}

export async function incrementDailyDownloads(userId: string) {
  const user = await getUserById(userId);

  if (!user) {
    throw new Error('User not found');
  }

  await updateUser(userId, {
    daily_downloads: (Number(user.daily_downloads) || 0) + 1,
  });
}

// ===== UTILITY FUNCTİONS =====

export async function getUserStats(userId: string) {
  const user = await getUserById(userId);
  const sessions = await getActiveSessions(userId);

  const s = sql();
  const countRows = await s`
    SELECT COUNT(*)::int AS c FROM download_links
    WHERE user_id = ${userId}::uuid AND used = true
  `;
  const downloadCount = Number((countRows[0] as { c: number }).c) || 0;

  return {
    user,
    activeSessions: sessions.length,
    totalDownloads: downloadCount,
  };
}

export async function getSystemStats() {
  const s = sql();
  const u = await s`SELECT COUNT(*)::int AS c FROM users`;
  const f = await s`SELECT COUNT(*)::int AS c FROM files`;
  const b = await s`SELECT COUNT(*)::int AS c FROM brands`;
  const sess = await s`SELECT COUNT(*)::int AS c FROM sessions WHERE is_active = true`;

  return {
    totalUsers: Number((u[0] as { c: number }).c) || 0,
    totalFiles: Number((f[0] as { c: number }).c) || 0,
    totalBrands: Number((b[0] as { c: number }).c) || 0,
    activeSessions: Number((sess[0] as { c: number }).c) || 0,
  };
}
