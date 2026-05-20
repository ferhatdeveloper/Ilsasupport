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
