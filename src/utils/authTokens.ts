/** JWT (admin / web signin) ile secure oturum tokenını ayır */
export function isJwtAccessToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

export function getStoredJwtAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  const t = localStorage.getItem('access_token');
  return isJwtAccessToken(t) ? t : null;
}

export function setStoredJwtAccessToken(token: string) {
  if (!isJwtAccessToken(token)) {
    console.warn('setStoredJwtAccessToken: JWT bekleniyor, secure token ayrı tutulmalı');
    return;
  }
  localStorage.setItem('access_token', token);
}

export function clearStoredJwtAccessToken() {
  localStorage.removeItem('access_token');
}

/** Eski sürümler secure tokenı access_token içine yazmış olabilir */
export function sanitizeLegacyAccessTokenStorage() {
  if (typeof window === 'undefined') return;
  const t = localStorage.getItem('access_token');
  if (t && !isJwtAccessToken(t)) {
    localStorage.removeItem('access_token');
  }
}
