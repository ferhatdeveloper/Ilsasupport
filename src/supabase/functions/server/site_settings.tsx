/**
 * Site geneli ayarlar (admin paneli) — PostgreSQL site_settings tablosu.
 */
import { getSql } from './pg_client.ts';

export type SiteSettingsMap = {
  login_mode: 'electron_only' | 'web_allowed';
  web_max_concurrent_sessions: number;
  web_session_heartbeat_seconds: number;
  notify_new_file_toast: boolean;
  last_published_file_id: number;
};

const DEFAULTS: SiteSettingsMap = {
  login_mode: 'electron_only',
  web_max_concurrent_sessions: 1,
  web_session_heartbeat_seconds: 45,
  notify_new_file_toast: true,
  last_published_file_id: 0,
};

let cache: { at: number; data: SiteSettingsMap } | null = null;
const CACHE_MS = 8_000;

export async function ensureSiteSettingsSchema(): Promise<void> {
  const s = getSql();
  await s.unsafe(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await s.unsafe(`
    CREATE TABLE IF NOT EXISTS web_presence_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      session_key TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      device_id TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      end_reason TEXT
    )
  `);
  await s.unsafe(`
    CREATE INDEX IF NOT EXISTS idx_web_presence_user_active
      ON web_presence_sessions (user_id) WHERE ended_at IS NULL
  `);
  await s.unsafe(`
    CREATE TABLE IF NOT EXISTS login_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      username TEXT,
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT,
      channel TEXT NOT NULL DEFAULT 'web',
      success BOOLEAN NOT NULL DEFAULT false,
      error_code TEXT,
      message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await s.unsafe(`
    CREATE INDEX IF NOT EXISTS idx_login_events_ip ON login_events (ip_address, created_at DESC)
  `);
  await s.unsafe(`
    CREATE TABLE IF NOT EXISTS electron_client_errors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      username TEXT,
      hardware_id TEXT,
      client_version TEXT,
      error_code TEXT,
      message TEXT NOT NULL,
      detail JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  for (const [k, v] of Object.entries(DEFAULTS)) {
    await s`
      INSERT INTO site_settings (key, value)
      VALUES (${k}, ${JSON.stringify(v)}::jsonb)
      ON CONFLICT (key) DO NOTHING
    `;
  }
}

async function loadAll(): Promise<SiteSettingsMap> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.data;
  const s = getSql();
  const rows = await s`SELECT key, value FROM site_settings`;
  const out = { ...DEFAULTS };
  for (const r of rows || []) {
    const k = String(r.key);
    const v = r.value;
    if (k in out) (out as Record<string, unknown>)[k] = v;
  }
  out.web_max_concurrent_sessions = Math.min(
    50,
    Math.max(1, Math.floor(Number(out.web_max_concurrent_sessions) || 1)),
  );
  out.web_session_heartbeat_seconds = Math.min(
    300,
    Math.max(15, Math.floor(Number(out.web_session_heartbeat_seconds) || 45)),
  );
  out.notify_new_file_toast = !!out.notify_new_file_toast;
  out.last_published_file_id = Math.max(0, Math.floor(Number(out.last_published_file_id) || 0));
  if (out.login_mode !== 'web_allowed') out.login_mode = 'electron_only';
  cache = { at: now, data: out };
  return out;
}

export async function getSiteSettings(): Promise<SiteSettingsMap> {
  await ensureSiteSettingsSchema();
  return await loadAll();
}

export function invalidateSiteSettingsCache(): void {
  cache = null;
}

export async function isElectronOnlyLogin(): Promise<boolean> {
  const s = await getSiteSettings();
  return s.login_mode === 'electron_only';
}

export async function updateSiteSettings(
  patch: Partial<SiteSettingsMap>,
): Promise<SiteSettingsMap> {
  await ensureSiteSettingsSchema();
  const s = getSql();
  for (const [key, val] of Object.entries(patch)) {
    if (!(key in DEFAULTS)) continue;
    await s`
      INSERT INTO site_settings (key, value, updated_at)
      VALUES (${key}, ${JSON.stringify(val)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  }
  invalidateSiteSettingsCache();
  return await loadAll();
}

export async function bumpLastPublishedFileId(fileId: number): Promise<void> {
  const id = Math.floor(Number(fileId) || 0);
  if (id <= 0) return;
  const cur = await getSiteSettings();
  if (id <= cur.last_published_file_id) return;
  await updateSiteSettings({ last_published_file_id: id });
}
