import { getBearerForApi } from './secureApi';

/**
 * Demo "Upgrade to Premium" popup ve premium indirme kilidi.
 * false = pasif (giriş yapan kullanıcılar indirebilir, popup açılmaz).
 */
export const PREMIUM_UPSELL_ENABLED = false;

/** Premium satış popup'ını aç (pasifken hiçbir şey yapmaz) */
export function openPremiumUpsell(onShowPremium?: () => void): void {
  if (PREMIUM_UPSELL_ENABLED && onShowPremium) onShowPremium();
}

/** İstemci: aktif premium veya admin */
export function isPremiumMember(
  user: { plan?: string; role?: string; expiresAt?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.plan === 'admin') return true;
  if (user.plan !== 'premium') return false;
  const ex = user.expiresAt;
  if (!ex) return true;
  return new Date(ex).getTime() > Date.now();
}

export function canDownloadFiles(
  user: { plan?: string; role?: string; expiresAt?: string | null } | null | undefined,
  accessToken: string | null | undefined,
): boolean {
  if (!getBearerForApi(accessToken)) return false;
  if (!PREMIUM_UPSELL_ENABLED) return true;
  return isPremiumMember(user);
}

type MembershipUserLike = {
  role?: string;
  plan?: string;
  expiresAt?: string | null;
  expires_at?: string | null;
  premiumExpiresAt?: string | null;
};

function readMembershipExpiresAt(user: MembershipUserLike): string | null {
  const raw = user.expiresAt ?? user.expires_at ?? user.premiumExpiresAt;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/** Üst çubukta üye adının yanında gösterilecek kalan süre metni */
export function formatMembershipRemainingLabel(
  user: MembershipUserLike | null | undefined,
): string | null {
  if (!user) return null;
  const role = String(user.role ?? '').toLowerCase();
  const plan = String(user.plan ?? '').toLowerCase();
  const isAdmin = role === 'admin' || plan === 'admin';
  const ex = readMembershipExpiresAt(user);
  if (!ex) {
    if (isAdmin) return 'Sınırsız';
    return null;
  }
  const days = Math.ceil((new Date(ex).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'süresi doldu';
  if (days === 0) return 'bugün bitiyor';
  if (days === 1) return '1 gün kaldı';
  return `${days} gün kaldı`;
}
