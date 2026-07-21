/**
 * Masaüstü (portable) uygulama sürümü — DB ile zorunlu minimum sürüm.
 */
import { getSql } from './pg_client.ts';

export type DesktopReleaseConfig = {
  requiredVersion: string;
  latestVersion: string;
  downloadUrl: string;
  downloadPath: string;
};

const DEFAULT_RELEASE: DesktopReleaseConfig = {
  requiredVersion: '1.0.3',
  latestVersion: '1.0.6',
  downloadPath: '/downloads/ILSA-Support-Portable-1.0.6.exe',
  downloadUrl: 'https://ilsasupport.com/downloads/ILSA-Support-Portable-1.0.6.exe',
};

function publicWebBase(): string {
  const fromEnv = (Deno.env.get('PUBLIC_WEB_URL') || Deno.env.get('WEB_URL') || '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return 'https://ilsasupport.com';
}

export function resolveDownloadUrl(downloadPath: string): string {
  const p = String(downloadPath || '').trim() || DEFAULT_RELEASE.downloadPath;
  if (/^https?:\/\//i.test(p)) return p;
  const base = publicWebBase();
  return `${base}${p.startsWith('/') ? p : `/${p}`}`;
}

/** semver karşılaştırma: -1 (a<b), 0, 1 */
export function compareSemver(a: string, b: string): number {
  const pa = String(a || '0').trim().split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '0').trim().split('.').map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

export function clientVersionFromDeviceInfo(
  deviceInfo: unknown,
  fallback?: string,
): string {
  if (deviceInfo && typeof deviceInfo === 'object' && 'version' in deviceInfo) {
    const v = (deviceInfo as { version?: unknown }).version;
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return String(fallback ?? '').trim();
}

export async function getDesktopReleaseConfig(): Promise<DesktopReleaseConfig> {
  try {
    const s = getSql();
    const rows = await s`
      SELECT required_version, latest_version, download_path
      FROM desktop_app_release
      WHERE id = 1
      LIMIT 1
    `;
    if (!rows.length) return { ...DEFAULT_RELEASE };
    const r = rows[0] as {
      required_version: string;
      latest_version: string;
      download_path: string;
    };
    const downloadPath = String(r.download_path || DEFAULT_RELEASE.downloadPath).trim();
    return {
      requiredVersion: String(r.required_version || DEFAULT_RELEASE.requiredVersion).trim(),
      latestVersion: String(r.latest_version || DEFAULT_RELEASE.latestVersion).trim(),
      downloadPath,
      downloadUrl: resolveDownloadUrl(downloadPath),
    };
  } catch {
    return { ...DEFAULT_RELEASE };
  }
}

export type DesktopVersionCheck =
  | { ok: true; release: DesktopReleaseConfig }
  | {
      ok: false;
      error: string;
      errorCode: 'UPDATE_REQUIRED';
      release: DesktopReleaseConfig;
      clientVersion: string;
    };

export async function assertDesktopClientVersion(
  clientVersion: string | undefined,
): Promise<DesktopVersionCheck> {
  const release = await getDesktopReleaseConfig();
  const client = String(clientVersion || '').trim() || '0.0.0';
  if (compareSemver(client, release.requiredVersion) < 0) {
    return {
      ok: false,
      error: `Masaüstü uygulamanız güncel değil (sizin: ${client}, gerekli: ${release.requiredVersion}). Lütfen yeni portable sürümü indirin.`,
      errorCode: 'UPDATE_REQUIRED',
      release,
      clientVersion: client,
    };
  }
  return { ok: true, release };
}

export async function updateDesktopReleaseConfig(patch: {
  requiredVersion?: string;
  latestVersion?: string;
  downloadPath?: string;
}): Promise<DesktopReleaseConfig> {
  const cur = await getDesktopReleaseConfig();
  const requiredVersion = String(patch.requiredVersion ?? cur.requiredVersion).trim();
  const latestVersion = String(patch.latestVersion ?? cur.latestVersion).trim();
  const downloadPath = String(patch.downloadPath ?? cur.downloadPath).trim();
  const s = getSql();
  await s`
    INSERT INTO desktop_app_release (id, required_version, latest_version, download_path, updated_at)
    VALUES (1, ${requiredVersion}, ${latestVersion}, ${downloadPath}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      required_version = EXCLUDED.required_version,
      latest_version = EXCLUDED.latest_version,
      download_path = EXCLUDED.download_path,
      updated_at = NOW()
  `;
  return await getDesktopReleaseConfig();
}
