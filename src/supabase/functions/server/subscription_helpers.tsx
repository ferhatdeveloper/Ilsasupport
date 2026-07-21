/**
 * Premium abonelik bitiş tarihi (expiresAt) ile erişim kontrolleri.
 */

/** Demo premium satış / dosya kilidi — true = yalnızca premium/admin indirebilir */
export const PREMIUM_UPSELL_ENABLED = true;

export function mergeMembershipFields(
  userData: Record<string, unknown> | null | undefined,
  row?: { role?: string; plan?: string; legacy_profile?: unknown } | null,
): Record<string, unknown> {
  const base = userData && typeof userData === 'object' ? { ...userData } : {};
  const lp =
    row?.legacy_profile && typeof row.legacy_profile === 'object'
      ? (row.legacy_profile as Record<string, unknown>)
      : {};
  const role = String(base.role ?? lp.kvRole ?? row?.role ?? 'user');
  const planRaw = String(base.plan ?? lp.kvPlan ?? row?.plan ?? 'free');
  const plan = role === 'admin' ? 'admin' : planRaw;
  return {
    ...base,
    role,
    plan,
    expiresAt: (base.expiresAt ?? lp.expiresAt ?? null) as string | null,
  };
}

export function isPremiumPlanActive(userData: {
  plan?: string;
  role?: string;
  expiresAt?: string | null;
}): boolean {
  if (userData.role === 'admin' || userData.plan === 'admin') return true;
  if (userData.plan !== 'premium') return false;
  const ex = userData.expiresAt;
  if (!ex) return false;
  return new Date(ex).getTime() > Date.now();
}

export type MembershipGateResult =
  | { allowed: true }
  | {
      allowed: false;
      status: 403;
      error: string;
      errorCode: 'MEMBERSHIP_EXPIRED' | 'PREMIUM_EXPIRY_REQUIRED';
    };

/** Premium giriş / indirme — süre dolmuş veya tanımsızsa engelle */
export function checkMembershipForAccess(
  userData: { role?: string; plan?: string; expiresAt?: string | null } | null | undefined,
): MembershipGateResult {
  if (!userData) {
    return {
      allowed: false,
      status: 403,
      error: 'Oturum bilgisi alınamadı.',
      errorCode: 'MEMBERSHIP_EXPIRED',
    };
  }
  if (userData.role === 'admin' || userData.plan === 'admin') return { allowed: true };
  if (userData.plan !== 'premium') return { allowed: true };

  const ex = userData.expiresAt;
  if (!ex) {
    return {
      allowed: false,
      status: 403,
      error: 'Premium üyeliğiniz için geçerli bir bitiş tarihi yok. Yönetici ile iletişime geçin.',
      errorCode: 'PREMIUM_EXPIRY_REQUIRED',
    };
  }
  if (new Date(ex).getTime() <= Date.now()) {
    return {
      allowed: false,
      status: 403,
      error: 'Premium üyeliğinizin süresi dolmuş. Yenilemek için yönetici ile iletişime geçin.',
      errorCode: 'MEMBERSHIP_EXPIRED',
    };
  }
  return { allowed: true };
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

/** Free plan indirme yapamaz (premium upsell açıkken) */
export function canUserDownloadFiles(userData: {
  role?: string;
  plan?: string;
  expiresAt?: string | null;
} | null): boolean {
  if (!userData) return false;
  if (!PREMIUM_UPSELL_ENABLED) return true;
  if (userData.role === 'admin' || userData.plan === 'admin') return true;
  return isPremiumPlanActive(userData);
}
