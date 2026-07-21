/**
 * Admin: Excel (.xlsx) kullanıcı içe aktarma — şifre sunucuda sabitlenir.
 */
import * as pwd from './password.tsx';
import * as db from './db_helpers.tsx';
import * as kv from './kv_store.tsx';
import { effectiveMaxSessions } from './subscription_helpers.tsx';
import { isValidLoginUsername, normalizeLoginUsername } from './login_username.ts';

const STANDARD_IMPORT_PASSWORD = '11223344';

export type ImportPlan = 'free' | 'premium' | 'admin';

export type ImportRow = {
  username: string;
  name: string;
  plan: ImportPlan;
  maxSessions?: number | null;
  membershipDays?: number | null;
  registrationDate?: Date | null;
};

export type ImportBatchResult = {
  created: string[];
  skipped: { username: string; reason: string }[];
  errors: { username: string; error: string }[];
};

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizePlan(raw: unknown): ImportPlan {
  const s = stripDiacritics(String(raw ?? '').trim().toLowerCase());
  if (!s) return 'free';
  if (['admin', 'yonetici', 'administrator'].includes(s)) return 'admin';
  if (['premium', 'pro', 'plus', 'ucretli', 'gold'].includes(s)) return 'premium';
  if (['free', 'ucretsiz', 'standart', 'temel'].includes(s)) return 'free';
  return 'free';
}

function pickUsernameFromRecord(row: Record<string, unknown>): string {
  for (const [k, v] of Object.entries(row)) {
    const key = stripDiacritics(k.trim().toLowerCase());
    if (
      /^(kullanici\s*adi|kullanıcı\s*adı|username|login|hesap|hesap\s*adi|hesap\s*adı|user\s*name|userid|user\s*id)$/i.test(
        key,
      )
    ) {
      return normalizeLoginUsername(String(v ?? ''));
    }
  }
  return '';
}

function pickNameFromRecord(row: Record<string, unknown>, fallbackName: string): string {
  for (const [k, v] of Object.entries(row)) {
    const key = stripDiacritics(k.trim().toLowerCase());
    if (/^(ad|isim|ad\s*soyad|adsoyad|name|full\s*name|tam\s*ad|unvan)$/i.test(key)) {
      const n = String(v ?? '').trim();
      if (n) return n.slice(0, 200);
    }
  }
  return fallbackName.slice(0, 200);
}

function pickPlanFromRecord(row: Record<string, unknown>): ImportPlan {
  for (const [k, v] of Object.entries(row)) {
    const key = stripDiacritics(k.trim().toLowerCase());
    if (/^(plan|paket|uyelik|üyelik|abonelik|tip|rol)$/i.test(key)) {
      return normalizePlan(v);
    }
  }
  return 'free';
}

/** Excel seri günü veya metin tarih → Date (yerel gün ortası) */
function parseCellToDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = v as number;
    if (n > 2000 && n < 120000) {
      const epoch = Date.UTC(1899, 11, 30);
      return new Date(epoch + Math.floor(n) * 86400000 + 12 * 3600000);
    }
  }
  const s = String(v).trim();
  if (!s) return null;
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return new Date(iso);
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    return new Date(y, month, d, 12, 0, 0, 0);
  }
  return null;
}

function pickIntFromRecord(
  row: Record<string, unknown>,
  headerRegex: RegExp,
  min: number,
  max: number,
): number | null {
  for (const [k, v] of Object.entries(row)) {
    const key = stripDiacritics(k.trim().toLowerCase());
    if (!headerRegex.test(key)) continue;
    const n = typeof v === 'number' ? v : parseInt(String(v ?? '').replace(/\s/g, ''), 10);
    if (!Number.isFinite(n)) return null;
    const x = Math.floor(n);
    if (x < min || x > max) return null;
    return x;
  }
  return null;
}

function pickMembershipDays(row: Record<string, unknown>): number | null {
  for (const [k, v] of Object.entries(row)) {
    const key = stripDiacritics(k.trim().toLowerCase());
    if (
      !/uyelik|üyelik|sure|süre|abonelik\s*gun|abonelik\s*gün|membership|duration|gun\s*sayisi|gün\s*sayisi/i.test(
        key,
      )
    ) {
      continue;
    }
    const n = typeof v === 'number' ? v : parseInt(String(v ?? '').replace(/\s/g, ''), 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.min(3650, Math.floor(n));
  }
  return null;
}

function pickRegistrationDate(row: Record<string, unknown>): Date | null {
  for (const [k, v] of Object.entries(row)) {
    const key = stripDiacritics(k.trim().toLowerCase());
    if (
      !/kayit|kayıt|registration|baslangic|başlangic|baslangıç|uyelik\s*baslangic|üyelik\s*başlangıç|start/i.test(key)
    ) {
      continue;
    }
    if (/bitis|bitiş|kalan|otomatik/i.test(key)) continue;
    const d = parseCellToDate(v);
    if (d) return d;
  }
  return null;
}

function pickMaxSessions(row: Record<string, unknown>): number | null {
  const fromHeader = pickIntFromRecord(
    row,
    /maks|max|cihaz|oturum|session|paralel|es\s*zamanli|eş\s*zamanlı/i,
    1,
    50,
  );
  if (fromHeader != null) return fromHeader;
  return null;
}

export async function parseUserImportBuffer(
  buf: ArrayBuffer,
  fileName: string,
): Promise<ImportRow[]> {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith('.xlsx')) {
    throw new Error('Yalnızca .xlsx (Excel 2007+) dosyası kabul edilir.');
  }

  const XLSX = await import('npm:xlsx@0.18.5');
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('Excel dosyasında sayfa bulunamadı.');
  const ws = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  const rows: ImportRow[] = [];
  for (const rec of json) {
    const username = pickUsernameFromRecord(rec);
    if (!username) continue;
    const displayFallback = username;
    rows.push({
      username,
      name: pickNameFromRecord(rec, displayFallback),
      plan: pickPlanFromRecord(rec),
      maxSessions: pickMaxSessions(rec),
      membershipDays: pickMembershipDays(rec),
      registrationDate: pickRegistrationDate(rec),
    });
  }
  return rows;
}

function computeExpiresAt(
  planVal: ImportPlan,
  roleVal: string,
  membershipDays: number | null | undefined,
  registrationDate: Date | null | undefined,
): string | null {
  if (roleVal === 'admin' || planVal === 'admin') return null;
  let days = membershipDays;
  if ((days == null || days <= 0) && planVal === 'premium') days = 30;
  if (days == null || days <= 0) return null;
  const base = registrationDate ?? new Date();
  const start = new Date(base);
  start.setHours(12, 0, 0, 0);
  const end = new Date(start.getTime() + days * 86400000);
  return end.toISOString();
}

export async function executeUserImport(rows: ImportRow[]): Promise<ImportBatchResult> {
  const created: string[] = [];
  const skipped: { username: string; reason: string }[] = [];
  const errors: { username: string; error: string }[] = [];

  if (rows.length > 800) {
    throw new Error('En fazla 800 satır içe aktarılabilir.');
  }

  const passwordHash = await pwd.hashPassword(STANDARD_IMPORT_PASSWORD);

  for (const r of rows) {
    const username = normalizeLoginUsername(r.username);
    if (!isValidLoginUsername(username)) {
      errors.push({ username: r.username.trim(), error: 'Geçersiz kullanıcı adı (3–32; a-z, 0-9, _)' });
      continue;
    }

    const existing = await db.getUserByUsername(username);
    if (existing) {
      skipped.push({ username, reason: 'Bu kullanıcı adı zaten kayıtlı' });
      continue;
    }

    const planVal = r.plan;
    const roleVal = planVal === 'admin' ? 'admin' : 'user';
    const sqlPlan = planVal === 'admin' ? 'premium' : planVal === 'premium' ? 'premium' : 'free';
    const name = (r.name || username || 'Kullanıcı').trim().slice(0, 200);

    const tempUser = {
      role: roleVal,
      plan: planVal,
      maxSessions: r.maxSessions ?? undefined,
    };
    const maxSessions = effectiveMaxSessions(tempUser);

    const downloadLimit = roleVal === 'admin' ? -1 : planVal === 'premium' ? 50 : 5;

    const expiresAt = computeExpiresAt(planVal, roleVal, r.membershipDays, r.registrationDate);

    try {
      const newId = crypto.randomUUID();
      await db.createUser({
        id: newId,
        username,
        email: null,
        passwordHash,
        name,
        role: roleVal,
        plan: sqlPlan,
      });

      const userData: Record<string, unknown> = {
        id: newId,
        username,
        email: null,
        name,
        role: roleVal,
        plan: planVal,
        maxSessions,
        downloadLimit,
        createdAt: new Date().toISOString(),
        expiresAt,
        dailyDownloads: 0,
        lastDownloadReset: new Date().toISOString(),
        downloadCount: 0,
        activeSessions: 0,
        hardwareId: null,
      };

      userData.loginApproved = true;
      await kv.set(`user:${newId}`, userData);
      try {
        const { setUserLoginApproved } = await import('./login_approval.tsx');
        await setUserLoginApproved(newId, true);
      } catch {
        /* şema yoksa KV yeterli */
      }
      created.push(username);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/unique|duplicate|23505/i.test(msg)) {
        skipped.push({ username, reason: 'Kullanıcı adı çakışması (veritabanı)' });
      } else {
        errors.push({ username, error: msg.slice(0, 200) });
      }
    }
  }

  return { created, skipped, errors };
}
