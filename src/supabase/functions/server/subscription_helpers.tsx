/**
 * Premium abonelik bitiş tarihi (expiresAt) ile erişim kontrolleri.
 */

/** Demo premium satış / dosya kilidi — false = giriş yapan herkes indirebilir */
export const PREMIUM_UPSELL_ENABLED = false;

export function isPremiumPlanActive(userData: {
  plan?: string;
  role?: string;
  expiresAt?: string | null;
}): boolean {
  if (userData.role === 'admin' || userData.plan === 'admin') return true;
  if (userData.plan !== 'premium') return false;
  const ex = userData.expiresAt;
  if (!ex) return true;
  return new Date(ex).getTime() > Date.now();
}

export function effectiveMaxSessions(userData: {
  role?: string;
  plan?: string;
  maxSessions?: number;
}): number {
  if (userData.role === 'admin' || userData.plan === 'admin') return 10;
  const raw = Number(userData.maxSessions);
  if (Number.isFinite(raw)) {
    const n = Math.floor(raw);
    if (n >= 1 && n <= 50) return n;
  }
  if (userData.plan === 'premium') return 3;
  return 1;
}

/** PostgreSQL users.legacy_profile içindeki özel oturum hakkı */
export function legacyProfileMaxSessions(
  row?: { legacy_profile?: unknown } | null,
): number | undefined {
  const lp = row?.legacy_profile;
  if (!lp || typeof lp !== 'object') return undefined;
  const raw = Number((lp as { maxSessions?: number }).maxSessions);
  if (!Number.isFinite(raw)) return undefined;
  const n = Math.floor(raw);
  if (n >= 1 && n <= 50) return n;
  return undefined;
}

/** KV + PostgreSQL satırından geçerli eşzamanlı oturum limiti */
export function maxSessionsFromSources(
  userData?: { role?: string; plan?: string; maxSessions?: number } | null,
  row?: { role?: string; plan?: string; legacy_profile?: unknown } | null,
): number {
  return effectiveMaxSessions({
    role: userData?.role ?? row?.role,
    plan: userData?.plan ?? row?.plan,
    maxSessions: userData?.maxSessions ?? legacyProfileMaxSessions(row),
  });
}

/** KV oturum kayıtlarından benzersiz aktif cihaz sayısı */
export function countDistinctSessionDevices(
  sessions: Array<{ value?: { deviceId?: string }; deviceId?: string }>,
): number {
  const ids = new Set<string>();
  for (const item of sessions) {
    const id = item.value?.deviceId ?? item.deviceId;
    if (id) ids.add(String(id));
  }
  return ids.size;
}

/** Yeni cihazdan giriş: hak limiti dolmadıysa izin ver */
export function canAddSessionDevice(
  existingSessions: Array<{ value?: { deviceId?: string }; deviceId?: string }>,
  newDeviceId: string,
  maxSessions: number,
): boolean {
  const devices = new Set<string>();
  for (const item of existingSessions) {
    const id = item.value?.deviceId ?? item.deviceId;
    if (id) devices.add(String(id));
  }
  if (devices.has(newDeviceId)) return true;
  return devices.size < maxSessions;
}

export function canAccessPremiumContent(userData: {
  role?: string;
  plan?: string;
  expiresAt?: string | null;
} | null): boolean {
  if (!userData) return false;
  if (!PREMIUM_UPSELL_ENABLED) return true;
  if (userData.role === 'admin' || userData.plan === 'admin') return true;
  return userData.plan === 'premium' && isPremiumPlanActive(userData);
}
