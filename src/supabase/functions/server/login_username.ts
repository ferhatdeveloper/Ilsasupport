/** Giriş ve kayıt için kullanıcı adı: küçük harf, rakam ve alt çizgi; 3–32 karakter. */

export function normalizeLoginUsername(raw: string): string {
  return String(raw ?? '').trim().toLowerCase();
}

export function isValidLoginUsername(normalized: string): boolean {
  return /^[a-z0-9_]{3,32}$/.test(normalized);
}

/** PostgreSQL / KV satırından giriş ve token için geçerli kullanıcı adı (kv_store ile aynı mantık). */
export function canonicalLoginUsernameFromUserRow(row: {
  id: string;
  username?: string | null;
  email?: string | null;
}): string {
  const fromField =
    row.username != null && String(row.username).trim()
      ? normalizeLoginUsername(String(row.username))
      : '';
  if (isValidLoginUsername(fromField)) return fromField;
  const em = row.email;
  if (typeof em === 'string' && em.includes('@')) {
    const fromEmail = normalizeLoginUsername(em.split('@')[0] ?? '');
    if (isValidLoginUsername(fromEmail)) return fromEmail;
  }
  const fallback = normalizeLoginUsername(`u${String(row.id).replace(/-/g, '').slice(0, 12)}`);
  return isValidLoginUsername(fallback) ? fallback : 'user_legacy_fix';
}
