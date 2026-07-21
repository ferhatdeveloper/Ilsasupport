import { Hono } from 'npm:hono';
import * as jwtAuth from './auth_jwt.tsx';
import * as pwd from './password.tsx';
import * as db from './db_helpers.tsx';
import { getSql, postgresErrorDetail } from './pg_client.ts';
import * as kv from './kv_store.tsx';
import * as gdrive from './google_drive_helper.tsx';
import { escapeIlikePattern } from './postgresql_helpers.tsx';
import { parseUserImportBuffer, executeUserImport } from './import_users_batch.tsx';
import { effectiveMaxSessions, maxSessionsFromSources } from './subscription_helpers.tsx';
import * as loginApproval from './login_approval.tsx';
import * as desktopApp from './desktop_app_version.tsx';
import { bumpLastPublishedFileId } from './site_settings.tsx';
import * as security from './security_middleware.tsx';
import { endAllWebPresenceForUser } from './web_presence.tsx';
import { invalidateCachedUserKv } from './user_cache.ts';

const MAX_CMS_IMAGE_BYTES = 8 * 1024 * 1024;

/** LISTELEME_DB_SABLONU: önce altkat, yoksa katid (yalnızca sayısal metin) */
function bilgiCategoryLinkKey(row: { altkat?: unknown; katid?: unknown }): string | null {
  const a = String(row.altkat ?? '').trim();
  if (a && a !== '0' && /^[0-9]+$/.test(a)) return a;
  const k = String(row.katid ?? '').trim();
  if (k && /^[0-9]+$/.test(k)) return k;
  return null;
}

function bilgiNumericId(v: unknown): number | null {
  const s = String(v ?? '').trim();
  if (!s || !/^[0-9]+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

type KategoriBrief = { id: number; kategori_adi: string; ust_kategori_id: number | null };

async function loadKategoriMap(
  sql: ReturnType<typeof getSql>,
  seedIds: number[],
): Promise<Map<number, KategoriBrief>> {
  const map = new Map<number, KategoriBrief>();
  const pending = new Set(seedIds.filter((n) => Number.isFinite(n) && n > 0));
  let guard = 0;
  while (pending.size > 0 && guard++ < 24) {
    const batch = [...pending];
    pending.clear();
    const rows = await sql`
      SELECT id, kategori_adi, ust_kategori_id FROM kategoriler WHERE id IN ${sql(batch)}
    `;
    for (const r of rows || []) {
      const id = Number(r.id);
      if (!Number.isFinite(id) || map.has(id)) continue;
      const ust = r.ust_kategori_id != null ? Number(r.ust_kategori_id) : null;
      map.set(id, {
        id,
        kategori_adi: String(r.kategori_adi || ''),
        ust_kategori_id: Number.isFinite(ust) ? ust : null,
      });
      if (ust != null && Number.isFinite(ust) && !map.has(ust)) pending.add(ust);
    }
  }
  return map;
}

function bilgiCategoryDisplay(
  map: Map<number, KategoriBrief>,
  katid: unknown,
  altkat: unknown,
): { mainCategoryName: string; subCategoryName: string; listCategoryName: string } {
  const mainId = bilgiNumericId(katid);
  const altId = bilgiNumericId(altkat);
  const mainRow = mainId != null ? map.get(mainId) : undefined;
  const mainCategoryName = mainRow?.kategori_adi || (mainId != null ? String(mainId) : '—');

  const leafId = altId ?? mainId;
  if (leafId == null) {
    return { mainCategoryName, subCategoryName: '—', listCategoryName: '—' };
  }

  const chain: KategoriBrief[] = [];
  let cur: number | null = leafId;
  let guard = 0;
  while (cur != null && guard++ < 16) {
    const row = map.get(cur);
    if (!row) break;
    chain.unshift(row);
    if (mainId != null && cur === mainId) break;
    cur = row.ust_kategori_id;
  }

  const listCategoryName = chain[chain.length - 1]?.kategori_adi ?? String(leafId);
  let subCategoryName = '—';
  if (altId != null && mainId != null && altId !== mainId) {
    const mainIdx = chain.findIndex((c) => c.id === mainId);
    const tail = mainIdx >= 0 ? chain.slice(mainIdx + 1) : chain.slice(1);
    subCategoryName = tail.length > 0 ? tail.map((c) => c.kategori_adi).join(' › ') : listCategoryName;
  } else if (altId != null && mainId == null) {
    subCategoryName = chain.length > 1 ? chain.slice(1).map((c) => c.kategori_adi).join(' › ') : '—';
  }

  return { mainCategoryName, subCategoryName, listCategoryName };
}

function sanitizeBaseName(input: string): string {
  const base = input
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.slice(0, 64) || 'slide-image';
}

function extFromMime(type: string): string {
  const t = String(type || '').toLowerCase();
  if (t === 'image/jpeg' || t === 'image/jpg') return 'jpg';
  if (t === 'image/png') return 'png';
  if (t === 'image/webp') return 'webp';
  if (t === 'image/gif') return 'gif';
  if (t === 'image/svg+xml') return 'svg';
  return 'bin';
}

function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'png') return 'image/png';
  if (e === 'webp') return 'image/webp';
  if (e === 'gif') return 'image/gif';
  if (e === 'svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

type PgSql = ReturnType<typeof getSql>;

/**
 * Kategorinin kökten derinliği (1 = kök). Büyük tabloda SELECT * + recursive JS yerine
 * tek satır SELECT ile yürür; ust_kategori_id döngüsünde stack taşması / 500 önlenir.
 */
async function depthOfCategoryRow(sql: PgSql, categoryId: number): Promise<{ depth: number; err?: string }> {
  let depth = 1;
  let cur: number | null = categoryId;
  const seen = new Set<number>();
  for (let guard = 0; guard < 64; guard++) {
    if (seen.has(cur)) {
      return { depth: 1, err: 'ust_kategori_id zincirinde dongu; veriyi duzeltin.' };
    }
    seen.add(cur);
    const rows = await sql`SELECT ust_kategori_id FROM kategoriler WHERE id = ${cur} LIMIT 1`;
    const row = rows[0] as { ust_kategori_id?: unknown } | undefined;
    if (!row) {
      return { depth: 1, err: 'Ust zincirde olmayan kategori id.' };
    }
    const raw = row.ust_kategori_id;
    if (raw == null || raw === '') {
      return { depth };
    }
    const next = typeof raw === 'number' && Number.isFinite(raw) ? raw : parseInt(String(raw), 10);
    if (!Number.isFinite(next)) {
      return { depth: 1, err: 'Gecersiz ust_kategori_id.' };
    }
    depth++;
    cur = next;
  }
  return { depth: 1, err: 'Kategori derinligi 64 asim veya dongu suphesi.' };
}

/** sql/10_cms_pricing.sql atlanmış sunucularda 500 olmasın (admin + public GET) */
export async function ensureCmsPricingPageTable(sql: PgSql) {
  await sql`
    CREATE TABLE IF NOT EXISTS cms_pricing_page (
      id TEXT PRIMARY KEY DEFAULT 'default',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

/** sql/09_cms_content.sql atlanmış sunucularda slayt/bilgi sayfası 500 olmasın */
export async function ensureCmsContentTables(sql: PgSql) {
  await sql`
    CREATE TABLE IF NOT EXISTS cms_hero_slides (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sort_order INT NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      subtitle TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      button_text TEXT NOT NULL DEFAULT '',
      button_url TEXT NOT NULL DEFAULT '#',
      image_url TEXT NOT NULL DEFAULT '',
      gradient TEXT NOT NULL DEFAULT 'from-blue-900 via-purple-900 to-pink-900',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_cms_hero_slides_active_sort
      ON cms_hero_slides (is_active, sort_order, created_at)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS cms_info_pages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sort_order INT NOT NULL DEFAULT 0,
      is_published BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_cms_info_pages_published_created
      ON cms_info_pages (is_published, created_at DESC)
  `;
}

/** KV kaydında role=admin iken PostgreSQL plan alanı genelde premium olur; UI ve istatistikler için birleştir */
function planForAdminUi(userData: { role?: string; plan?: string }): 'free' | 'premium' | 'admin' {
  if (userData.role === 'admin' || userData.plan === 'admin') return 'admin';
  if (userData.plan === 'premium') return 'premium';
  return 'free';
}

function maxSessionsForUser(
  userData?: { role?: string; plan?: string; maxSessions?: number } | null,
  row?: { role?: string; plan?: string; legacy_profile?: unknown } | null,
): number {
  return maxSessionsFromSources(userData, row);
}

/** KV kaydı yoksa PostgreSQL + legacy_profile ile oluştur (içe aktarma / eski kayıtlar) */
function rebuildUserKvFromPgRow(
  userId: string,
  row: {
    username?: string | null;
    email?: string | null;
    name?: string | null;
    role?: string | null;
    plan?: string | null;
    legacy_profile?: unknown;
    registered_hardware_id?: string | null;
    created_at?: string | null;
  },
): Record<string, unknown> {
  const lp =
    row.legacy_profile && typeof row.legacy_profile === 'object'
      ? (row.legacy_profile as Record<string, unknown>)
      : {};
  const role = String(row.role ?? lp.kvRole ?? 'user');
  const planRaw = String(lp.kvPlan ?? row.plan ?? 'free');
  const plan =
    role === 'admin' ? 'admin' : planRaw === 'premium' ? 'premium' : 'free';
  return {
    id: userId,
    username: row.username ?? null,
    email: row.email ?? null,
    name: row.name ?? 'Unknown',
    role,
    plan,
    createdAt: row.created_at ?? new Date().toISOString(),
    expiresAt: (lp.expiresAt as string | null | undefined) ?? null,
    maxSessions:
      typeof lp.maxSessions === 'number'
        ? lp.maxSessions
        : effectiveMaxSessions({ role, plan }),
    downloadLimit:
      typeof lp.downloadLimit === 'number'
        ? lp.downloadLimit
        : role === 'admin'
          ? -1
          : plan === 'premium'
            ? 50
            : 5,
    downloadCount: typeof lp.downloadCount === 'number' ? lp.downloadCount : 0,
    activeSessions: typeof lp.activeSessions === 'number' ? lp.activeSessions : 0,
    hardwareId: row.registered_hardware_id ?? (lp.registeredDeviceId as string | null) ?? null,
    registeredDeviceId:
      (lp.registeredDeviceId as string | null) ?? row.registered_hardware_id ?? null,
    registeredAt: (lp.registeredAt as string | null) ?? null,
    lastLoginAt: (lp.lastLoginAt as string | null) ?? null,
    downloadsToday: typeof lp.downloadsToday === 'number' ? lp.downloadsToday : 0,
    loginApproved: loginApproval.readLoginApproved(row, undefined),
  };
}

type AdminDeviceRow = {
  id: string;
  kind: 'session' | 'primary';
  deviceId: string;
  hardwareId: string | null;
  label: string;
  userAgent: string | null;
  ipAddress: string | null;
  isActive: boolean;
  isPrimary: boolean;
  status: 'approved' | 'inactive' | 'pending';
  lastActivity: string | null;
  createdAt: string | null;
  source: 'sql' | 'kv';
};

function deviceLabel(deviceId: string, hardwareId: string | null): string {
  if (String(deviceId).startsWith('web_')) return 'Web tarayıcı';
  if (hardwareId) {
    const short = hardwareId.length > 16 ? `${hardwareId.slice(0, 16)}…` : hardwareId;
    return `Masaüstü (${short})`;
  }
  return deviceId.length > 24 ? `${deviceId.slice(0, 24)}…` : deviceId;
}

function normalizeHardwareKey(hw: string | null | undefined): string | null {
  const t = String(hw ?? '').trim().toLowerCase();
  return t || null;
}

function hardwareIdsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeHardwareKey(a);
  const y = normalizeHardwareKey(b);
  return !!(x && y && x === y);
}

function loginDeviceUiStatus(
  dbStatus: string | null | undefined,
  isSessionActive: boolean,
): 'approved' | 'inactive' | 'pending' {
  const st = String(dbStatus ?? '').toLowerCase();
  if (st === 'approved') return 'approved';
  if (st === 'rejected') return 'inactive';
  if (st === 'pending') return 'pending';
  return isSessionActive ? 'pending' : 'inactive';
}

/** Admin cihaz işlemleri: primary:, logindev: ve oturum device_id */
async function resolveHardwareIdForDeviceAction(
  userId: string,
  deviceId: string,
  bodyHw?: unknown,
): Promise<string | null> {
  let hardwareId =
    typeof bodyHw === 'string' && bodyHw.trim() ? bodyHw.trim() : null;

  if (!hardwareId && deviceId.startsWith('primary:')) {
    hardwareId = deviceId.slice('primary:'.length);
  }
  if (!hardwareId && deviceId.startsWith('logindev:')) {
    hardwareId = deviceId.slice('logindev:'.length);
  }
  if (!hardwareId) {
    const sessions = await db.getAllSessionsForUser(userId);
    const match = sessions.find(
      (s: { device_id: string; hardware_id?: string | null }) => s.device_id === deviceId,
    );
    hardwareId = match?.hardware_id ? String(match.hardware_id) : null;
  }
  return hardwareId;
}

async function listAdminUserDevices(userId: string): Promise<AdminDeviceRow[]> {
  await loginApproval.normalizeSingleApprovedDevice(userId);
  const row = await db.getUserById(userId);
  const userData = await kv.get(`user:${userId}`);
  const primaryHwNorm = normalizeHardwareKey(
    row?.registered_hardware_id ??
      userData?.hardwareId ??
      userData?.registeredDeviceId ??
      null,
  );

  const s = getSql();
  let loginDevs: Array<{
    hardware_id: string;
    status: string;
    last_attempt_at?: string | null;
  }> = [];
  try {
    loginDevs = (await s`
      SELECT hardware_id, status, last_attempt_at
      FROM user_login_devices
      WHERE user_id = ${userId}::uuid AND status != 'rejected'
      ORDER BY last_attempt_at DESC NULLS LAST
    `) as typeof loginDevs;
  } catch {
    /* tablo yok */
  }

  const sessions = await db.getAllSessionsForUser(userId);
  const activityByHw = new Map<
    string,
    { lastActivity: string | null; isActive: boolean; ip: string | null; ua: string | null }
  >();
  const webDevices: AdminDeviceRow[] = [];

  for (const sess of sessions) {
    const devId = String(sess.device_id);
    if (devId.startsWith('web_')) {
      webDevices.push({
        id: devId,
        kind: 'session',
        deviceId: devId,
        hardwareId: null,
        label: deviceLabel(devId, null),
        userAgent: sess.user_agent ? String(sess.user_agent) : null,
        ipAddress: sess.ip_address ? String(sess.ip_address) : null,
        isActive: !!sess.is_active,
        isPrimary: false,
        status: sess.is_active ? 'approved' : 'inactive',
        lastActivity: sess.last_activity ? String(sess.last_activity) : null,
        createdAt: sess.created_at ? String(sess.created_at) : null,
        source: 'sql',
      });
      continue;
    }
    const hw = normalizeHardwareKey(sess.hardware_id);
    if (!hw) continue;
    const la = sess.last_activity ? String(sess.last_activity) : null;
    const prev = activityByHw.get(hw);
    activityByHw.set(hw, {
      lastActivity:
        prev?.lastActivity && la
          ? new Date(prev.lastActivity) > new Date(la)
            ? prev.lastActivity
            : la
          : la ?? prev?.lastActivity ?? null,
      isActive: !!(prev?.isActive || sess.is_active),
      ip: sess.ip_address ? String(sess.ip_address) : prev?.ip ?? null,
      ua: sess.user_agent ? String(sess.user_agent) : prev?.ua ?? null,
    });
  }

  const rows: AdminDeviceRow[] = [];
  const seenHw = new Set<string>();

  for (const ld of loginDevs) {
    const hw = normalizeHardwareKey(ld.hardware_id);
    if (!hw || seenHw.has(hw)) continue;
    seenHw.add(hw);
    const st = String(ld.status ?? '').toLowerCase();
    const act = activityByHw.get(hw);
    const status = loginDeviceUiStatus(st, st === 'approved' || !!act?.isActive);
    rows.push({
      id: `logindev:${hw}`,
      kind: primaryHwNorm === hw ? 'primary' : 'session',
      deviceId: `logindev:${hw}`,
      hardwareId: hw,
      label:
        status === 'pending'
          ? `${deviceLabel('electron', hw)} (onay bekliyor)`
          : deviceLabel('electron', hw),
      userAgent: act?.ua ?? null,
      ipAddress: act?.ip ?? null,
      isActive: status === 'approved' || !!act?.isActive,
      isPrimary: primaryHwNorm === hw,
      status,
      lastActivity: act?.lastActivity ?? (ld.last_attempt_at ? String(ld.last_attempt_at) : null),
      createdAt: ld.last_attempt_at ? String(ld.last_attempt_at) : null,
      source: 'sql',
    });
  }

  if (primaryHwNorm && !seenHw.has(primaryHwNorm)) {
    const act = activityByHw.get(primaryHwNorm);
    const hasLoginRow = loginDevs.some(
      (ld) => normalizeHardwareKey(ld.hardware_id) === primaryHwNorm,
    );
    if (hasLoginRow || act?.isActive) {
      rows.push({
        id: `logindev:${primaryHwNorm}`,
        kind: 'primary',
        deviceId: `logindev:${primaryHwNorm}`,
        hardwareId: primaryHwNorm,
        label: deviceLabel('electron', primaryHwNorm),
        userAgent: act?.ua ?? null,
        ipAddress: act?.ip ?? null,
        isActive: !!act?.isActive,
        isPrimary: true,
        status: loginDeviceUiStatus(undefined, !!act?.isActive),
        lastActivity: act?.lastActivity ?? (row?.registered_at ? String(row.registered_at) : null),
        createdAt: row?.registered_at ? String(row.registered_at) : null,
        source: 'sql',
      });
    }
  }

  const merged = [...rows, ...webDevices];
  merged.sort((a, b) => {
    const order = { approved: 0, pending: 1, inactive: 2 };
    const d = order[a.status] - order[b.status];
    if (d !== 0) return d;
    const ta = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
    const tb = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
    return tb - ta;
  });
  return merged;
}

async function userDataPatchActiveSessions(userId: string, count: number) {
  const userData = await kv.get(`user:${userId}`);
  if (!userData) return;
  userData.activeSessions = count;
  await kv.set(`user:${userId}`, userData);
}

/** KV oturum önbelleğinde kalan kayıtları donanım / oturum kimliğine göre temizle */
async function purgeKvSessionsForUserDevice(
  userId: string,
  opts: { hardwareId?: string | null; deviceId?: string | null },
) {
  const hw = opts.hardwareId?.trim() || null;
  const deviceId = opts.deviceId?.trim() || null;
  if (!hw && !deviceId) return;
  const keysToDelete: string[] = [];

  if (hw) {
    const sqlSessions = await db.getAllSessionsForUser(userId);
    for (const sess of sqlSessions) {
      if (sess.hardware_id && hardwareIdsMatch(sess.hardware_id, hw)) {
        keysToDelete.push(`session:${userId}:${String(sess.device_id)}`);
      }
    }
  }

  const kvSessions = await kv.getByPrefix(`session:${userId}:`);
  for (const item of kvSessions) {
    const key = String(item.key);
    if (key.startsWith('session:token:')) continue;
    const v = item.value ?? {};
    const vHw = v.hardwareId != null ? String(v.hardwareId) : null;
    const parts = key.split(':');
    const sessDevId = v.deviceId ? String(v.deviceId) : parts.slice(2).join(':');
    if (hw && vHw && hardwareIdsMatch(vHw, hw)) keysToDelete.push(key);
    else if (deviceId && sessDevId === deviceId) keysToDelete.push(key);
  }
  const unique = [...new Set(keysToDelete)];
  if (unique.length > 0) await kv.mdel(unique);
}

async function deactivateUserDevice(userId: string, deviceId: string): Promise<void> {
  if (deviceId.startsWith('logindev:')) {
    const hw = deviceId.slice('logindev:'.length);
    const s = (await import('./pg_client.ts')).getSql();
    await s`
      UPDATE user_login_devices SET
        status = 'pending',
        approved_at = NULL,
        updated_at = NOW()
      WHERE user_id = ${userId}::uuid AND LOWER(hardware_id) = LOWER(${hw})
    `;
    const sessions = await db.getAllSessionsForUser(userId);
    for (const sess of sessions) {
      if (sess.hardware_id && hardwareIdsMatch(sess.hardware_id, hw)) {
        await db.setSessionActive(userId, String(sess.device_id), false);
        await kv.del(`session:${userId}:${String(sess.device_id)}`);
      }
    }
    await purgeKvSessionsForUserDevice(userId, { hardwareId: hw });
  } else if (!deviceId.startsWith('primary:')) {
    await db.setSessionActive(userId, deviceId, false);
    await kv.del(`session:${userId}:${deviceId}`);
    await purgeKvSessionsForUserDevice(userId, { deviceId });
  }

  const sqlActive = await db.getActiveSessions(userId);
  await userDataPatchActiveSessions(userId, sqlActive.length);
}

function normalizeAdminDeviceId(deviceId: string, hardwareId?: string | null): string {
  const id = String(deviceId ?? '').trim();
  if (id.startsWith('logindev:') || id.startsWith('primary:')) return id;
  const hw = String(hardwareId ?? '').trim();
  if (hw) return `logindev:${hw}`;
  return id;
}

async function endWebPresenceForDevice(userId: string, deviceId: string): Promise<void> {
  if (!deviceId.startsWith('web_')) return;
  const s = getSql();
  await s`
    UPDATE web_presence_sessions
    SET ended_at = NOW(), end_reason = 'admin_device_remove'
    WHERE user_id = ${userId}::uuid
      AND device_id = ${deviceId}
      AND ended_at IS NULL
  `;
}

function resolveRemoveTargetKey(
  deviceId: string,
  hardwareId?: string | null,
): string | null {
  const hw = normalizeHardwareKey(
    hardwareId ??
      (deviceId.startsWith('logindev:') ? deviceId.slice('logindev:'.length) : null),
  );
  if (hw) return `logindev:${hw}`;
  const id = String(deviceId ?? '').trim();
  return id || null;
}

function deviceStillListed(
  devices: AdminDeviceRow[],
  targetKey: string | null,
): boolean {
  if (!targetKey) return false;
  return devices.some((d) => d.id === targetKey || d.deviceId === targetKey);
}

async function removeUserDevice(
  userId: string,
  deviceId: string,
  hardwareId?: string | null,
): Promise<void> {
  deviceId = normalizeAdminDeviceId(deviceId, hardwareId);
  const userData = await kv.get(`user:${userId}`);
  const row = await db.getUserById(userId);

  if (deviceId.startsWith('logindev:')) {
    const hw = deviceId.slice('logindev:'.length);
    const s = (await import('./pg_client.ts')).getSql();
    await s`
      DELETE FROM user_login_devices
      WHERE user_id = ${userId}::uuid AND LOWER(hardware_id) = LOWER(${hw})
    `;
    await purgeKvSessionsForUserDevice(userId, { hardwareId: hw });
    await db.deleteSessionTokensByHardwareId(userId, hw);
    await db.deleteSessionsByHardwareId(userId, hw);
    await db.clearRegisteredHardwareIfMatch(userId, hw);
    if (
      userData &&
      (hardwareIdsMatch(userData.hardwareId, hw) ||
        hardwareIdsMatch(userData.registeredDeviceId, hw))
    ) {
      userData.hardwareId = null;
      userData.registeredDeviceId = null;
      userData.registeredAt = null;
      await kv.set(`user:${userId}`, userData);
    } else if (row?.registered_hardware_id && hardwareIdsMatch(row.registered_hardware_id, hw)) {
      if (userData) {
        userData.hardwareId = null;
        userData.registeredDeviceId = null;
        userData.registeredAt = null;
        await kv.set(`user:${userId}`, userData);
      }
    }
  } else if (deviceId.startsWith('primary:')) {
    const hw = deviceId.slice('primary:'.length);
    if (userData) {
      if (userData.hardwareId === hw || userData.registeredDeviceId === hw) {
        userData.hardwareId = null;
        userData.registeredDeviceId = null;
        userData.registeredAt = null;
        await kv.set(`user:${userId}`, userData);
      }
    }
    await db.clearRegisteredHardware(userId);
    await purgeKvSessionsForUserDevice(userId, { hardwareId: hw });
  } else {
    const sessions = await db.getAllSessionsForUser(userId);
    const match = sessions.find(
      (s: { device_id: string; hardware_id?: string }) => s.device_id === deviceId,
    );
    await db.deleteSession(userId, deviceId);
    await kv.del(`session:${userId}:${deviceId}`);
    await endWebPresenceForDevice(userId, deviceId);
    await purgeKvSessionsForUserDevice(userId, {
      deviceId,
      hardwareId: match?.hardware_id ? String(match.hardware_id) : null,
    });
    const sessHw = match?.hardware_id ? String(match.hardware_id) : null;
    if (sessHw) {
      const s = getSql();
      await s`
        DELETE FROM user_login_devices
        WHERE user_id = ${userId}::uuid AND LOWER(hardware_id) = LOWER(${sessHw})
      `;
      await db.clearRegisteredHardwareIfMatch(userId, sessHw);
    }
    if (!deviceId.startsWith('web_') && !deviceId.includes(':')) {
      const s = getSql();
      await s`
        DELETE FROM user_login_devices
        WHERE user_id = ${userId}::uuid AND LOWER(hardware_id) = LOWER(${deviceId})
      `;
    }

    if (
      userData &&
      match?.hardware_id &&
      (hardwareIdsMatch(userData.hardwareId, match.hardware_id) ||
        hardwareIdsMatch(userData.registeredDeviceId, match.hardware_id))
    ) {
      userData.hardwareId = null;
      userData.registeredDeviceId = null;
      userData.registeredAt = null;
      await db.clearRegisteredHardwareIfMatch(userId, String(match.hardware_id));
      await kv.set(`user:${userId}`, userData);
    }
  }
}

async function adminForceLogoutUser(userId: string) {
  const userSessions = await kv.getByPrefix(`session:${userId}:`);
  const sessionKeys = userSessions
    .map((s: { key?: string }) => s.key)
    .filter((k: string | undefined): k is string => !!k && !k.startsWith('session:token:'));
  if (sessionKeys.length > 0) await kv.mdel(sessionKeys);
  await endAllWebPresenceForUser(userId, 'admin_force');
  const revokedJwt = await jwtAuth.revokeAllJwtSessionsForUser(userId);
  const revokedSecure = await security.revokeAllSessionsForUser(userId);
  await db.deleteAllSessions(userId);
  await userDataPatchActiveSessions(userId, 0);
  return { revokedJwt, revokedSecure, kvDeleted: sessionKeys.length };
}

/**
 * Admin middleware - Kullanıcının admin olduğunu doğrular
 */
export async function requireAdmin(c: any, next: any) {
  const accessToken = c.req.header('Authorization')?.split(' ')[1];
  
  if (!accessToken) {
    console.error('❌ requireAdmin: Access token yok');
    return c.json({ error: 'Unauthorized - No token' }, 401);
  }

  const method = String(c.req.method || 'GET').toUpperCase();
  const meta = {
    ipAddress: c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || undefined,
    userAgent: c.req.header('user-agent') || undefined,
  };

  let user: { id: string; username: string };

  // GET/HEAD: jti tüketme — panelde paralel liste istekleri (kullanıcı + cihaz vb.) 401 olmasın
  if (method === 'GET' || method === 'HEAD') {
    const active = await jwtAuth.verifyAccessTokenActive(accessToken);
    if (!active) {
      console.error('❌ requireAdmin: Geçersiz veya süresi dolmuş JWT (GET)');
      return c.json({
        error: 'Unauthorized - Invalid token',
        errorCode: 'TOKEN_INVALID',
      }, 401);
    }
    user = { id: active.sub, username: active.username };
  } else {
    // Yönetim paneli yazma: jti tüketme — Kaydet + cihaz sil vb. ardışık istekler 401 olmasın
    const path = String(c.req.path || '');
    const isAdminPanelWrite = path.includes('/make-server-47081311/admin/');

    if (isAdminPanelWrite) {
      const active = await jwtAuth.verifyAccessTokenActive(accessToken);
      if (!active) {
        console.error('❌ requireAdmin: Geçersiz JWT (admin yazma)');
        return c.json({
          error: 'Unauthorized - Invalid token',
          errorCode: 'TOKEN_INVALID',
        }, 401);
      }
      user = { id: active.sub, username: active.username };
    } else {
      const rotated = await jwtAuth.verifyAndRotateAccessToken(accessToken, meta);
      if (!rotated.ok) {
        console.error('❌ requireAdmin: Geçersiz JWT', rotated.errorCode);
        return c.json({
          error: 'Unauthorized - Invalid token',
          errorCode: rotated.errorCode,
        }, 401);
      }
      c.header('X-New-Access-Token', rotated.newToken);
      user = { id: rotated.sub, username: rotated.username };
    }
  }

  console.log('✅ requireAdmin: JWT kullanıcı:', user.id, user.username);

  let userData = await kv.get(`user:${user.id}`);

  if (!userData) {
    const row = await db.getUserById(user.id);
    if (!row || row.role !== 'admin') {
      return c.json({ error: 'Forbidden - Not admin' }, 403);
    }
    userData = {
      id: row.id,
      username: (row as { username?: string }).username ?? null,
      email: row.email ?? null,
      name: row.name,
      plan: 'admin',
      role: 'admin',
    };
  } else {
    const isAdmin =
      userData.plan === 'admin' ||
      userData.role === 'admin' ||
      (await db.getUserById(user.id))?.role === 'admin';
    if (!isAdmin) {
      console.error('❌ requireAdmin: KV\'de admin değil, plan:', userData.plan, 'role:', userData.role);
      return c.json({ error: 'Forbidden - Not admin' }, 403);
    }
    if (userData.plan !== 'admin' && userData.role !== 'admin') {
      userData.role = 'admin';
      userData.plan = 'admin';
    }
  }

  c.set('user', userData);
  c.set('userId', user.id);
  
  await next();
}

export function setupAdminEndpoints(app: Hono) {
  
  // ===== İSTATİSTİKLER =====
  
  /**
   * Admin dashboard istatistikleri
   */
  app.get('/make-server-47081311/admin/stats', requireAdmin, async (c) => {
    try {
      // KV'den tüm kullanıcıları al
      const allUsers = await kv.getByPrefix('user:');
      
      const freeUsers = allUsers.filter((u: any) => planForAdminUi(u.value) === 'free').length;
      const premiumUsers = allUsers.filter((u: any) => planForAdminUi(u.value) === 'premium').length;
      const adminUsers = allUsers.filter((u: any) => planForAdminUi(u.value) === 'admin').length;
      
      const sql = getSql();
      const files = await sql`SELECT * FROM bilgi`;
      const totalFiles = files.length;

      const freeFiles = files?.filter((f: any) => !f.asama || String(f.asama).trim() === '').length || 0;
      const premiumFiles = files?.filter((f: any) => f.asama && String(f.asama).trim() !== '').length || 0;

      const catCountRows = await sql`SELECT COUNT(*)::int AS c FROM kategoriler`;
      const totalCategories = Number((catCountRows[0] as { c: number }).c) || 0;

      const totalDownloads = files?.reduce((sum: number, f: any) => sum + (Number(f.down) || 0), 0) || 0;

      const recentDownloadsData = await sql`
        SELECT * FROM indirme_gecmisi ORDER BY indirilme_tarihi DESC LIMIT 10
      `;

      const recentDownloads = await Promise.all(
        (recentDownloadsData || []).map(async (d: any) => {
          const fRows = await sql`SELECT adi FROM bilgi WHERE id = ${d.dosya_id} LIMIT 1`;
          const file = fRows[0];
          const userData = await kv.get(`user:${d.kullanici_id}`);

          return {
            fileName: file?.adi || 'Unknown',
            userName: userData?.name || 'Unknown',
            downloadedAt: d.indirilme_tarihi,
          };
        }),
      );

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tdRows = await sql`
        SELECT COUNT(*)::int AS c FROM indirme_gecmisi
        WHERE indirilme_tarihi >= ${today.toISOString()}::timestamptz
      `;
      const todayDownloads = Number((tdRows[0] as { c: number }).c) || 0;

      // Bu haftanın yeni üyeleri
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekNewUsers = allUsers.filter((u: any) => 
        new Date(u.value.createdAt) >= weekAgo
      ).length;

      // Aktif oturumlar
      const activeSessions = allUsers.reduce((sum: number, u: any) => 
        sum + (u.value.activeSessions || 0), 0
      );

      const { getIpLoginSummary, getRecentLoginsWithGeo } = await import('./login_audit.tsx');
      const ipLoginSummary = await getIpLoginSummary(30);
      const recentLogins = await getRecentLoginsWithGeo(20);

      const { getGlobalOnlineSummary } = await import('./web_presence.tsx');
      const onlineSummary = await getGlobalOnlineSummary();

      return c.json({
        stats: {
          totalUsers: allUsers.length,
          freeUsers,
          premiumUsers,
          adminUsers,
          totalFiles: totalFiles || 0,
          freeFiles,
          premiumFiles,
          totalCategories: totalCategories || 0,
          totalDownloads,
          todayDownloads: todayDownloads || 0,
          weekNewUsers,
          activeSessions,
          onlineUsers: onlineSummary.onlineUsers,
          onlineConnections: onlineSummary.totalConnections,
          onlineWebSessions: onlineSummary.webSessions,
          recentDownloads,
          ipLoginSummary,
          recentLogins,
        },
      });
    } catch (error) {
      console.error('Error loading stats:', error);
      return c.json({ error: 'Failed to load stats' }, 500);
    }
  });

  app.post('/make-server-47081311/admin/users/:userId/force-logout', requireAdmin, async (c) => {
    try {
      const userId = c.req.param('userId');
      const userData = await kv.get(`user:${userId}`);
      if (!userData) return c.json({ error: 'Kullanıcı bulunamadı' }, 404);
      const result = await adminForceLogoutUser(userId);
      return c.json({
        success: true,
        message: 'Tüm oturumlar sonlandırıldı',
        ...result,
        revokedTotal: result.revokedJwt + result.revokedSecure,
      });
    } catch (error) {
      console.error('Error force logout:', error);
      return c.json({ error: 'Oturumlar kapatılamadı' }, 500);
    }
  });
  
  // ===== KULLANICI YÖNETİMİ =====
  
  /**
   * Tüm kullanıcıları listele
   */
  app.get('/make-server-47081311/admin/users', requireAdmin, async (c) => {
    try {
      // KV'den tüm kullanıcıları al
      const allKeys = await kv.getByPrefix('user:');
      const sql = getSql();
      const pgRows = await sql`SELECT id, login_approved, role, legacy_profile FROM users`;
      const pgById = new Map(pgRows.map((r: { id: string }) => [String(r.id), r]));
      
      console.log('📊 All keys from KV:', allKeys.length);
      
      const users = allKeys
        .filter((item: any) => item && item.key && item.value) // Geçerli olanları filtrele
        .map((item: any) => {
          const userData = item.value;
          const userId = item.key.replace('user:', '');
          const plan = planForAdminUi(userData);
          const pgRow = pgById.get(userId);
          const lp =
            pgRow?.legacy_profile && typeof pgRow.legacy_profile === 'object'
              ? (pgRow.legacy_profile as { expiresAt?: string | null })
              : {};
          const expiresAt =
            plan === 'admin'
              ? null
              : (userData.expiresAt ?? lp.expiresAt ?? null) || null;

          return {
            id: userId,
            username: userData.username || userData.email || 'N/A',
            email: userData.email ?? null,
            name: userData.name || 'Unknown',
            role: userData.role || 'user',
            plan,
            createdAt: userData.createdAt || new Date().toISOString(),
            expiresAt,
            downloadCount: userData.downloadCount || 0,
            activeSessions: userData.activeSessions || 0,
            maxSessions: maxSessionsForUser(userData, pgRow),
            hardwareId:
              userData.hardwareId ??
              userData.registeredDeviceId ??
              null,
            registeredDeviceId: userData.registeredDeviceId ?? null,
            lastLoginAt: userData.lastLoginAt,
            loginApproved: loginApproval.readLoginApproved(pgRow ?? {}, userData),
          };
        });

      return c.json({ users });
    } catch (error) {
      console.error('Error loading users:', error);
      return c.json({ error: 'Failed to load users' }, 500);
    }
  });

  /**
   * Yeni kullanıcı oluştur
   */
  app.post('/make-server-47081311/admin/users/create', requireAdmin, async (c) => {
    try {
      const { username, password, name, plan, durationDays } = await c.req.json();
      const usernameNorm = String(username ?? '')
        .trim()
        .toLowerCase();
      if (!/^[a-z0-9_]{3,32}$/.test(usernameNorm)) {
        return c.json(
          {
            error:
              'Geçersiz kullanıcı adı. 3–32 karakter; yalnızca küçük harf, rakam ve alt çizgi (_).',
          },
          400,
        );
      }

      const newId = crypto.randomUUID();
      const hash = await pwd.hashPassword(password);
      const planVal = plan || 'free';
      const roleVal = planVal === 'admin' ? 'admin' : 'user';
      const sqlPlan = planVal === 'admin' ? 'premium' : planVal === 'premium' ? 'premium' : 'free';

      await db.createUser({
        id: newId,
        username: usernameNorm,
        email: null,
        passwordHash: hash,
        name,
        role: roleVal,
        plan: sqlPlan,
      });

      const userData = {
        id: newId,
        username: usernameNorm,
        email: null,
        name,
        role: roleVal,
        plan: planVal,
        createdAt: new Date().toISOString(),
        expiresAt: planVal !== 'admin' && durationDays
          ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()
          : null,
        maxSessions: effectiveMaxSessions({ role: roleVal, plan: planVal }),
        downloadLimit: roleVal === 'admin' ? -1 : planVal === 'premium' ? 50 : 5,
        dailyDownloads: 0,
        lastDownloadReset: new Date().toISOString(),
        downloadCount: 0,
        activeSessions: 0,
        hardwareId: null,
      };

      userData.loginApproved = true;
      await kv.set(`user:${newId}`, userData);
      await loginApproval.setUserLoginApproved(newId, true);

      return c.json({ 
        success: true, 
        user: userData 
      });
    } catch (error) {
      console.error('Error creating user:', error);
      return c.json({ error: 'Failed to create user' }, 500);
    }
  });

  /**
   * Excel (.xlsx) ile toplu kullanıcı içe aktarma — şifre sunucuda 11223344 olarak atanır.
   * multipart: alan adı `file`
   */
  app.post('/make-server-47081311/admin/users/import-file', requireAdmin, async (c) => {
    try {
      const ct = (c.req.header('content-type') || '').toLowerCase();
      if (!ct.includes('multipart/form-data')) {
        return c.json(
          { error: 'multipart/form-data ile dosya gönderin (alan adı: file).' },
          400,
        );
      }
      const form = await c.req.formData();
      const file = form.get('file');
      if (!(file instanceof Blob) || file.size === 0) {
        return c.json({ error: 'Geçerli bir .xlsx dosyası seçin.' }, 400);
      }
      const name = (file instanceof File && file.name) ? file.name : 'users.xlsx';
      if (!/\.xlsx$/i.test(name)) {
        return c.json({ error: 'Yalnızca .xlsx (Excel) dosyası kabul edilir.' }, 400);
      }
      const buf = await file.arrayBuffer();
      const rows = await parseUserImportBuffer(buf, name);
      if (rows.length === 0) {
        return c.json(
          { error: 'Dosyada kullanıcı adı içeren satır bulunamadı. Başlık satırında Kullanıcı adı / Username sütunu kullanın.' },
          400,
        );
      }
      const result = await executeUserImport(rows);
      return c.json({
        success: true,
        standardPasswordNote: 'Yeni oluşturulan tüm kullanıcıların giriş şifresi: 11223344',
        totalRows: rows.length,
        createdCount: result.created.length,
        skippedCount: result.skipped.length,
        errorsCount: result.errors.length,
        created: result.created,
        skipped: result.skipped,
        errors: result.errors,
      });
    } catch (error) {
      console.error('admin users import-file:', error);
      const msg = error instanceof Error ? error.message : 'İçe aktarma başarısız';
      return c.json({ error: msg }, 400);
    }
  });

  /**
   * Kullanıcı güncelle
   */
  app.put('/make-server-47081311/admin/users/:userId', requireAdmin, async (c) => {
    try {
      const userId = c.req.param('userId');
      const body = await c.req.json();
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const plan = body.plan as 'free' | 'premium' | 'admin' | undefined;
      const password = typeof body.password === 'string' ? body.password : '';
      const durationDays =
        body.durationDays != null && body.durationDays !== ''
          ? Number(body.durationDays)
          : null;

      if (!name) {
        return c.json({ error: 'İsim gerekli' }, 400);
      }
      if (!plan || !['free', 'premium', 'admin'].includes(plan)) {
        return c.json({ error: 'Geçerli üye tipi seçin (free, premium, admin)' }, 400);
      }
      if (password && password.length < 6) {
        return c.json({ error: 'Şifre en az 6 karakter olmalı' }, 400);
      }

      const pgRowEarly = await db.getUserById(userId);
      let userData = await kv.get(`user:${userId}`);

      if (!userData) {
        if (!pgRowEarly) {
          return c.json({ error: 'Kullanıcı bulunamadı' }, 404);
        }
        userData = rebuildUserKvFromPgRow(userId, pgRowEarly);
      }

      const roleVal = plan === 'admin' ? 'admin' : 'user';
      const sqlPlan = plan === 'admin' ? 'premium' : plan === 'premium' ? 'premium' : 'free';

      userData.name = name;
      userData.plan = plan;
      userData.role = roleVal;
      const maxSessionsRaw = body.maxSessions;
      if (
        maxSessionsRaw != null &&
        maxSessionsRaw !== '' &&
        Number.isFinite(Number(maxSessionsRaw))
      ) {
        userData.maxSessions = Math.min(50, Math.max(1, Math.floor(Number(maxSessionsRaw))));
      } else {
        userData.maxSessions = effectiveMaxSessions({ role: roleVal, plan });
      }
      userData.downloadLimit = roleVal === 'admin' ? -1 : plan === 'premium' ? 50 : 5;

      if (plan === 'admin') {
        userData.expiresAt = null;
      } else if (durationDays != null && Number.isFinite(durationDays) && durationDays > 0) {
        userData.expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
      } else if (plan === 'premium' && !userData.expiresAt) {
        userData.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      } else if (plan === 'free') {
        userData.expiresAt = null;
      }

      const pgRow = pgRowEarly ?? (await db.getUserById(userId));
      const prevLp =
        pgRow?.legacy_profile && typeof pgRow.legacy_profile === 'object'
          ? (pgRow.legacy_profile as Record<string, unknown>)
          : {};

      try {
        await db.updateUser(userId, {
          name,
          role: roleVal,
          plan: sqlPlan,
          legacy_profile: {
            ...prevLp,
            kvRole: userData.role,
            kvPlan: userData.plan,
            maxSessions: userData.maxSessions,
            downloadLimit: userData.downloadLimit,
            expiresAt: userData.expiresAt ?? null,
            downloadCount: userData.downloadCount,
            activeSessions: userData.activeSessions,
            lastLoginAt: userData.lastLoginAt,
            downloadsToday: userData.downloadsToday,
            registeredDeviceId: userData.registeredDeviceId,
            registeredAt: userData.registeredAt,
          },
        });
        if (password) {
          await db.updateUserPassword(userId, await pwd.hashPassword(password));
        }
      } catch (e) {
        console.error('admin user PUT: PostgreSQL senkron hatası:', e);
        return c.json({ error: 'Kullanıcı veritabanında güncellenemedi' }, 500);
      }

      await kv.set(`user:${userId}`, userData);

      return c.json({ success: true, user: userData });
    } catch (error) {
      console.error('Error updating user:', error);
      return c.json({ error: 'Kullanıcı güncellenemedi' }, 500);
    }
  });

  /**
   * Kullanıcı sil
   */
  app.delete('/make-server-47081311/admin/users/:userId', requireAdmin, async (c) => {
    try {
      const userId = c.req.param('userId');

      try {
        await db.deleteUser(userId);
      } catch {
        /* yoksa devam */
      }

      await kv.del(`user:${userId}`);

      return c.json({ success: true });
    } catch (error) {
      console.error('Error deleting user:', error);
      return c.json({ error: 'Failed to delete user' }, 500);
    }
  });

  /**
   * Tek kullanıcı detayı (düzenleme sayfası)
   */
  app.get('/make-server-47081311/admin/users/:userId', requireAdmin, async (c) => {
    try {
      const userId = c.req.param('userId');
      const userData = await kv.get(`user:${userId}`);
      const row = await db.getUserById(userId);
      if (!userData && !row) {
        return c.json({ error: 'Kullanıcı bulunamadı' }, 404);
      }
      const lp =
        row?.legacy_profile && typeof row.legacy_profile === 'object'
          ? (row.legacy_profile as { expiresAt?: string | null })
          : {};
      const merged = {
        id: userId,
        username: userData?.username ?? row?.username ?? 'N/A',
        email: userData?.email ?? row?.email ?? null,
        name: userData?.name ?? row?.name ?? 'Unknown',
        role: userData?.role ?? row?.role ?? 'user',
        plan: userData ? planForAdminUi(userData) : row?.role === 'admin' ? 'admin' : row?.plan ?? 'free',
        createdAt: userData?.createdAt ?? row?.created_at,
        expiresAt: userData?.expiresAt ?? lp.expiresAt ?? null,
        downloadCount: userData?.downloadCount ?? 0,
        activeSessions: userData?.activeSessions ?? 0,
        maxSessions: maxSessionsForUser(userData, row),
        hardwareId:
          row?.registered_hardware_id ??
          userData?.hardwareId ??
          userData?.registeredDeviceId ??
          null,
        registeredDeviceId: userData?.registeredDeviceId ?? row?.registered_hardware_id ?? null,
        registeredDeviceInfo: row?.registered_device_info ?? userData?.deviceInfo ?? null,
        lastLoginAt: userData?.lastLoginAt,
        loginApproved: loginApproval.readLoginApproved(row ?? {}, userData ?? undefined),
      };
      return c.json({ user: merged });
    } catch (error) {
      console.error('Error loading user:', error);
      return c.json({ error: 'Kullanıcı yüklenemedi' }, 500);
    }
  });

  /**
   * Hesap giriş onayı
   */
  app.post('/make-server-47081311/admin/users/:userId/approve-login', requireAdmin, async (c) => {
    try {
      const userId = c.req.param('userId');
      await loginApproval.setUserLoginApproved(userId, true);
      return c.json({ success: true, loginApproved: true });
    } catch (error) {
      console.error('approve-login:', error);
      const detail = postgresErrorDetail(error);
      return c.json(
        { error: detail.message ? `Giriş onayı verilemedi: ${detail.message}` : 'Giriş onayı verilemedi' },
        500,
      );
    }
  });

  app.post('/make-server-47081311/admin/users/:userId/revoke-login', requireAdmin, async (c) => {
    try {
      const userId = c.req.param('userId');
      await loginApproval.setUserLoginApproved(userId, false);
      return c.json({ success: true, loginApproved: false });
    } catch (error) {
      console.error('revoke-login:', error);
      return c.json({ error: 'Giriş onayı kaldırılamadı' }, 500);
    }
  });

  /**
   * Kullanıcının kayıtlı cihazları ve oturumları
   */
  app.get('/make-server-47081311/admin/users/:userId/devices', requireAdmin, async (c) => {
    try {
      const userId = c.req.param('userId');
      const devices = await listAdminUserDevices(userId);
      return c.json({ devices });
    } catch (error) {
      console.error('Error loading devices:', error);
      return c.json({ error: 'Cihazlar yüklenemedi' }, 500);
    }
  });

  /** Cihaz pasife al — deviceId gövdede (sabit yol :deviceId'den önce) */
  app.post(
    '/make-server-47081311/admin/users/:userId/devices/deactivate',
    requireAdmin,
    async (c) => {
      try {
        const userId = c.req.param('userId');
        const body = await c.req.json().catch(() => ({}));
        const deviceId = String(body.deviceId ?? '').trim();
        const hardwareId = body.hardwareId != null ? String(body.hardwareId).trim() : null;
        if (!deviceId) return c.json({ error: 'deviceId gerekli' }, 400);
        await deactivateUserDevice(userId, normalizeAdminDeviceId(deviceId, hardwareId));
        return c.json({ success: true, devices: await listAdminUserDevices(userId) });
      } catch (error) {
        console.error('Error deactivating device:', error);
        return c.json({ error: 'Cihaz pasife alınamadı' }, 500);
      }
    },
  );

  /** Cihaz sil — deviceId gövdede (sabit yol :deviceId'den önce) */
  app.post(
    '/make-server-47081311/admin/users/:userId/devices/remove',
    requireAdmin,
    async (c) => {
      try {
        const userId = c.req.param('userId');
        const body = await c.req.json().catch(() => ({}));
        const deviceId = String(body.deviceId ?? '').trim();
        const hardwareId = body.hardwareId != null ? String(body.hardwareId).trim() : null;
        if (!deviceId) return c.json({ error: 'deviceId gerekli' }, 400);
        const targetKey = resolveRemoveTargetKey(deviceId, hardwareId);
        await removeUserDevice(userId, deviceId, hardwareId);
        try {
          const sqlActive = await db.getActiveSessions(userId);
          await userDataPatchActiveSessions(userId, sqlActive.length);
        } catch (patchErr) {
          console.warn('activeSessions patch after remove:', patchErr);
        }
        const devices = await listAdminUserDevices(userId);
        if (targetKey && deviceStillListed(devices, targetKey)) {
          return c.json(
            { error: 'Cihaz veritabanından silinemedi. API yeniden deneyin veya Tüm kilidi sıfırla kullanın.', devices },
            409,
          );
        }
        return c.json({ success: true, devices });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Error deleting device:', msg, error);
        return c.json({ error: 'Cihaz silinemedi', detail: msg }, 500);
      }
    },
  );

  /**
   * Cihazı onayla (birincil donanım kilidi)
   */
  app.post(
    '/make-server-47081311/admin/users/:userId/devices/:deviceId/approve',
    requireAdmin,
    async (c) => {
      try {
        const userId = c.req.param('userId');
        const deviceId = decodeURIComponent(c.req.param('deviceId'));
        const { hardwareId: bodyHw, deviceInfo } = await c.req.json().catch(() => ({}));
        const hardwareId = await resolveHardwareIdForDeviceAction(userId, deviceId, bodyHw);
        if (!hardwareId) {
          return c.json({ error: 'Onaylanacak donanım kimliği bulunamadı' }, 400);
        }

        await loginApproval.approveLoginDevice(
          userId,
          hardwareId,
          deviceInfo ?? { approvedByAdmin: true, at: new Date().toISOString() },
        );

        if (!deviceId.startsWith('primary:') && !deviceId.startsWith('logindev:')) {
          await db.setSessionActive(userId, deviceId, true);
        }

        return c.json({ success: true, devices: await listAdminUserDevices(userId) });
      } catch (error) {
        console.error('Error approving device:', error);
        return c.json({ error: 'Cihaz onaylanamadı' }, 500);
      }
    },
  );

  /**
   * Cihazı pasife al (oturumu kapat; logindev kaydını onaysız bırak)
   */
  app.post(
    '/make-server-47081311/admin/users/:userId/devices/:deviceId/deactivate',
    requireAdmin,
    async (c) => {
      try {
        const userId = c.req.param('userId');
        const deviceId = decodeURIComponent(c.req.param('deviceId'));
        await deactivateUserDevice(userId, deviceId);
        return c.json({ success: true, devices: await listAdminUserDevices(userId) });
      } catch (error) {
        console.error('Error deactivating device:', error);
        return c.json({ error: 'Cihaz pasife alınamadı' }, 500);
      }
    },
  );

  /**
   * Cihazı sil (oturum + isteğe bağlı donanım kilidi)
   */
  app.delete(
    '/make-server-47081311/admin/users/:userId/devices/:deviceId',
    requireAdmin,
    async (c) => {
      try {
        const userId = c.req.param('userId');
        const deviceId = decodeURIComponent(c.req.param('deviceId'));
        const body = await c.req.json().catch(() => ({}));
        const hardwareId = body.hardwareId != null ? String(body.hardwareId).trim() : null;
        await removeUserDevice(userId, deviceId, hardwareId);
        return c.json({ success: true, devices: await listAdminUserDevices(userId) });
      } catch (error) {
        console.error('Error deleting device:', error);
        return c.json({ error: 'Cihaz silinemedi' }, 500);
      }
    },
  );

  /**
   * Kullanıcının cihaz kimliğini sıfırla
   */
  app.post('/make-server-47081311/admin/users/:userId/reset-hardware', requireAdmin, async (c) => {
    try {
      const userId = c.req.param('userId');

      const userData = await kv.get(`user:${userId}`);
      
      if (!userData) {
        return c.json({ error: 'User not found' }, 404);
      }

      userData.hardwareId = null;
      userData.registeredDeviceId = null;
      userData.registeredAt = null;
      await db.clearRegisteredHardware(userId);
      await kv.set(`user:${userId}`, userData);

      return c.json({ success: true });
    } catch (error) {
      console.error('Error resetting hardware ID:', error);
      return c.json({ error: 'Failed to reset hardware ID' }, 500);
    }
  });

  /**
   * Kullanıcının aboneliğini uzat
   */
  app.post('/make-server-47081311/admin/users/:userId/extend', requireAdmin, async (c) => {
    try {
      const userId = c.req.param('userId');
      const { days } = await c.req.json();

      const userData = await kv.get(`user:${userId}`);
      
      if (!userData) {
        return c.json({ error: 'User not found' }, 404);
      }

      if (userData.role === 'admin' || userData.plan === 'admin') {
        return c.json({ error: 'Admin users have unlimited access' }, 400);
      }

      const currentExpiry = userData.expiresAt ? new Date(userData.expiresAt) : new Date();
      const newExpiry = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000);
      
      userData.expiresAt = newExpiry.toISOString();
      await kv.set(`user:${userId}`, userData);

      return c.json({ 
        success: true, 
        expiresAt: userData.expiresAt 
      });
    } catch (error) {
      console.error('Error extending subscription:', error);
      return c.json({ error: 'Failed to extend subscription' }, 500);
    }
  });

  /**
   * Kullanıcının indirme geçmişini getir
   */
  app.get('/make-server-47081311/admin/users/:userId/downloads', requireAdmin, async (c) => {
    try {
      const userId = c.req.param('userId');

      const sql = getSql();
      const downloads = await sql`
        SELECT * FROM indirme_gecmisi WHERE kullanici_id = ${userId}
        ORDER BY indirilme_tarihi DESC LIMIT 100
      `;

      const enrichedDownloads = await Promise.all(
        (downloads || []).map(async (download: any) => {
          const fRows = await sql`SELECT adi FROM bilgi WHERE id = ${download.dosya_id} LIMIT 1`;
          const fileData = fRows[0];
          let categoryName = 'Unknown';
          if (download.kategori_id != null) {
            const cRows = await sql`SELECT kategori_adi FROM kategoriler WHERE id = ${download.kategori_id} LIMIT 1`;
            if (cRows[0]) categoryName = cRows[0].kategori_adi as string;
          }

          return {
            id: download.id,
            fileName: fileData?.adi || 'Unknown',
            categoryName,
            downloadedAt: download.indirilme_tarihi,
            fileSize: download.dosya_boyutu,
          };
        }),
      );

      return c.json({ downloads: enrichedDownloads });
    } catch (error) {
      console.error('Error loading user downloads:', error);
      return c.json({ error: 'Failed to load downloads' }, 500);
    }
  });

  // ===== DOSYA YÖNETİMİ =====

  /**
   * Tüm dosyaları listele
   */
  app.get('/make-server-47081311/admin/files', requireAdmin, async (c) => {
    try {
      const page = Math.max(1, parseInt(String(c.req.query('page') || '1'), 10) || 1);
      const limitRaw = parseInt(String(c.req.query('limit') || '50'), 10);
      const limit = Number.isFinite(limitRaw)
        ? Math.min(200, Math.max(10, limitRaw))
        : 50;
      const offset = (page - 1) * limit;

      const search = (c.req.query('search') || '').trim();
      const rawCategoryId = (c.req.query('categoryId') || '').trim();
      /** Sadece sayısal kategori id; aksi halde filtre uygulanmaz (UI/DB çöp değer 22P02 önler) */
      const categoryId =
        rawCategoryId && rawCategoryId !== 'all' && /^[0-9]+$/.test(rawCategoryId) ? rawCategoryId : '';

      const sql = getSql();

      let conditions = sql`TRUE`;
      if (search) {
        const esc = escapeIlikePattern(
          String(search)
            .toLocaleLowerCase('tr-TR')
            .replace(/i̇/g, 'i')
            .trim(),
        );
        const pat = `%${esc}%`;
        const catMatchRows = await sql`
          SELECT id FROM kategoriler
          WHERE REPLACE(LOWER(TRANSLATE(COALESCE(kategori_adi, ''), 'İIıŞşĞğÜüÖöÇç', 'iiisSGgUuOoCc')), 'i̇', 'i') LIKE ${pat} ESCAPE '\\'
          LIMIT 400
        `;
        const catIdStrs = (catMatchRows || [])
          .map((r: { id?: unknown }) => String(r.id ?? '').trim())
          .filter((s) => /^[0-9]+$/.test(s));
        conditions = sql`${conditions} AND (
          REPLACE(LOWER(TRANSLATE(COALESCE(b.adi, ''), 'İIıŞşĞğÜüÖöÇç', 'iiisSGgUuOoCc')), 'i̇', 'i') LIKE ${pat} ESCAPE '\\'
          OR REPLACE(LOWER(TRANSLATE(COALESCE(b.bildiri, ''), 'İIıŞşĞğÜüÖöÇç', 'iiisSGgUuOoCc')), 'i̇', 'i') LIKE ${pat} ESCAPE '\\'
          OR REPLACE(LOWER(TRANSLATE(COALESCE(b.asama, ''), 'İIıŞşĞğÜüÖöÇç', 'iiisSGgUuOoCc')), 'i̇', 'i') LIKE ${pat} ESCAPE '\\'
          ${
            catIdStrs.length > 0
              ? sql`OR trim(coalesce(b.katid::text, '')) IN ${sql(catIdStrs)} OR trim(coalesce(b.altkat::text, '')) IN ${sql(catIdStrs)}`
              : sql``
          }
        )`;
      }
      /** LISTELEME_DB_SABLONU: bilgi.altkat veya katid ile eşleşen kayıtlar */
      if (categoryId) {
        conditions = sql`${conditions} AND (
          trim(coalesce(b.altkat::text, '')) = ${categoryId}
          OR trim(coalesce(b.katid::text, '')) = ${categoryId}
        )`;
      }

      const aggRows = await sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE trim(coalesce(b.asama, '')) <> '')::int AS premium,
          COUNT(*) FILTER (WHERE trim(coalesce(b.asama, '')) = '')::int AS free_cnt,
          COALESCE(SUM(b.down), 0)::bigint AS downloads
        FROM bilgi b
        WHERE ${conditions}
      `;
      const agg = aggRows[0] as {
        total: number;
        premium: number;
        free_cnt: number;
        downloads: string | bigint;
      };

      const total = Number(agg?.total) || 0;
      const totalPages = Math.max(1, Math.ceil(total / limit));

      /** JOIN yok: bilgi.katid/altkat içinde metin çöpü (::integer) 22P02 üretir; kategori adı sonradan eşlenir */
      const rows = await sql`
        SELECT
          b.id,
          b.adi,
          b.link,
          b.katid,
          b.altkat,
          b.down,
          b.asama,
          b.tarih,
          b.boyut,
          b.bildiri
        FROM bilgi b
        WHERE ${conditions}
        ORDER BY b.tarih DESC NULLS LAST, b.id DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      const seedIds = new Set<number>();
      for (const r of rows || []) {
        const k = bilgiNumericId((r as { katid?: unknown }).katid);
        const a = bilgiNumericId((r as { altkat?: unknown }).altkat);
        if (k != null) seedIds.add(k);
        if (a != null) seedIds.add(a);
      }
      const kategoriMap = await loadKategoriMap(sql, [...seedIds]);

      const enrichedFiles = (rows || []).map((file: any) => {
        const boyutNum = parseFloat(String(file.boyut ?? '').replace(',', '.'));
        const sizeBytes = Number.isFinite(boyutNum) && boyutNum > 0 ? boyutNum : undefined;
        const { mainCategoryName, subCategoryName, listCategoryName } = bilgiCategoryDisplay(
          kategoriMap,
          file.katid,
          file.altkat,
        );
        const categoryName = listCategoryName;

        return {
          id: String(file.id),
          name: file.adi || 'Unknown',
          downloadUrl: file.link,
          categoryId: file.katid != null ? String(file.katid) : '',
          categoryName,
          mainCategoryName,
          subCategoryName,
          listCategoryName,
          altkat: file.altkat != null ? String(file.altkat) : '',
          boyutRaw: file.boyut != null ? String(file.boyut) : '',
          bildiri: file.bildiri != null ? String(file.bildiri) : '',
          downloadCount: file.down || 0,
          isPremium: !!(file.asama && String(file.asama).trim() !== ''),
          createdAt: file.tarih || new Date().toISOString(),
          size: sizeBytes,
        };
      });

      return c.json({
        files: enrichedFiles,
        page,
        limit,
        total,
        totalPages,
        stats: {
          total,
          premium: Number(agg?.premium) || 0,
          free: Number(agg?.free_cnt) || 0,
          downloads: Number(agg?.downloads) || 0,
        },
      });
    } catch (error) {
      console.error('Error loading files:', error);
      const d = postgresErrorDetail(error);
      return c.json(
        {
          error: 'Dosya listesi yüklenemedi',
          detail: d.code ? `${d.code}: ${d.message}` : d.message,
        },
        500,
      );
    }
  });

  /**
   * Yeni dosya ekle
   */
  app.post('/make-server-47081311/admin/files/create', requireAdmin, async (c) => {
    try {
      const body = await c.req.json();
      const { name, downloadUrl, categoryId, altkat, boyut, tarih, isImage } = body;
      const linkToSave = gdrive.normalizeDriveUrlToUsercontent(downloadUrl) || downloadUrl;
      const altkatVal = typeof altkat === 'string' ? altkat : '';
      const boyutVal = boyut != null && boyut !== '' ? String(boyut) : '';
      const bildiriVal = isImage === true || isImage === 'true' ? 'RESİM' : 'İNDİRİN';
      let tarihVal: Date | null = null;
      if (typeof tarih === 'string' && tarih.trim()) {
        const parsed = new Date(tarih);
        if (!Number.isNaN(parsed.getTime())) tarihVal = parsed;
      }

      const sql = getSql();
      const cid = parseInt(String(categoryId), 10);
      if (!Number.isFinite(cid)) {
        return c.json({ error: 'Geçersiz kategori (katid)' }, 400);
      }
      const catRows = await sql`SELECT id FROM kategoriler WHERE id = ${cid} LIMIT 1`;
      if (!catRows?.length) {
        return c.json({ error: 'Kategori bulunamadı; önce kategori oluşturun.' }, 400);
      }
      const leafId = parseInt(altkatVal || String(categoryId), 10);
      if (!Number.isFinite(leafId)) {
        return c.json({ error: 'Geçersiz alt kategori (altkat)' }, 400);
      }
      const leafRows = await sql`SELECT id FROM kategoriler WHERE id = ${leafId} LIMIT 1`;
      if (!leafRows?.length) {
        return c.json({ error: 'Alt kategori bulunamadı.' }, 400);
      }

      const rows = await sql`
        INSERT INTO bilgi (adi, link, katid, altkat, asama, down, tarih, boyut, bildiri)
        VALUES (
          ${name},
          ${linkToSave},
          ${String(categoryId)},
          ${altkatVal},
          ${''},
          0,
          ${tarihVal ?? new Date()},
          ${boyutVal},
          ${bildiriVal}
        )
        RETURNING *
      `;
      const data = rows[0];
      await bumpLastPublishedFileId(Number(data.id));

      return c.json({ success: true, file: data });
    } catch (error) {
      const { code, message } = postgresErrorDetail(error);
      console.error('Error creating file:', code, message, error);
      let hint = 'Bilgi kaydı eklenemedi';
      if (code === '42501' || /row-level security/i.test(message)) {
        hint = 'Veritabanı RLS INSERT engelliyor. bilgi tablosu için API politikalarını kontrol edin.';
      } else if (code === '23503') {
        hint = 'Geçersiz kategori veya ilişkili alan (foreign key).';
      }
      return c.json({ error: hint, detail: message || undefined, code: code || undefined }, 500);
    }
  });

  /**
   * Dosya güncelle
   */
  app.put('/make-server-47081311/admin/files/:fileId', requireAdmin, async (c) => {
    try {
      const fileId = c.req.param('fileId');
      const body = await c.req.json();
      const { name, downloadUrl, categoryId, altkat, boyut, tarih, isImage } = body;
      const linkToSave = gdrive.normalizeDriveUrlToUsercontent(downloadUrl) || downloadUrl;
      const altkatVal = typeof altkat === 'string' ? altkat : '';
      const boyutVal = boyut != null && boyut !== '' ? String(boyut) : '';
      const bildiriVal = isImage === true || isImage === 'true' ? 'RESİM' : 'İNDİRİN';
      let tarihVal: Date | null = null;
      if (typeof tarih === 'string' && tarih.trim()) {
        const parsed = new Date(tarih);
        if (!Number.isNaN(parsed.getTime())) tarihVal = parsed;
      }

      const sql = getSql();
      const cid = parseInt(String(categoryId), 10);
      if (!Number.isFinite(cid)) {
        return c.json({ error: 'Geçersiz kategori (katid)' }, 400);
      }
      const catRows = await sql`SELECT id FROM kategoriler WHERE id = ${cid} LIMIT 1`;
      if (!catRows?.length) {
        return c.json({ error: 'Kategori bulunamadı.' }, 400);
      }
      const leafId = parseInt(altkatVal || String(categoryId), 10);
      if (!Number.isFinite(leafId)) {
        return c.json({ error: 'Geçersiz alt kategori (altkat)' }, 400);
      }
      const leafRows = await sql`SELECT id FROM kategoriler WHERE id = ${leafId} LIMIT 1`;
      if (!leafRows?.length) {
        return c.json({ error: 'Alt kategori bulunamadı.' }, 400);
      }

      const fid = parseInt(String(fileId), 10);
      const rows = await sql`
        UPDATE bilgi SET
          adi = ${name},
          link = ${linkToSave},
          katid = ${String(categoryId)},
          altkat = ${altkatVal},
          boyut = ${boyutVal},
          bildiri = ${bildiriVal},
          asama = ${''},
          tarih = COALESCE(${tarihVal}, tarih)
        WHERE id = ${fid}
        RETURNING *
      `;
      const data = rows[0];

      return c.json({ success: true, file: data });
    } catch (error) {
      const { code, message } = postgresErrorDetail(error);
      console.error('Error updating file:', code, message, error);
      return c.json({ error: 'Bilgi güncellenemedi', detail: message, code }, 500);
    }
  });

  /**
   * Dosya sil
   */
  app.delete('/make-server-47081311/admin/files/:fileId', requireAdmin, async (c) => {
    try {
      const fileId = c.req.param('fileId');
      const sql = getSql();
      await sql`DELETE FROM bilgi WHERE id = ${parseInt(String(fileId), 10)}`;

      return c.json({ success: true });
    } catch (error) {
      console.error('Error deleting file:', error);
      return c.json({ error: 'Failed to delete file' }, 500);
    }
  });

  // ===== KATEGORİ YÖNETİMİ =====

  /**
   * Tüm kategorileri listele
   */
  app.get('/make-server-47081311/admin/categories', requireAdmin, async (c) => {
    try {
      const sql = getSql();
      const categories = await sql`
        SELECT * FROM kategoriler
        WHERE durum IS DISTINCT FROM 'internal_stub'
          AND kategori_adi NOT LIKE '(ORT)%'
        ORDER BY ust_kategori_id ASC NULLS FIRST, sira ASC, kategori_adi ASC
      `;

      console.log(`📊 Backend: ${categories?.length || 0} kategori yüklendi`);

      const fileCountMap = new Map<number, number>();

      if (categories && categories.length > 0) {
        const bf = await sql`SELECT katid FROM bilgi`;
        (bf || []).forEach((file: any) => {
          const kid = Number(file.katid);
          if (Number.isFinite(kid)) {
            fileCountMap.set(kid, (fileCountMap.get(kid) || 0) + 1);
          }
        });
      }

      // Seviye hesaplama (parent chain'i takip ederek)
      const categoryMap = new Map();
      (categories || []).forEach(cat => {
        categoryMap.set(cat.id, cat);
      });

      const calculateLevel = (catId: number): number => {
        const cat = categoryMap.get(catId);
        if (!cat || !cat.ust_kategori_id) return 1;
        return 1 + calculateLevel(cat.ust_kategori_id);
      };

      // Kategorileri frontend formatına dönüştür
      const enrichedCategories = (categories || []).map((cat: any) => ({
        id: cat.id,
        name: cat.kategori_adi || 'İsimsiz Kategori',
        parentId: cat.ust_kategori_id,
        level: calculateLevel(cat.id),
        fileCount: fileCountMap.get(cat.id) || 0,
        status: cat.durum || 'active',
        order: cat.sira || 0,
        description: cat.aciklama || '',
        image: cat.resim ? String(cat.resim) : '',
      }));

      console.log(`✅ Backend: ${enrichedCategories.length} kategori response'a eklendi`);
      console.log(`📌 Root kategoriler: ${enrichedCategories.filter(c => !c.parentId).length}`);

      return c.json({ categories: enrichedCategories });
    } catch (error) {
      console.error('Error loading categories:', error);
      return c.json({ error: 'Failed to load categories' }, 500);
    }
  });

  /**
   * Yeni kategori ekle
   */
  app.post('/make-server-47081311/admin/categories/create', requireAdmin, async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const rawName = body?.name;
      const parentId = body?.parentId;
      let sira = 0;
      if (body?.sira != null && body?.sira !== '') {
        const n = typeof body.sira === 'number' ? body.sira : parseInt(String(body.sira), 10);
        if (Number.isFinite(n)) {
          sira = n;
        }
      }
      const name = typeof rawName === 'string' ? rawName.trim() : '';
      if (!name) {
        return c.json({ error: 'Kategori adı boş olamaz' }, 400);
      }

      // Parent kategorinin seviyesini hesapla (3 seviye kontrolü için)
      let level = 1;
      const sql = getSql();
      let pid: number | null = null;
      if (parentId != null && parentId !== '') {
        pid = parseInt(String(parentId), 10);
        if (!Number.isFinite(pid)) {
          return c.json({ error: 'Geçersiz üst kategori kimliği' }, 400);
        }
        const parentRows = await sql`SELECT id FROM kategoriler WHERE id = ${pid} LIMIT 1`;
        if (!parentRows?.length) {
          return c.json({ error: 'Üst kategori veritabanında bulunamadı' }, 400);
        }

        const { depth: parentDepth, err: depthErr } = await depthOfCategoryRow(sql, pid);
        if (depthErr) {
          return c.json({ error: depthErr }, 400);
        }
        level = parentDepth + 1;
      }

      if (level > 3) {
        return c.json({ error: 'En fazla 3 seviye kategori oluşturulabilir' }, 400);
      }

      const resim =
        typeof body.resim === 'string' && body.resim.trim() ? body.resim.trim() : null;

      const rows = await sql`
        INSERT INTO kategoriler (kategori_adi, ust_kategori_id, sira, resim)
        VALUES (${name}, ${pid}, ${sira}, ${resim})
        RETURNING *
      `;
      const data = rows[0];

      return c.json({ success: true, category: data });
    } catch (error) {
      const { code, message } = postgresErrorDetail(error);
      console.error('Error creating category:', code, message, error);
      let hint = 'Kategori eklenemedi';
      if (code === '42501' || /row-level security/i.test(message)) {
        hint =
          'Veritabanı RLS INSERT engelliyor. Sunucuda bir kez calistirin: psql $DATABASE_URL -f sql/12_kategoriler_rls_api_mutations.sql';
      } else if (code === '23503') {
        hint = 'Üst kategori referansı geçersiz (foreign key).';
      } else if (code === '23514') {
        hint = 'CHECK kisitlamasi (ornegin durum / alan araligi).';
      } else if (code === '23505') {
        hint = 'Benzersizlik ihlali (duplicate).';
      }
      return c.json({ error: hint, detail: message || undefined, code: code || undefined }, 500);
    }
  });

  /**
   * Kategori güncelle
   */
  app.put('/make-server-47081311/admin/categories/:categoryId', requireAdmin, async (c) => {
    try {
      const categoryId = c.req.param('categoryId');
      const body = await c.req.json().catch(() => ({}));

      const sql = getSql();
      const cid = parseInt(String(categoryId), 10);
      if (!Number.isFinite(cid)) {
        return c.json({ error: 'Geçersiz kategori id' }, 400);
      }

      const curRows = await sql`SELECT * FROM kategoriler WHERE id = ${cid} LIMIT 1`;
      if (!curRows?.length) {
        return c.json({ error: 'Kategori bulunamadı' }, 404);
      }
      const cur = curRows[0] as Record<string, unknown>;

      const nameIn = typeof body.name === 'string' ? body.name.trim() : '';
      const name = nameIn || String(cur.kategori_adi ?? '');

      let ust: number | null = (cur.ust_kategori_id as number | null) ?? null;
      if ('parentId' in body) {
        const p = body.parentId;
        if (p === null || p === undefined || p === '') {
          ust = null;
        } else {
          const pid = parseInt(String(p), 10);
          if (!Number.isFinite(pid)) {
            return c.json({ error: 'Geçersiz üst kategori' }, 400);
          }
          if (pid === cid) {
            return c.json({ error: 'Kategori kendi altında olamaz' }, 400);
          }
          const pr = await sql`SELECT id FROM kategoriler WHERE id = ${pid} LIMIT 1`;
          if (!pr?.length) {
            return c.json({ error: 'Üst kategori bulunamadı' }, 400);
          }
          const cycleRows = await sql`
            WITH RECURSIVE sub AS (
              SELECT id FROM kategoriler WHERE id = ${cid}
              UNION ALL
              SELECT k.id FROM kategoriler k INNER JOIN sub ON k.ust_kategori_id = sub.id
            )
            SELECT 1 AS x FROM sub WHERE id = ${pid} LIMIT 1
          `;
          if (cycleRows?.length) {
            return c.json({ error: 'Üst kategori bu kategorinin alt ağacında olamaz (döngü).' }, 400);
          }
          const { depth: parentDepth, err: pErr } = await depthOfCategoryRow(sql, pid);
          if (pErr) {
            return c.json({ error: pErr }, 400);
          }
          const maxChildDepth = await sql`
            WITH RECURSIVE d AS (
              SELECT id, 0 AS dep FROM kategoriler WHERE id = ${cid}
              UNION ALL
              SELECT k.id, d.dep + 1 FROM kategoriler k INNER JOIN d ON k.ust_kategori_id = d.id
            )
            SELECT COALESCE(MAX(dep), 0)::int AS m FROM d
          `;
          const m = Number((maxChildDepth[0] as { m?: number })?.m) || 0;
          if (parentDepth + 1 + m > 3) {
            return c.json({ error: 'Taşıma sonrası en fazla 3 seviye aşılır' }, 400);
          }
          ust = pid;
        }
      }

      let aciklama = cur.aciklama != null ? String(cur.aciklama) : '';
      if (typeof body.aciklama === 'string') {
        aciklama = body.aciklama;
      }

      let durum = cur.durum != null ? String(cur.durum) : 'active';
      if (typeof body.durum === 'string' && body.durum.trim()) {
        durum = body.durum.trim();
      }

      let sira = Number(cur.sira) || 0;
      if (body.sira !== undefined && body.sira !== null) {
        const sn = parseInt(String(body.sira), 10);
        if (Number.isFinite(sn)) sira = sn;
      }

      let resim = cur.resim != null ? String(cur.resim) : null;
      if (typeof body.resim === 'string') {
        resim = body.resim.trim() || null;
      }

      const rows = await sql`
        UPDATE kategoriler SET
          kategori_adi = ${name},
          ust_kategori_id = ${ust},
          aciklama = ${aciklama},
          durum = ${durum},
          sira = ${sira},
          resim = ${resim}
        WHERE id = ${cid}
        RETURNING *
      `;
      const data = rows[0];

      return c.json({ success: true, category: data });
    } catch (error) {
      const { code, message } = postgresErrorDetail(error);
      console.error('Error updating category:', code, message, error);
      return c.json({ error: 'Kategori güncellenemedi', detail: message, code }, 500);
    }
  });

  /**
   * Kategori sil: alt ağacın tamamı (özyinelemeli) + bilgi.katid eşleşenleri tek UPDATE ile ayırır; silme yaprakları toplu DELETE ile (performans).
   */
  app.delete('/make-server-47081311/admin/categories/:categoryId', requireAdmin, async (c) => {
    try {
      const categoryId = c.req.param('categoryId');
      const sql = getSql();
      const cid = parseInt(String(categoryId), 10);
      if (!Number.isFinite(cid)) {
        return c.json({ error: 'Geçersiz kategori id' }, 400);
      }

      const exists = await sql`SELECT id FROM kategoriler WHERE id = ${cid} LIMIT 1`;
      if (!exists?.length) {
        return c.json({ error: 'Kategori bulunamadı' }, 404);
      }

      await sql`
        WITH RECURSIVE descendants AS (
          SELECT id FROM kategoriler WHERE id = ${cid}
          UNION ALL
          SELECT k.id FROM kategoriler k INNER JOIN descendants d ON k.ust_kategori_id = d.id
        )
        UPDATE bilgi b
        SET katid = ''
        WHERE trim(coalesce(b.katid::text, '')) ~ '^[0-9]+$'
          AND trim(b.katid::text) IN (SELECT id::text FROM descendants)
      `;

      let totalDeleted = 0;
      for (let guard = 0; guard < 32; guard++) {
        const del = await sql`
          DELETE FROM kategoriler k
          WHERE k.id IN (
            WITH RECURSIVE tree AS (
              SELECT id FROM kategoriler WHERE id = ${cid}
              UNION ALL
              SELECT x.id FROM kategoriler x INNER JOIN tree t ON x.ust_kategori_id = t.id
            )
            SELECT t2.id FROM tree t2
            WHERE NOT EXISTS (
              SELECT 1 FROM kategoriler c
              WHERE c.ust_kategori_id = t2.id
                AND c.id IN (SELECT t3.id FROM tree t3)
            )
          )
          RETURNING k.id
        `;
        const n = del?.length || 0;
        totalDeleted += n;
        if (n === 0) break;
      }

      return c.json({ success: true, deletedApprox: totalDeleted });
    } catch (error) {
      const { code, message } = postgresErrorDetail(error);
      console.error('Error deleting category:', code, message, error);
      return c.json({ error: 'Kategori silinemedi', detail: message, code }, 500);
    }
  });

  // ===== CMS: slaytlar & bilgi sayfaları =====

  app.get('/make-server-47081311/admin/cms/hero-slides', requireAdmin, async (c) => {
    try {
      const sql = getSql();
      await ensureCmsContentTables(sql);
      const rows = await sql`
        SELECT id, sort_order, title, subtitle, description, button_text, button_url, image_url, gradient, is_active, created_at, updated_at
        FROM cms_hero_slides
        ORDER BY sort_order ASC NULLS LAST, created_at ASC
      `;
      const slides = (rows || []).map((r: any) => ({
        id: r.id,
        sortOrder: r.sort_order,
        title: r.title,
        subtitle: r.subtitle,
        description: r.description,
        buttonText: r.button_text,
        buttonUrl: r.button_url,
        imageUrl: r.image_url,
        gradient: r.gradient,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      return c.json({ success: true, slides });
    } catch (error) {
      console.error('admin cms hero list:', error);
      const { message } = postgresErrorDetail(error);
      return c.json({ error: 'Slaytlar yüklenemedi', detail: message }, 500);
    }
  });

  app.post('/make-server-47081311/admin/cms/hero-slides', requireAdmin, async (c) => {
    try {
      const sql = getSql();
      await ensureCmsContentTables(sql);
      const body = await c.req.json();
      const sortOrder = Number(body.sortOrder) || 0;
      const title = String(body.title ?? '');
      const subtitle = String(body.subtitle ?? '');
      const description = String(body.description ?? '');
      const buttonText = String(body.buttonText ?? '');
      const buttonUrl = String(body.buttonUrl ?? '#');
      const imageUrl = String(body.imageUrl ?? '');
      const gradient = String(body.gradient ?? 'from-blue-900 via-purple-900 to-pink-900');
      const isActive = body.isActive !== false;
      let createdAtVal: Date | null = null;
      if (typeof body.createdAt === 'string' && body.createdAt.trim()) {
        const parsed = new Date(body.createdAt);
        if (!Number.isNaN(parsed.getTime())) createdAtVal = parsed;
      }
      const rows = await sql`
        INSERT INTO cms_hero_slides (sort_order, title, subtitle, description, button_text, button_url, image_url, gradient, is_active, created_at)
        VALUES (${sortOrder}, ${title}, ${subtitle}, ${description}, ${buttonText}, ${buttonUrl}, ${imageUrl}, ${gradient}, ${isActive}, ${createdAtVal ?? new Date()})
        RETURNING id
      `;
      return c.json({ success: true, id: rows[0]?.id });
    } catch (error) {
      console.error('admin cms hero create:', error);
      const { message } = postgresErrorDetail(error);
      return c.json({ error: 'Slayt eklenemedi', detail: message }, 500);
    }
  });

  app.put('/make-server-47081311/admin/cms/hero-slides/:id', requireAdmin, async (c) => {
    try {
      const sql = getSql();
      await ensureCmsContentTables(sql);
      const id = c.req.param('id');
      const body = await c.req.json();
      const sortOrder = Number(body.sortOrder) || 0;
      const title = String(body.title ?? '');
      const subtitle = String(body.subtitle ?? '');
      const description = String(body.description ?? '');
      const buttonText = String(body.buttonText ?? '');
      const buttonUrl = String(body.buttonUrl ?? '#');
      const imageUrl = String(body.imageUrl ?? '');
      const gradient = String(body.gradient ?? 'from-blue-900 via-purple-900 to-pink-900');
      const isActive = !!body.isActive;
      let createdAtVal: Date | null = null;
      if (typeof body.createdAt === 'string' && body.createdAt.trim()) {
        const parsed = new Date(body.createdAt);
        if (!Number.isNaN(parsed.getTime())) createdAtVal = parsed;
      }
      await sql`
        UPDATE cms_hero_slides SET
          sort_order = ${sortOrder},
          title = ${title},
          subtitle = ${subtitle},
          description = ${description},
          button_text = ${buttonText},
          button_url = ${buttonUrl},
          image_url = ${imageUrl},
          gradient = ${gradient},
          is_active = ${isActive},
          created_at = COALESCE(${createdAtVal}, created_at),
          updated_at = NOW()
        WHERE id = ${id}::uuid
      `;
      return c.json({ success: true });
    } catch (error) {
      console.error('admin cms hero update:', error);
      const { message } = postgresErrorDetail(error);
      return c.json({ error: 'Slayt güncellenemedi', detail: message }, 500);
    }
  });

  app.delete('/make-server-47081311/admin/cms/hero-slides/:id', requireAdmin, async (c) => {
    try {
      const sql = getSql();
      await ensureCmsContentTables(sql);
      const id = c.req.param('id');
      await sql`DELETE FROM cms_hero_slides WHERE id = ${id}::uuid`;
      return c.json({ success: true });
    } catch (error) {
      console.error('admin cms hero delete:', error);
      const { message } = postgresErrorDetail(error);
      return c.json({ error: 'Slayt silinemedi', detail: message }, 500);
    }
  });

  app.get('/make-server-47081311/admin/cms/info-pages', requireAdmin, async (c) => {
    try {
      const limit = Math.min(100, Math.max(1, parseInt(String(c.req.query('limit') || '20'), 10) || 20));
      const page = Math.max(1, parseInt(String(c.req.query('page') || '1'), 10) || 1);
      const offset = (page - 1) * limit;
      const sql = getSql();
      const countRows = await sql`SELECT COUNT(*)::int AS c FROM cms_info_pages`;
      const total = Number((countRows[0] as { c: number })?.c) || 0;
      const rows = await sql`
        SELECT id, slug, title, description, sort_order, is_published, created_at, updated_at
        FROM cms_info_pages
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const pages = (rows || []).map((r: any) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        description: r.description,
        sortOrder: r.sort_order,
        isPublished: r.is_published,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      return c.json({
        success: true,
        pages,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch (error) {
      console.error('admin cms info list:', error);
      return c.json({ error: 'Bilgi sayfaları yüklenemedi' }, 500);
    }
  });

  app.post('/make-server-47081311/admin/cms/info-pages', requireAdmin, async (c) => {
    try {
      const body = await c.req.json();
      const slug = String(body.slug ?? '').trim().toLowerCase();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        return c.json({ error: 'Slug yalnızca küçük harf, rakam ve tire içerebilir' }, 400);
      }
      const title = String(body.title ?? '');
      const description = String(body.description ?? '');
      const sortOrder = Number(body.sortOrder) || 0;
      const isPublished = body.isPublished !== false;
      const sql = getSql();
      const rows = await sql`
        INSERT INTO cms_info_pages (slug, title, description, sort_order, is_published)
        VALUES (${slug}, ${title}, ${description}, ${sortOrder}, ${isPublished})
        RETURNING id
      `;
      return c.json({ success: true, id: rows[0]?.id });
    } catch (error: any) {
      console.error('admin cms info create:', error);
      if (String(error?.message || '').includes('unique')) {
        return c.json({ error: 'Bu slug zaten kullanılıyor' }, 400);
      }
      return c.json({ error: 'Sayfa eklenemedi' }, 500);
    }
  });

  app.put('/make-server-47081311/admin/cms/info-pages/:id', requireAdmin, async (c) => {
    try {
      const id = c.req.param('id');
      const body = await c.req.json();
      const slug = String(body.slug ?? '').trim().toLowerCase();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        return c.json({ error: 'Slug yalnızca küçük harf, rakam ve tire içerebilir' }, 400);
      }
      const title = String(body.title ?? '');
      const description = String(body.description ?? '');
      const sortOrder = Number(body.sortOrder) || 0;
      const isPublished = !!body.isPublished;
      const sql = getSql();
      await sql`
        UPDATE cms_info_pages SET
          slug = ${slug},
          title = ${title},
          description = ${description},
          sort_order = ${sortOrder},
          is_published = ${isPublished},
          updated_at = NOW()
        WHERE id = ${id}::uuid
      `;
      return c.json({ success: true });
    } catch (error: any) {
      console.error('admin cms info update:', error);
      if (String(error?.message || '').includes('unique')) {
        return c.json({ error: 'Bu slug zaten kullanılıyor' }, 400);
      }
      return c.json({ error: 'Sayfa güncellenemedi' }, 500);
    }
  });

  app.delete('/make-server-47081311/admin/cms/info-pages/:id', requireAdmin, async (c) => {
    try {
      const id = c.req.param('id');
      const sql = getSql();
      await sql`DELETE FROM cms_info_pages WHERE id = ${id}::uuid`;
      return c.json({ success: true });
    } catch (error) {
      console.error('admin cms info delete:', error);
      return c.json({ error: 'Sayfa silinemedi' }, 500);
    }
  });

  /**
   * CMS slayt görsel yükleme (Vite public → tarayıcıda /img/slayt/...):
   *   <proje_dizini>/public/img/slayt/<dosya>
   * DB'de saklanan URL:
   *   /img/slayt/<dosya>
   * Eski kayıtlar için GET /make-server-47081311/cms/image/<dosya> hâlâ public veya legacy img/slayt üzerinden sunulur.
   */
  app.post('/make-server-47081311/admin/cms/upload-image', requireAdmin, async (c) => {
    try {
      const form = await c.req.formData();
      const filePart = form.get('file');
      if (!(filePart instanceof File)) {
        return c.json({ error: 'file alanı zorunlu' }, 400);
      }

      if (filePart.size > MAX_CMS_IMAGE_BYTES) {
        return c.json({ error: 'Maksimum 8 MB görsel yükleyebilirsiniz' }, 400);
      }

      const original = String(filePart.name || 'slide-image');
      const originalBase = original.replace(/\.[^.]+$/, '');
      const baseName = sanitizeBaseName(originalBase);
      const extByMime = extFromMime(filePart.type);
      const extByName = (original.split('.').pop()?.toLowerCase() || '').replace(/[^a-z0-9]/g, '');
      const ext = extByMime !== 'bin' ? extByMime : extByName;
      const allowed = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg']);
      const safeExt = allowed.has(ext) ? ext : '';
      if (!safeExt) {
        return c.json({ error: 'Sadece jpg, jpeg, png, webp, gif, svg yüklenebilir' }, 400);
      }
      if (!String(filePart.type || '').startsWith('image/') && safeExt !== 'svg') {
        return c.json({ error: 'Sadece görsel dosyaları yüklenebilir' }, 400);
      }
      const fileName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${baseName}.${safeExt}`;

      const target = String(form.get('target') || 'slide').trim().toLowerCase();
      const isCategory = target === 'category' || target === 'kategori';
      const isPricing = target === 'pricing' || target === 'paket' || target === 'fiyat';
      const subDir = isCategory ? 'kategori' : isPricing ? 'paket' : 'slayt';
      const uploadDir = `${Deno.cwd()}/public/img/${subDir}`;
      await Deno.mkdir(uploadDir, { recursive: true });
      const bytes = new Uint8Array(await filePart.arrayBuffer());
      await Deno.writeFile(`${uploadDir}/${fileName}`, bytes);

      return c.json({
        success: true,
        fileName,
        imageUrl: `/img/${subDir}/${fileName}`,
      });
    } catch (error) {
      console.error('admin cms upload-image:', error);
      return c.json({ error: 'Görsel yüklenemedi' }, 500);
    }
  });

  // ===== CMS: Paket fiyatları (admin) =====
  app.get('/make-server-47081311/admin/cms/pricing-page', requireAdmin, async (c) => {
    try {
      const sql = getSql();
      await ensureCmsPricingPageTable(sql);
      const rows = await sql`SELECT payload, updated_at FROM cms_pricing_page WHERE id = 'default' LIMIT 1`;
      const row = rows[0] as { payload: unknown; updated_at?: string } | undefined;
      return c.json(
        { success: true, payload: row?.payload ?? null, updatedAt: row?.updated_at ?? null },
        200,
        { 'Cache-Control': 'private, no-store' },
      );
    } catch (error) {
      const d = postgresErrorDetail(error);
      console.error('admin cms pricing get:', d.code, d.message, error);
      /** DB yok / izin yok: panel 500 ile kırılmasın; varsayılan payload + uyarı */
      return c.json({
        success: true,
        payload: null,
        updatedAt: null,
        loadWarning:
          'Paket CMS veritabanı okunamadı; varsayılanlar yüklendi. Sunucu loguna bakın veya psql ile sql/10_cms_pricing.sql uygulayın.',
        loadWarningDetail: d.message || undefined,
        loadWarningCode: d.code || undefined,
      });
    }
  });

  app.put('/make-server-47081311/admin/cms/pricing-page', requireAdmin, async (c) => {
    try {
      const body = await c.req.json();
      const payload = body?.payload;
      if (!payload || typeof payload !== 'object' || !Array.isArray(payload.plans) || payload.plans.length === 0) {
        return c.json({ error: 'Geçersiz payload: plans dizisi gerekli' }, 400);
      }
      for (const p of payload.plans) {
        if (!p?.id || !p?.name) {
          return c.json({ error: 'Her pakette id ve name zorunlu' }, 400);
        }
      }
      const sql = getSql();
      await ensureCmsPricingPageTable(sql);
      const sqlJson = (sql as unknown as { json?: (v: unknown) => unknown }).json;
      if (typeof sqlJson === 'function') {
        await sql`
          INSERT INTO cms_pricing_page (id, payload, updated_at)
          VALUES ('default', ${sqlJson(payload)}, NOW())
          ON CONFLICT (id) DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = NOW()
        `;
      } else {
        const jsonStr = JSON.stringify(payload);
        await sql`
          INSERT INTO cms_pricing_page (id, payload, updated_at)
          VALUES ('default', ${jsonStr}::jsonb, NOW())
          ON CONFLICT (id) DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = NOW()
        `;
      }
      return c.json({ success: true });
    } catch (error) {
      console.error('admin cms pricing put:', error);
      return c.json({ error: 'Paket verisi kaydedilemedi' }, 500);
    }
  });

  // Yüklenen slayt görselini sun (herkes okuyabilir) — önce public, sonra eski img/slayt
  // ===== Dosya istekleri (kullanıcı talepleri) =====
  app.get('/make-server-47081311/admin/file-requests', requireAdmin, async (c) => {
    try {
      const statusFilter = String(c.req.query('status') || '').trim();
      const sql = getSql();
      const rows =
        statusFilter && statusFilter !== 'all'
          ? await sql`
              SELECT
                fr.id,
                fr.title,
                fr.description,
                fr.brand_hint,
                fr.status,
                fr.created_at,
                fr.updated_at,
                u.id AS user_id,
                u.username,
                u.email,
                u.name AS user_name
              FROM file_requests fr
              INNER JOIN users u ON u.id = fr.user_id
              WHERE fr.status = ${statusFilter}
              ORDER BY fr.created_at DESC
              LIMIT 300
            `
          : await sql`
              SELECT
                fr.id,
                fr.title,
                fr.description,
                fr.brand_hint,
                fr.status,
                fr.created_at,
                fr.updated_at,
                u.id AS user_id,
                u.username,
                u.email,
                u.name AS user_name
              FROM file_requests fr
              INNER JOIN users u ON u.id = fr.user_id
              ORDER BY fr.created_at DESC
              LIMIT 300
            `;

      return c.json({
        requests: (rows || []).map((r: Record<string, unknown>) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          brandHint: r.brand_hint,
          status: r.status,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          userId: r.user_id,
          username: r.username,
          email: r.email,
          userName: r.user_name,
        })),
      });
    } catch (error) {
      console.error('admin file-requests list:', error);
      return c.json({ error: 'Dosya istekleri yüklenemedi' }, 500);
    }
  });

  app.get('/make-server-47081311/admin/desktop-release', requireAdmin, async (c) => {
    try {
      const release = await desktopApp.getDesktopReleaseConfig();
      return c.json({ success: true, release });
    } catch (error) {
      console.error('admin desktop-release get:', error);
      return c.json({ error: 'Masaüstü sürüm ayarı yüklenemedi' }, 500);
    }
  });

  app.put('/make-server-47081311/admin/desktop-release', requireAdmin, async (c) => {
    try {
      const body = await c.req.json();
      const requiredVersion = body.requiredVersion ?? body.required_version;
      const latestVersion = body.latestVersion ?? body.latest_version;
      const downloadPath = body.downloadPath ?? body.download_path;
      if (requiredVersion != null && !String(requiredVersion).trim()) {
        return c.json({ error: 'requiredVersion boş olamaz' }, 400);
      }
      const release = await desktopApp.updateDesktopReleaseConfig({
        requiredVersion: requiredVersion != null ? String(requiredVersion).trim() : undefined,
        latestVersion: latestVersion != null ? String(latestVersion).trim() : undefined,
        downloadPath: downloadPath != null ? String(downloadPath).trim() : undefined,
      });
      return c.json({ success: true, release });
    } catch (error) {
      console.error('admin desktop-release put:', error);
      return c.json({ error: 'Masaüstü sürüm ayarı kaydedilemedi' }, 500);
    }
  });

  app.patch('/make-server-47081311/admin/file-requests/:id', requireAdmin, async (c) => {
    try {
      const id = c.req.param('id');
      const body = await c.req.json();
      const status = String(body.status ?? '').trim();
      const allowed = new Set(['pending', 'reviewing', 'done', 'rejected']);
      if (!allowed.has(status)) {
        return c.json({ error: 'Geçersiz durum' }, 400);
      }

      const sql = getSql();
      const rows = await sql`
        UPDATE file_requests
        SET status = ${status}, updated_at = NOW()
        WHERE id = ${id}::uuid
        RETURNING id, status, updated_at
      `;
      if (!rows?.length) return c.json({ error: 'İstek bulunamadı' }, 404);
      return c.json({
        success: true,
        request: { id: rows[0].id, status: rows[0].status, updatedAt: rows[0].updated_at },
      });
    } catch (error) {
      console.error('admin file-requests patch:', error);
      return c.json({ error: 'Durum güncellenemedi' }, 500);
    }
  });

  const deleteFileRequestHandler = async (c: { req: { param: (k: string) => string }; json: (body: unknown, status?: number) => Response }) => {
    try {
      const id = String(c.req.param('id') ?? '').trim();
      if (!id) return c.json({ error: 'id gerekli' }, 400);
      const sql = getSql();
      const rows = await sql`
        DELETE FROM file_requests WHERE id = ${id}::uuid RETURNING id
      `;
      if (!rows?.length) return c.json({ error: 'İstek bulunamadı' }, 404);
      return c.json({ success: true });
    } catch (error) {
      console.error('admin file-requests delete:', error);
      return c.json({ error: 'İstek silinemedi' }, 500);
    }
  };

  /** DELETE bazı proxy’lerde sorun çıkarabiliyor; sabit POST yolu */
  app.post(
    '/make-server-47081311/admin/file-requests/:id/delete',
    requireAdmin,
    deleteFileRequestHandler,
  );
  app.delete('/make-server-47081311/admin/file-requests/:id', requireAdmin, deleteFileRequestHandler);

  app.get('/make-server-47081311/cms/image/:fileName', async (c) => {
    try {
      const raw = c.req.param('fileName') || '';
      if (!/^[a-zA-Z0-9_.-]+$/.test(raw)) {
        return c.json({ error: 'Geçersiz dosya adı' }, 400);
      }
      const cwd = Deno.cwd();
      const publicPath = `${cwd}/public/img/slayt/${raw}`;
      const legacyPath = `${cwd}/img/slayt/${raw}`;
      let bytes: Uint8Array;
      try {
        bytes = await Deno.readFile(publicPath);
      } catch {
        bytes = await Deno.readFile(legacyPath);
      }
      const ext = raw.includes('.') ? raw.split('.').pop() || '' : '';
      return c.body(bytes, 200, {
        'Content-Type': mimeFromExt(ext),
        'Cache-Control': 'public, max-age=3600',
      });
    } catch (_error) {
      return c.json({ error: 'Görsel bulunamadı' }, 404);
    }
  });

  return app;
}