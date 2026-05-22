import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import * as jwtAuth from './auth_jwt.tsx';
import { assertJwtEnvironmentOrThrow } from './auth_jwt.tsx';
import * as pwd from './password.tsx';
import { getSql, postgresErrorDetail } from './pg_client.ts';
import {
  ensureDesktopAppReleaseSchema,
  ensureFavoritesAndRequestsSchema,
  ensureJwtRotatingSessionsSchema,
  ensureLoginApprovalSchema,
  ensureSearchTrgmIndexes,
  ensureUsersUsernameColumn,
} from './pg_schema_ensure.tsx';
import { runJwtSessionPurge, scheduleJwtSessionPurge } from './maintenance.tsx';
import * as desktopApp from './desktop_app_version.tsx';
import { setupUserFeaturesEndpoints } from './user_features_endpoints.tsx';
import * as kv from './kv_store.tsx';
import * as db from './db_helpers.tsx';
import * as security from './security_middleware.tsx';
import * as gdrive from './google_drive_helper.tsx';
import * as pg from './postgresql_helpers.tsx'; // PostgreSQL helper'ları import et
import { proxyGoogleDriveDownload } from './download_proxy.tsx';
import { downloadWithServiceAccount, getFileMetadataWithServiceAccount } from './google_drive_service_account.tsx';
import { ensureCmsContentTables, ensureCmsPricingPageTable, setupAdminEndpoints } from './admin_endpoints.tsx';
import { setupSettingsEndpoints } from './settings_endpoints.tsx';
import { ensureSiteSettingsSchema, isElectronOnlyLogin } from './site_settings.tsx';
import {
  canOpenWebSession,
  startWebPresence,
  endWebPresence,
  endAllWebPresenceForUser,
} from './web_presence.tsx';
import { getSiteSettings } from './site_settings.tsx';
import { initLoginAuditQueue, logLoginEvent } from './login_audit.tsx';
import { verifyPasswordPooled } from './bcrypt_pool.ts';
import { getCachedUserKv, setCachedUserKv, invalidateCachedUserKv } from './user_cache.ts';
import { cacheBackend } from './cache/index.ts';
import { queueBackend } from './queue/message_queue.ts';
import { getBrandMarkaPaths, resolveMarkaIconWithPaths } from './marka_icon_resolver.ts';
import * as setupGuard from './setup_guard.ts';
import {
  canAccessPremiumContent,
  effectiveMaxSessions,
  maxSessionsFromSources,
  canAddSessionDevice,
  isPremiumPlanActive,
  PREMIUM_UPSELL_ENABLED,
} from './subscription_helpers.tsx';
import {
  canonicalLoginUsernameFromUserRow,
  isValidLoginUsername,
  normalizeLoginUsername,
} from './login_username.ts';
import * as loginApproval from './login_approval.tsx';
import * as deviceSig from './device_signature.tsx';

assertJwtEnvironmentOrThrow();

const runSchemaEnsure = Deno.env.get('ILSA_RUN_SCHEMA_ENSURE') !== '0';
if (runSchemaEnsure) {
  await ensureUsersUsernameColumn();
  await ensureLoginApprovalSchema();
  await ensureFavoritesAndRequestsSchema();
  await ensureJwtRotatingSessionsSchema();
  await ensureSearchTrgmIndexes();
  await ensureCmsContentTables(getSql());
  await ensureSiteSettingsSchema();
  await runJwtSessionPurge();
  scheduleJwtSessionPurge();
} else {
  console.log('[boot] schema ensure atlandi (ILSA_RUN_SCHEMA_ENSURE=0)');
}

initLoginAuditQueue();
console.log(`[boot] cache=${cacheBackend()} queue=${queueBackend()}`);

const app = new Hono();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-Hardware-ID',
    'X-Device-Id',
    'X-New-Token',
    'X-New-Access-Token',
    'X-Device-Signature',
    'X-Device-Timestamp',
    'X-Device-Purpose',
    'X-Setup-Secret',
  ],
  exposeHeaders: ['X-New-Token', 'X-New-Access-Token', 'Content-Disposition', 'Content-Length', 'X-Download-Token', 'X-Download-Prepare-Mode'],
}));
app.use('*', async (c, next) => {
  await next();
  const ct = c.res.headers.get('Content-Type');
  if (ct?.includes('application/json') && !ct.includes('charset')) {
    c.res.headers.set('Content-Type', 'application/json; charset=utf-8');
  }
});
app.use('*', logger(console.log));

type AuthHeaderWriter = { header: (name: string, value: string) => void };

type ReqCtx = {
  req: {
    header: (name: string) => string | undefined;
    method: string;
    path: string;
  };
};

async function getUserFromSecureTokenRequest(
  c: ReqCtx,
  accessToken: string,
  hardwareId?: string,
) {
  return security.getUserFromSecureToken(accessToken, {
    hardwareId,
    signatureHeaders: security.readDeviceSignatureHeaders(c),
    method: c.req.method,
    path: c.req.path,
  });
}

/** Web JWT, secure token (imza) veya Electron HW — indirme / korumalı uçlar */
async function resolveRequestActor(
  c: ReqCtx,
  opts?: { consumeSecureToken?: boolean },
): Promise<{
  userId: string;
  userData: Record<string, unknown>;
  newSecureToken?: string;
  newAccessToken?: string;
} | null> {
  const accessToken = c.req.header('Authorization')?.split(' ')[1];
  if (!accessToken) return null;

  const hardwareId = (c.req.header('X-Hardware-ID') || '').trim();
  const consumeSecure = opts?.consumeSecureToken !== false;

  if (jwtAuth.looksLikeJwt(accessToken)) {
    const active = await jwtAuth.verifyAccessTokenActive(accessToken);
    if (active) {
      const uid = active.sub;
      const fromKv = await kv.get(`user:${uid}`);
      const userData =
        fromKv && typeof fromKv === 'object'
          ? (fromKv as Record<string, unknown>)
          : ({ id: uid, username: active.username } as Record<string, unknown>);
      return { userId: uid, userData };
    }
    const rotated = await jwtAuth.verifyAndRotateAccessToken(accessToken, requestMeta(c));
    if (rotated.ok) {
      const uid = rotated.sub;
      const fromKv = await kv.get(`user:${uid}`);
      const userData =
        fromKv && typeof fromKv === 'object'
          ? (fromKv as Record<string, unknown>)
          : ({ id: uid, username: rotated.username } as Record<string, unknown>);
      return { userId: uid, userData, newAccessToken: rotated.newToken };
    }
  }

  if (hardwareId) {
    const sec = consumeSecure
      ? await security.validateSecureRequest(c)
      : await security.validateSecureSessionActive(c);
    if (sec.valid && sec.user) {
      const u = sec.user as { id?: string };
      const uid = u?.id ? String(u.id) : '';
      if (uid) {
        let userData: Record<string, unknown> = sec.user as Record<string, unknown>;
        const fromKv = await kv.get(`user:${uid}`);
        if (fromKv && typeof fromKv === 'object') userData = fromKv as Record<string, unknown>;
        return {
          userId: uid,
          userData,
          newSecureToken: 'newToken' in sec ? sec.newToken : undefined,
        };
      }
    }
  }

  return null;
}

function requestMeta(c: { req: { header: (n: string) => string | undefined } }) {
  return {
    ipAddress: c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || undefined,
    userAgent: c.req.header('user-agent') || undefined,
  };
}

/** İstemciye dönen kullanıcı özeti (expiresAt dahil) */
function publicSessionUser(userData: Record<string, unknown> | null | undefined) {
  const u = userData && typeof userData === 'object' ? userData : {};
  return {
    id: u.id,
    username: u.username,
    email: u.email ?? null,
    name: u.name,
    role: u.role,
    plan: u.plan,
    expiresAt: u.expiresAt ?? null,
    maxSessions: effectiveMaxSessions(u),
    dailyDownloads: u.dailyDownloads ?? u.downloadsToday ?? 0,
    createdAt: u.createdAt ?? null,
  };
}

/** JWT doğrulama — varsayılan: tüketmez (yüksek eşzamanlılık). İndirme için JWT_ROTATE=1 */
async function authUser(accessToken: string | undefined, responseHeaders?: AuthHeaderWriter) {
  if (!accessToken || !jwtAuth.looksLikeJwt(accessToken)) {
    return { ok: false as const };
  }
  const rotateEveryRequest = (Deno.env.get('JWT_ROTATE_EVERY_REQUEST') || '').trim() === '1';
  if (rotateEveryRequest) {
    const rotated = await jwtAuth.verifyAndRotateAccessToken(accessToken);
    if (!rotated.ok) return { ok: false as const };
    if (responseHeaders) {
      responseHeaders.header('X-New-Access-Token', rotated.newToken);
    }
    return {
      ok: true as const,
      user: { id: rotated.sub, username: rotated.username },
      newAccessToken: rotated.newToken,
    };
  }
  const active = await jwtAuth.verifyAccessTokenActive(accessToken);
  if (!active) return { ok: false as const };
  return {
    ok: true as const,
    user: { id: active.sub, username: active.username },
    newAccessToken: undefined,
  };
}

/**
 * Kayıt / web girişi için cihaz kimliği.
 * Eski hata: `Authorization: Bearer <jwt>` iken `split(' ')[1]` JWT parçasını cihaz id sanıyordu;
 * KV'deki `web_*` ile uyuşmayıp sürekli cihaz kilidi veya giriş başarısızlığı oluşuyordu.
 * Bearer ise yok sayılır; `X-Device-Id` veya IP+UserAgent ile `web_*` üretilir.
 */
function resolveClientDeviceIdForSession(c: { req: { header: (name: string) => string | undefined } }): string {
  const authHeader = (c.req.header('Authorization') || '').trim();
  if (authHeader && !/^Bearer\s/i.test(authHeader)) {
    return authHeader;
  }
  const x = (c.req.header('X-Device-Id') || '').trim();
  if (x) return x;
  const ipAddress = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';
  const userAgent = c.req.header('user-agent') || 'unknown';
  const webFingerprint = `${ipAddress}_${userAgent}`;
  return `web_${webFingerprint.substring(0, 32).replace(/[^a-zA-Z0-9]/g, '_')}`;
}

/** Web JWT veya Electron secure (validateSecureRequest) ile indirme geçmişi sahibini çöz; secure ise token döner */
async function resolveDownloadHistoryActor(c: { req: { header: (n: string) => string | undefined } }) {
  const accessToken = c.req.header('Authorization')?.split(' ')[1];
  if (!accessToken) return null;
  if (jwtAuth.looksLikeJwt(accessToken)) {
    const active = await jwtAuth.verifyAccessTokenActive(accessToken);
    if (active) return { userId: active.sub };
  }
  const sec = await security.validateSecureRequest(c);
  if (!sec.valid || !sec.user?.id) return null;
  return { userId: String(sec.user.id), newToken: sec.newToken };
}

function normalizeDownloadHistoryDate(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  return s || undefined;
}

/** KV / kullanıcı listesi ile uyum için alanları düzenler; dismiss sonrası hidden alanları */
function sanitizeDownloadHistoryForKvHide(
  cur: Record<string, unknown>,
  hiddenFromUser: boolean,
  hiddenAtIso: string,
): Record<string, unknown> {
  const downloadedAt =
    normalizeDownloadHistoryDate(cur.downloadedAt) ??
    normalizeDownloadHistoryDate((cur as { downloaded_at?: unknown }).downloaded_at);
  const userId = cur.userId ?? (cur as { user_id?: unknown }).user_id;
  return {
    ...cur,
    ...(downloadedAt ? { downloadedAt } : {}),
    ...(userId != null && userId !== '' ? { userId } : {}),
    hiddenFromUser,
    hiddenAt: hiddenAtIso,
  };
}

function isPgSchemaMismatchForHistory(d: { code?: string; message: string }): boolean {
  const msg = d.message || '';
  if (d.code === '42703') return true; // undefined_column
  if (d.code === '42P01' && /user_download_history/i.test(msg)) return true; // undefined_table
  if (/column .*hidden_from_user/i.test(msg) && /does not exist/i.test(msg)) return true;
  if (/column .*hidden_at/i.test(msg) && /does not exist/i.test(msg)) return true;
  return false;
}

/** GET/list: JWT veya secure oturumu tüketmeden kullanıcı çözümü */
async function resolveViewerFromRequest(c: ReqCtx): Promise<{
  userId: string;
  userData: Record<string, unknown>;
  newSecureToken?: string;
} | null> {
  const accessToken = c.req.header('Authorization')?.split(' ')[1];
  if (!accessToken) return null;

  const hardwareId = (c.req.header('X-Hardware-ID') || '').trim();

  if (jwtAuth.looksLikeJwt(accessToken)) {
    const active = await jwtAuth.verifyAccessTokenActive(accessToken);
    if (!active) return null;
    const uid = active.sub;
    let userData = await getCachedUserKv(uid);
    if (!userData) {
      const fromKv = await kv.get(`user:${uid}`);
      userData =
        fromKv && typeof fromKv === 'object'
          ? (fromKv as Record<string, unknown>)
          : ({ id: uid, username: active.username } as Record<string, unknown>);
      await setCachedUserKv(uid, userData);
    }
    return { userId: uid, userData };
  }

  if (hardwareId) {
    const sec = await security.validateSecureSessionActive(c);
    if (sec.valid && sec.user) {
      const u = sec.user as { id?: string };
      const uid = u?.id ? String(u.id) : '';
      if (!uid) return null;
      let userData: Record<string, unknown> = sec.user as Record<string, unknown>;
      const cached = await getCachedUserKv(uid);
      if (cached) userData = cached;
      else {
        const fromKv = await kv.get(`user:${uid}`);
        if (fromKv && typeof fromKv === 'object') userData = fromKv as Record<string, unknown>;
        await setCachedUserKv(uid, userData);
      }
      return { userId: uid, userData };
    }
    return null;
  }

  return null;
}

/** Web veya Electron isteğinden KV kullanıcı kaydı (role/plan) */
async function getRequestUserKvData(c: { req: { header: (n: string) => string | undefined } }): Promise<any | null> {
  const viewer = await resolveViewerFromRequest(c as ReqCtx);
  return viewer?.userData ?? null;
}

function stripPublicDownloadStats(files: any[]): any[] {
  return files.map((file) => {
    if (!file || typeof file !== 'object') return file;
    const { downloadCount: _dc, downloads: _dl, views: _v, ...rest } = file;
    return rest;
  });
}

/** Boş/null ve büyük/küçük harf için güvenli Google Drive depolama URL kontrolü */
function isGoogleDriveStorageUrl(url: unknown): boolean {
  const s = String(url ?? '').toLowerCase();
  return s.includes('drive.google.com') || s.includes('drive.usercontent.google.com');
}

// JSON Cache
let jsonCache: { [key: string]: { data: any; timestamp: number } } = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 dakika

function projectRootDir(): string {
  const root = (Deno.env.get('ILSA_ROOT') || Deno.cwd()).trim();
  return root.replace(/\\/g, '/').replace(/\/$/, '');
}

/**
 * JSON dosyalarını okur (Supabase Storage'dan veya local'den)
 */
async function readJSONFile(fileName: string): Promise<any> {
  try {
    // Cache kontrolü
    if (jsonCache[fileName] && (Date.now() - jsonCache[fileName].timestamp) < CACHE_DURATION) {
      console.log(`📦 Cache'den okundu: ${fileName}`);
      return jsonCache[fileName].data;
    }

    let content: string;
    const root = projectRootDir();
    const base = (Deno.env.get('JSON_STORAGE_DIR') ?? `${root}/storage/json-files`).replace(/\\/g, '/').replace(/\/$/, '');
    const candidates = [
      `${root}/${fileName}`,
      `${base}/${fileName}`,
      `./${fileName}`,
      `${base.replace(/\/$/, '')}/${fileName}`,
    ];
    let readOk = false;
    for (const storagePath of candidates) {
      try {
        content = await Deno.readTextFile(storagePath);
        console.log(`✅ JSON okundu: ${storagePath}`);
        readOk = true;
        break;
      } catch {
        /* sonraki yol */
      }
    }
    if (!readOk) {
      const storagePath = `${base}/${fileName}`;
      console.error(`❌ JSON okuma hatası (${fileName}): dosya yok (${storagePath})`);
      return [];
    }
    
    // JSON parse
    const jsonData = JSON.parse(content);
    
    // SQLiteStudio export formatını kontrol et
    if (Array.isArray(jsonData) && jsonData.length > 0) {
      // Header'ı kontrol et
      const header = jsonData[0];
      if (header.type === 'header') {
        // İkinci eleman tablo verisi olmalı
        const table = jsonData[1];
        if (table && table.type === 'table' && Array.isArray(table.data)) {
          // Cache'e kaydet
          jsonCache[fileName] = {
            data: table.data,
            timestamp: Date.now()
          };
          console.log(`✅ ${fileName} parse edildi: ${table.data.length} kayıt`);
          return table.data;
        }
      }
    }
    
    // Normal JSON array
    if (Array.isArray(jsonData)) {
      jsonCache[fileName] = {
        data: jsonData,
        timestamp: Date.now()
      };
      console.log(`✅ ${fileName} parse edildi: ${jsonData.length} kayıt`);
      return jsonData;
    }
    
    console.warn(`⚠️ ${fileName} beklenmeyen formatta`);
    return [];
    
  } catch (error) {
    console.error(`❌ readJSONFile hatası (${fileName}):`, error);
    return [];
  }
}

/**
 * Markaları JSON'dan çeker (altkat=0 olanlar)
 */
async function getBrandsFromJSON(): Promise<any[]> {
  const kategoriler = await readJSONFile('kategoriler.json');
  const brands = kategoriler.filter((k: any) => 
    k.altkat === '0' || k.altkat === 0
  );
  
  return brands.map((b: any) => ({
    id: b.id,
    name: b.adi || b.name,
    slug: b.slug || b.adi?.toLowerCase().replace(/\s+/g, '-'),
    icon: b.resim || b.icon,
    description: b.aciklama || '',
  }));
}

/**
 * Markanın altındaki ilk klasör seviyesi (eski PHP Home::Soft ile aynı mantık):
 * DB::orderByAdiAsc()->whereAltkatAnd($id)->whereAlkat2('0')->kategorilerResult()
 * → altkat = marka satırının id'si, alkat2 = '0' / boş (sabit "1" değil).
 */
function jsonAlkat2IsZeroOrEmpty(k: any): boolean {
  const a2 = k.alkat2;
  return (
    a2 === '0' ||
    a2 === 0 ||
    a2 == null ||
    String(a2).trim() === ''
  );
}

async function getCategoriesFromJSON(brandId?: string): Promise<any[]> {
  const kategoriler = await readJSONFile('kategoriler.json');

  console.log(`📂 getCategoriesFromJSON called with brandId: ${brandId}`);
  console.log(`📊 Total kategoriler: ${kategoriler.length}`);

  if (!brandId) {
    console.warn('⚠️ brandId yok — PHP Soft eşleniği için marka id gerekir, boş dönülüyor');
    return [];
  }

  const categories = kategoriler.filter(
    (k: any) => String(k.altkat) === String(brandId) && jsonAlkat2IsZeroOrEmpty(k),
  );

  console.log(`📂 Marka ${brandId} altı (altkat=id, alkat2≈0): ${categories.length}`);

  return categories.map((c: any) => ({
    id: c.id,
    name: c.adi || c.name,
    slug: c.slug || c.adi?.toLowerCase().replace(/\s+/g, '-'),
    icon: c.resim || c.icon,
    description: c.aciklama || '',
    parentId: brandId,
  }));
}

/**
 * Daha derin klasörler (eski PHP Home::alt ile aynı mantık):
 * DB::orderByAdiAsc()->whereAlkat2And($id)->kategorilerResult()
 * → kategoriler.alkat2 = tıklanan üst klasörün id'si.
 */
async function getSubcategoriesFromJSON(categoryId?: string): Promise<any[]> {
  const kategoriler = await readJSONFile('kategoriler.json');

  if (!categoryId) {
    console.warn('⚠️ categoryId yok — PHP alt eşleniği için üst klasör id gerekir');
    return [];
  }

  const subcategories = kategoriler.filter((k: any) => String(k.alkat2) === String(categoryId));

  return subcategories.map((s: any) => ({
    id: s.id,
    name: s.adi || s.name,
    slug: s.slug || s.adi?.toLowerCase().replace(/\s+/g, '-'),
    icon: s.resim || s.icon,
    description: s.aciklama || '',
    parentId: categoryId,
  }));
}

/**
 * Dosyaları JSON'dan çeker
 */
async function getFilesFromJSON(filters?: { 
  brandId?: string; 
  categoryId?: string; 
  subcategoryId?: string;
  search?: string;
  plan?: string;
}): Promise<any[]> {
  const bilgi = await readJSONFile('bilgi.json');
  
  let files = [...bilgi];
  
  // Marka filtresi
  if (filters?.brandId) {
    files = files.filter((f: any) => f.katid === filters.brandId);
  }
  
  // Kategori veya alt kategori filtresi
  if (filters?.categoryId || filters?.subcategoryId) {
    const targetId = filters.subcategoryId || filters.categoryId;
    files = files.filter((f: any) => f.altkat === targetId);
  }
  
  // Arama filtresi
  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    files = files.filter((f: any) => 
      f.adi?.toLowerCase().includes(searchLower)
    );
  }
  
  // Plan bazlı filtreleme
  if (filters?.plan) {
    if (filters.plan === 'free') {
      // Free kullanıcılar sadece asama boş olanları görebilir
      files = files.filter((f: any) => !f.asama || f.asama === '');
    }
    // Premium ve admin tüm dosyaları görebilir
  }
  
  return files.map((f: any) => ({
    id: f.id,
    name: f.adi || f.name,
    brandId: f.katid,
    categoryId: f.altkat,
    link: f.link,
    size: f.boyut,
    downloads: parseInt(f.down || '0'),
    views: parseInt(f.hit || '0'),
    date: f.tarih,
    isPremium: f.asama && f.asama !== '',
    color: f.renkodu,
    notification: f.bildiri,
  }));
}

// ===== İLK KURULUM =====
app.post('/make-server-47081311/setup-admin', async (c) => {
  try {
    const body = await c.req.json();
    const usernameRaw = body.username ?? body.email;
    const { password, name, force } = body;

    if (!usernameRaw || !password || !name) {
      return c.json({ error: 'Kullanıcı adı, şifre ve ad gereklidir' }, 400);
    }

    const username = normalizeLoginUsername(String(usernameRaw));
    if (!isValidLoginUsername(username)) {
      return c.json({
        error:
          'Geçersiz kullanıcı adı. 3–32 karakter; yalnızca küçük harf, rakam ve alt çizgi (_) kullanın.',
      }, 400);
    }

    const denyForce = setupGuard.assertForceAdminAllowed(c, !!force);
    if (denyForce) return denyForce;

    const denySetup = setupGuard.assertSetupSecretIfConfigured(c);
    if (denySetup) return denySetup;

    const allUsers = await kv.getByPrefix('user:');
    const existingAdmin = allUsers.map((u: any) => u.value ?? u).find((v: any) => v.role === 'admin' || v.plan === 'admin');
    
    // Eğer admin zaten varsa ve force=false ise, direkt signin yap
    if (existingAdmin && !force) {
      console.log('✅ Admin zaten mevcut, signin yapılıyor:', username);

      const row = await db.getUserByUsername(username);
      if (!row || !(await verifyPasswordPooled(password, row.password_hash as string))) {
        return c.json({
          error: 'A user with this email address has already been registered',
          details: 'Geçersiz kullanıcı adı veya şifre',
        }, 400);
      }

      const un = normalizeLoginUsername(String(row.username ?? username));
      const accessToken = await jwtAuth.signAccessToken(row.id, un);

      const sessionId = crypto.randomUUID();
      const sessionKey = `session:${row.id}:${sessionId}`;

      await kv.set(sessionKey, {
        key: sessionKey,
        userId: row.id,
        sessionId,
        accessToken,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        userAgent: 'Demo Login',
        ip: 'demo',
      });

      console.log(`✅ Session created: ${sessionKey}`);

      return c.json({
        success: true,
        message: 'Admin zaten mevcut, giriş yapıldı',
        accessToken,
        user: {
          id: row.id,
          username: existingAdmin.username ?? un,
          email: existingAdmin.email ?? row.email ?? null,
          name: existingAdmin.name,
          role: existingAdmin.role,
          plan: existingAdmin.plan,
        },
      });
    }

    // Eğer force=true ise, mevcut admin'i sil
    if (existingAdmin && force) {
      console.log('Mevcut admin siliniyor:', existingAdmin.id);

      try {
        await db.deleteUser(existingAdmin.id);
      } catch {
        /* yoksa yoksay */
      }

      await kv.del(`user:${existingAdmin.id}`);
      
      // Session'larını sil
      const sessions = await kv.getByPrefix(`session:${existingAdmin.id}:`);
      for (const session of sessions) {
        await kv.del(session.key);
      }
      
      console.log('Mevcut admin silindi, yeni admin oluşturuluyor...');
    }

    const newId = crypto.randomUUID();
    const hash = await pwd.hashPassword(password);
    await db.createUser({
      id: newId,
      username,
      email: null,
      passwordHash: hash,
      name,
      role: 'admin',
      plan: 'premium',
    });

    await kv.set(`user:${newId}`, {
      id: newId,
      username,
      email: null,
      name,
      role: 'admin',
      plan: 'premium',
      maxSessions: 10,
      downloadLimit: -1,
      createdAt: new Date().toISOString(),
    });

    console.log('✅ Admin başarıyla oluşturuldu:', username);

    return c.json({
      success: true,
      message: 'Admin başarıyla oluşturuldu',
      user: { id: newId, username, email: null, name },
    });
  } catch (error) {
    console.log('Admin setup hatası:', error);
    const details = error instanceof Error ? error.message : String(error);
    return c.json({ error: 'Admin setup başarısız', details }, 500);
  }
});

/** Ana sayfa markaları: kategoriler kök satırları (idempotent) */
app.post('/make-server-47081311/setup-all-brands', async (c) => {
  try {
    const deny = setupGuard.assertSetupSecretIfConfigured(c);
    if (deny) return deny;

    const sql = getSql();
    const names = [
      'Samsung',
      'Xiaomi',
      'Huawei',
      'Oppo',
      'Vivo',
      'iPhone',
      'Realme',
      'OnePlus',
    ];
    let created = 0;
    let existing = 0;
    const results: { name: string; status: string; id?: number }[] = [];
    let sira = 1;
    for (const name of names) {
      const found = await sql`
        SELECT id FROM kategoriler
        WHERE ust_kategori_id IS NULL AND kategori_adi = ${name} AND durum = 'active'
        LIMIT 1
      `;
      if (found.length) {
        existing++;
        results.push({ name, status: 'exists', id: Number(found[0].id) });
        sira++;
        continue;
      }
      const ins = await sql`
        INSERT INTO kategoriler (kategori_adi, ust_kategori_id, aciklama, sira, durum)
        VALUES (${name}, NULL, ${''}, ${sira}, 'active')
        RETURNING id
      `;
      created++;
      results.push({ name, status: 'created', id: Number(ins[0].id) });
      sira++;
    }
    const cnt = await sql`
      SELECT count(*)::int AS c FROM kategoriler
      WHERE ust_kategori_id IS NULL
        AND durum = 'active'
        AND kategori_adi NOT LIKE '(ORT)%'
    `;
    pg.clearPgHelpersCache();
    return c.json({
      success: true,
      message: 'Marka (kök kategori) kayıtları tamam',
      stats: {
        created,
        existing,
        total: cnt[0]?.c ?? 0,
      },
      results,
    });
  } catch (error: any) {
    console.error('setup-all-brands:', error);
    return c.json({ error: error?.message || 'Marka kurulumu başarısız' }, 500);
  }
});

/** Giriş ekranı demo kullanıcıları (PostgreSQL + KV) */
app.post('/make-server-47081311/setup-all-demo-users', async (c) => {
  try {
    const deny = setupGuard.assertSetupSecretIfConfigured(c);
    if (deny) return deny;

    const demos = [
      { username: 'admin', password: 'Admin123456!', name: 'Admin User', role: 'admin' as const, plan: 'premium' as const },
      { username: 'premium', password: 'Premium123456!', name: 'Premium User', role: 'user' as const, plan: 'premium' as const },
      { username: 'free', password: 'Free123456!', name: 'Free User', role: 'user' as const, plan: 'free' as const },
    ];
    const results: { username: string; status: string; id?: string; error?: string }[] = [];
    for (const d of demos) {
      try {
        const row = await db.getUserByUsername(d.username);
        if (row) {
          results.push({ username: d.username, status: 'exists', id: String(row.id) });
          continue;
        }
        const id = crypto.randomUUID();
        const hash = await pwd.hashPassword(d.password);
        await db.createUser({
          id,
          username: d.username,
          email: null,
          passwordHash: hash,
          name: d.name,
          role: d.role,
          plan: d.plan,
        });
        await kv.set(`user:${id}`, {
          id,
          username: d.username,
          email: null,
          name: d.name,
          role: d.role,
          plan: d.plan,
          maxSessions: d.role === 'admin' ? 10 : 3,
          downloadLimit: d.role === 'admin' ? -1 : d.plan === 'premium' ? 50 : 5,
          createdAt: new Date().toISOString(),
        });
        results.push({ username: d.username, status: 'created', id });
      } catch (e: any) {
        results.push({ username: d.username, status: 'error', error: String(e?.message || e) });
      }
    }
    return c.json({
      success: true,
      message: 'Demo kullanıcılar hazır (yoksa oluşturuldu)',
      results,
    });
  } catch (error: any) {
    console.error('setup-all-demo-users:', error);
    return c.json({ error: error?.message || 'Demo kullanıcı kurulumu başarısız' }, 500);
  }
});

// ===== DEMO DATA SETUP =====
app.post('/make-server-47081311/setup-demo-data', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Token gerekli' }, 401);
    }

    const __auth = await authUser(accessToken, c);
    const user = __auth.ok ? __auth.user : null;
    const error = __auth.ok ? null : new Error('auth');
    
    if (error || !user) {
      return c.json({ error: 'Geçersiz token' }, 401);
    }

    const userData = await kv.get(`user:${user.id}`);
    if (userData.role !== 'admin') {
      return c.json({ error: 'Sadece admin demo data kurabilir' }, 403);
    }

    console.log('🚀 Demo data kurulumu başlıyor...');

    // Demo subcategories
    const demoSubcategories = [
      { categoryName: 'Samsung', subcategories: [
        { name: 'Repair', icon: '🔧' },
        { name: 'FRP Tools', icon: '🔓' },
        { name: 'Flash Files', icon: '⚡' },
        { name: 'Combination', icon: '🔄' },
        { name: 'Yazılım', icon: '💾' },
      ]},
      { categoryName: 'Xiaomi', subcategories: [
        { name: 'MIUI ROM', icon: '📱' },
        { name: 'Fastboot ROM', icon: '⚡' },
        { name: 'Mi Unlock', icon: '🔓' },
        { name: 'EDL Tools', icon: '🔧' },
      ]},
      { categoryName: 'Huawei', subcategories: [
        { name: 'Firmware', icon: '💾' },
        { name: 'FRP Remove', icon: '🔓' },
        { name: 'Flash Tool', icon: '⚡' },
      ]},
      { categoryName: 'Oppo', subcategories: [
        { name: 'ColorOS ROM', icon: '🎨' },
        { name: 'Flash Tool', icon: '⚡' },
        { name: 'MSM Tool', icon: '🔧' },
      ]},
      { categoryName: 'Vivo', subcategories: [
        { name: 'Stock ROM', icon: '📱' },
        { name: 'Qualcomm Tool', icon: '🔧' },
        { name: 'FRP Bypass', icon: '🔓' },
      ]},
      { categoryName: 'iPhone', subcategories: [
        { name: 'IPSW Files', icon: '🍎' },
        { name: 'iTunes', icon: '🎵' },
        { name: '3uTools', icon: '🔧' },
      ]},
    ];

    const subcategoryMap: any = {};
    let subcategoryCount = 0;

    // Subcategory'leri oluştur
    for (const brandData of demoSubcategories) {
      const categories = (await kv.getByPrefix('category:')).map((x: any) => x.value ?? x);
      const category = categories.find((c: any) => c.name === brandData.categoryName);
      
      if (!category) {
        console.log(`⚠️ ${brandData.categoryName} kategorisi bulunamadı, atlanıyor...`);
        continue;
      }

      for (const sub of brandData.subcategories) {
        const subcategoryId = crypto.randomUUID();
        await kv.set(`subcategory:${subcategoryId}`, {
          id: subcategoryId,
          name: sub.name,
          categoryId: category.id,
          icon: sub.icon,
          fileCount: 0,
          createdAt: new Date().toISOString(),
        });

        subcategoryMap[`${brandData.categoryName}:${sub.name}`] = subcategoryId;
        subcategoryCount++;
        console.log(`✅ ${brandData.categoryName} > ${sub.name} oluşturuldu`);
      }
    }

    // Demo files
    const demoFiles = [
      {
        category: 'Samsung',
        subcategory: 'Repair',
        files: [
          {
            name: 'Samsung Galaxy S23 Ultra SM-S918B Repair Firmware',
            description: 'Latest official repair firmware for Galaxy S23 Ultra. Includes full system repair files.',
            version: '14.0',
            size: 8589934592,
            fileType: 'firmware',
            isPremium: true,
          },
          {
            name: 'Samsung Galaxy A54 5G SM-A546B Flash File',
            description: 'Stock ROM for Samsung Galaxy A54 5G. All regions supported.',
            version: '13.0',
            size: 6442450944,
            fileType: 'firmware',
            isPremium: false,
          },
        ]
      },
      {
        category: 'Samsung',
        subcategory: 'FRP Tools',
        files: [
          {
            name: 'Samsung FRP Tool 2024 Latest',
            description: 'One-click FRP bypass tool for all Samsung devices. Android 13/14 supported.',
            version: '5.2',
            size: 52428800,
            fileType: 'tool',
            isPremium: true,
          },
        ]
      },
      {
        category: 'Xiaomi',
        subcategory: 'MIUI ROM',
        files: [
          {
            name: 'Xiaomi 13 Pro MIUI 14 Recovery ROM',
            description: 'Official MIUI 14 recovery ROM for Xiaomi 13 Pro. Global version.',
            version: '14.0.6.0',
            size: 5368709120,
            fileType: 'firmware',
            isPremium: true,
          },
          {
            name: 'Redmi Note 12 Pro MIUI 14',
            description: 'Latest MIUI 14 for Redmi Note 12 Pro. All variants.',
            version: '14.0.4.0',
            size: 4294967296,
            fileType: 'firmware',
            isPremium: false,
          },
        ]
      },
      {
        category: 'Oppo',
        subcategory: 'ColorOS ROM',
        files: [
          {
            name: 'Oppo Reno 10 Pro ColorOS 14',
            description: 'Latest ColorOS 14 official firmware for Oppo Reno 10 Pro.',
            version: '14.0',
            size: 6442450944,
            fileType: 'firmware',
            isPremium: true,
          },
        ]
      },
      {
        category: 'iPhone',
        subcategory: 'IPSW Files',
        files: [
          {
            name: 'iPhone 15 Pro Max iOS 17.2 IPSW',
            description: 'Official iOS 17.2 IPSW file for iPhone 15 Pro Max.',
            version: '17.2',
            size: 7516192768,
            fileType: 'firmware',
            isPremium: true,
          },
        ]
      },
    ];

    const demoUrls = [
      'https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j/view',
      'https://drive.google.com/file/d/2b3c4d5e6f7g8h9i0j1k/view',
      'https://drive.google.com/file/d/3c4d5e6f7g8h9i0j1k2l/view',
    ];

    let fileCount = 0;
    let urlIndex = 0;

    // Files oluştur
    for (const fileGroup of demoFiles) {
      const subcategoryKey = `${fileGroup.category}:${fileGroup.subcategory}`;
      const subcategoryId = subcategoryMap[subcategoryKey];

      if (!subcategoryId) {
        console.log(`⚠️ ${subcategoryKey} subcategory bulunamadı, atlanıyor...`);
        continue;
      }

      const categories = (await kv.getByPrefix('category:')).map((x: any) => x.value ?? x);
      const category = categories.find((c: any) => c.name === fileGroup.category);

      for (const file of fileGroup.files) {
        const fileId = crypto.randomUUID();
        await kv.set(`file:${fileId}`, {
          id: fileId,
          name: file.name,
          description: file.description,
          categoryId: category.id,
          subcategoryId: subcategoryId,
          fileType: file.fileType,
          version: file.version,
          size: file.size,
          downloadUrl: demoUrls[urlIndex % demoUrls.length],
          isPremium: file.isPremium,
          downloadCount: Math.floor(Math.random() * 1000),
          createdBy: user.id,
          createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        });

        // Subcategory file count güncelle
        const subcategory = await kv.get(`subcategory:${subcategoryId}`);
        if (subcategory) {
          await kv.set(`subcategory:${subcategoryId}`, {
            ...subcategory,
            fileCount: (subcategory.fileCount || 0) + 1,
          });
        }

        fileCount++;
        urlIndex++;
        console.log(`✅ ${file.name} oluşturuldu`);
      }
    }

    console.log(`🎉 Demo data kurulumu tamamlandı!`);
    console.log(`📊 ${subcategoryCount} subcategory, ${fileCount} file oluşturuldu`);

    return c.json({
      success: true,
      message: `${subcategoryCount} alt kategori ve ${fileCount} dosya oluşturuldu`,
      stats: {
        subcategories: subcategoryCount,
        files: fileCount,
      },
    });

  } catch (error) {
    console.log('Demo data setup hatası:', error);
    return c.json({ error: 'Demo data setup başarısız' }, 500);
  }
});

// ===== KAYIT OLMA =====
app.post('/make-server-47081311/signup', async (c) => {
  try {
    const body = await c.req.json();
    const rawLogin = String(body.username ?? body.email ?? '').trim();
    const { password, name, captchaToken } = body;
    const nameTrimmed = typeof name === 'string' ? name.trim() : '';
    const pwdStr = typeof password === 'string' ? password : '';
    const headerHw = (c.req.header('X-Hardware-ID') || '').trim();
    const bodyHw = typeof body.hardwareId === 'string' ? body.hardwareId.trim() : '';
    const electronHw = bodyHw || headerHw;
    const deviceId = electronHw || resolveClientDeviceIdForSession(c);
    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';

    if (!rawLogin || !pwdStr || !nameTrimmed) {
      return c.json(
        { error: 'Kullanıcı adı (veya e-posta), şifre ve tam adınız gerekli.' },
        400,
      );
    }

    let username = normalizeLoginUsername(rawLogin);
    let userEmail: string | null = null;
    if (rawLogin.includes('@')) {
      userEmail = rawLogin.toLowerCase();
      const local = normalizeLoginUsername(rawLogin.split('@')[0] ?? '');
      if (!isValidLoginUsername(local)) {
        return c.json(
          {
            error:
              'E-postanızın @ öncesi kısmı geçerli bir kullanıcı adı değil (3–32 karakter; yalnızca a-z, 0-9, _). Lütfen farklı bir e-posta kullanın veya kayıtta ayrıca kullanıcı adı girin.',
          },
          400,
        );
      }
      username = local;
    } else if (!isValidLoginUsername(username)) {
      return c.json({
        error:
          'Kullanıcı adı 3–32 karakter olmalı; yalnızca küçük harf, rakam ve alt çizgi (_) kullanılabilir.',
      }, 400);
    }

    if (userEmail) {
      const dupEm = await db.getUserByEmail(userEmail);
      if (dupEm) {
        return c.json({ error: 'Bu e-posta ile zaten bir hesap var' }, 400);
      }
    }

    // 🔒 CAPTCHA Doğrulama (Web kayıtları için)
    if (!deviceId && captchaToken) {
      console.log('🔐 CAPTCHA doğrulaması yapılıyor...');
      
      const captchaVerification = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            secret: '1x0000000000000000000000000000000AA', // Demo secret, production'da değiştir!
            response: captchaToken,
          }),
        }
      );

      const captchaResult = await captchaVerification.json();
      
      if (!captchaResult.success) {
        console.error('❌ CAPTCHA doğrulama başarısız:', captchaResult);
        return c.json({ 
          error: 'CAPTCHA doğrulaması başarısız. Lütfen tekrar deneyin.',
          errorCode: 'CAPTCHA_FAILED',
        }, 400);
      }
      
      console.log('✅ CAPTCHA doğrulandı');
    }

    // Rate limiting (signup için)
    const rateLimit = await setupGuard.rateLimitPublic('signup', ipAddress, 5, 60 * 1000); // 5 signup/minute
    if (!rateLimit.allowed) {
      return c.json({ 
        error: 'Çok fazla kayıt denemesi yaptınız. Lütfen bekleyiniz.',
        resetAt: new Date(rateLimit.resetAt).toISOString(),
      }, 429);
    }

    if (electronHw) {
      const ver = await desktopApp.assertDesktopClientVersion(
        desktopApp.clientVersionFromDeviceInfo(body.deviceInfo),
      );
      if (!ver.ok) return desktopVersionReject(c, ver);
    }

    const existingUsers = await kv.getByPrefix('user:');
    const userExistsKv = existingUsers.map((u: any) => u.value ?? u).some((u: any) => {
      const uu = normalizeLoginUsername(String(u.username ?? u.email ?? ''));
      return uu === username;
    });
    const dupDb = await db.getUserByUsername(username);
    if (userExistsKv || dupDb) {
      return c.json({ error: 'Bu kullanıcı adı zaten kullanılıyor' }, 400);
    }

    const newId = crypto.randomUUID();
    const hash = await pwd.hashPassword(pwdStr);
    await db.createUser({
      id: newId,
      username,
      email: userEmail,
      passwordHash: hash,
      name: nameTrimmed,
      role: 'user',
      plan: 'free',
    });

    if (electronHw) {
      await loginApproval.upsertPendingLoginDevice(
        newId,
        electronHw,
        body.deviceInfo ?? { source: 'electron-signup' },
        deviceId,
      );
    }

    await kv.set(`user:${newId}`, {
      id: newId,
      username,
      email: userEmail,
      name: nameTrimmed,
      role: 'user',
      plan: 'free',
      loginApproved: false,
      createdAt: new Date().toISOString(),
      dailyDownloads: 0,
      lastDownloadReset: new Date().toISOString(),
      registeredDeviceId: null,
      registeredAt: null,
    });

    await security.logSecurityEvent({
      userId: newId,
      eventType: 'USER_REGISTERED',
      severity: 'low',
      details: {
        method: electronHw ? 'electron' : deviceId.startsWith('web_') ? 'web' : 'device_header',
        captchaUsed: !!captchaToken,
      },
      ipAddress,
      timestamp: new Date().toISOString(),
    });

    console.log('✅ Yeni kullanıcı kaydedildi:', username);

    return c.json({
      success: true,
      pendingApproval: true,
      message:
        'Kayıt alındı. Hesap ve cihaz yönetici onayından sonra giriş yapabilirsiniz.',
      user: { id: newId, username, email: userEmail },
    });
  } catch (error) {
    const d = postgresErrorDetail(error);
    console.error('Kayıt hatası:', d.code, d.message, error);
    const devHint =
      Deno.env.get('ILSA_PRODUCTION') !== 'true'
        ? d.message
        : undefined;
    return c.json(
      {
        error: 'Kayıt işlemi başarısız',
        ...(devHint ? { detail: devHint } : {}),
      },
      500,
    );
  }
});

// ===== GİRİŞ =====
app.post('/make-server-47081311/signin', async (c) => {
  try {
    const body = await c.req.json();
    const usernameRaw = body.username ?? body.email;
    const { password, forceLogin } = body;
    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';
    const userAgent = c.req.header('user-agent') || 'unknown';

    if (!password) {
      return c.json({ error: 'Kullanıcı adı ve şifre gerekli' }, 400);
    }

    const trimmed = String(usernameRaw ?? '').trim();
    if (!trimmed) {
      return c.json({ error: 'Kullanıcı adı ve şifre gerekli' }, 400);
    }

    const signinRl = await setupGuard.rateLimitPublic('web_signin', ipAddress, 40, 60 * 1000);
    if (!signinRl.allowed) {
      return c.json({
        error: 'Çok fazla giriş denemesi. Lütfen bir dakika sonra tekrar deneyin.',
        resetAt: new Date(signinRl.resetAt).toISOString(),
      }, 429);
    }

    const deviceId = resolveClientDeviceIdForSession(c);
    if (deviceId.startsWith('web_')) {
      console.log('⚠️ Web oturumu cihaz parmak izi:', deviceId);
    }

    const row = trimmed.includes('@')
      ? await db.getUserByEmail(trimmed)
      : await db.getUserByUsername(normalizeLoginUsername(trimmed));
    if (!row || !(await verifyPasswordPooled(password, row.password_hash as string))) {
      logLoginEvent({
        username: trimmed,
        ipAddress,
        userAgent: c.req.header('user-agent'),
        channel: 'web',
        success: false,
        errorCode: 'INVALID_CREDENTIALS',
      });
      return c.json({ error: 'Kullanıcı adı veya şifre hatalı' }, 400);
    }

    if (row.role !== 'admin' && (await isElectronOnlyLogin())) {
      logLoginEvent({
        userId: row.id,
        username: trimmed,
        ipAddress,
        userAgent: c.req.header('user-agent'),
        channel: 'web',
        success: false,
        errorCode: 'ELECTRON_REQUIRED',
      });
      return c.json({
        error: 'Giriş yalnızca ILSA Support masaüstü uygulaması ile yapılabilir.',
        errorCode: 'ELECTRON_REQUIRED',
      }, 403);
    }

    const rowUsername = canonicalLoginUsernameFromUserRow({
      id: String(row.id),
      username: row.username,
      email: row.email,
    });

    let userData = await kv.get(`user:${row.id}`);
    if (!userData) {
      userData = {
        id: row.id,
        username: rowUsername,
        email: row.email ?? null,
        name: row.name,
        role: row.role,
        plan: row.plan,
        createdAt: row.created_at,
        dailyDownloads: row.daily_downloads ?? 0,
        lastDownloadReset: row.last_download_reset,
      };
      await kv.set(`user:${row.id}`, userData);
    } else {
      // PostgreSQL kaydı esas: KV eskiyse (role/plan) admin paneli ve demo girişi bozulmasın
      userData = {
        ...userData,
        username: rowUsername,
        email: row.email ?? userData.email ?? null,
        name: row.name,
        role: row.role,
        plan: row.plan,
      };
    }
    userData.maxSessions = maxSessionsFromSources(userData, row);
    await kv.set(`user:${row.id}`, userData);
    await setCachedUserKv(String(row.id), userData as Record<string, unknown>);

    const isWebDeviceId = (id: unknown) => String(id ?? '').startsWith('web_');
    const isAdmin = loginApproval.isAdminAccount(row, userData);

    const webGate = await loginApproval.gateWebLogin(row, userData, {
      isWebAdmin: isAdmin && isWebDeviceId(deviceId),
    });
    if (!webGate.allowed) {
      return c.json({ error: webGate.error, errorCode: webGate.errorCode }, webGate.status);
    }

    if (isAdmin) {
      await loginApproval.ensureAdminLoginReady(row.id, row, userData, { deviceId });
      userData = (await kv.get(`user:${row.id}`)) ?? userData;
    }

    const accessToken = await jwtAuth.signAccessToken(row.id, rowUsername);

    const maxSessions = effectiveMaxSessions(userData);
    const existingSessions = await kv.getByPrefix(`session:${row.id}:`);

    // ===== CİHAZ KONTROLÜ (yönetici hariç; çoklu oturum hakkı olanlar farklı cihazdan girebilir) =====
    const regDev = userData.registeredDeviceId;
    if (!isAdmin) {
      const webFingerprintDrift =
        !!regDev &&
        isWebDeviceId(regDev) &&
        isWebDeviceId(deviceId) &&
        String(regDev) !== String(deviceId);
      if (webFingerprintDrift) {
        userData.registeredDeviceId = deviceId;
        await kv.set(`user:${row.id}`, userData);
      } else if (regDev && regDev !== deviceId) {
        if (maxSessions <= 1 || !canAddSessionDevice(existingSessions, deviceId, maxSessions)) {
          return c.json({
            error:
              maxSessions <= 1
                ? 'Bu hesap başka bir cihaza kayıtlıdır. Sadece kayıtlı cihazdan giriş yapabilirsiniz.'
                : `Bu hesap için en fazla ${maxSessions} cihazdan eşzamanlı giriş yapılabilir.`,
            errorCode: maxSessions <= 1 ? 'DEVICE_MISMATCH' : 'SESSION_LIMIT_EXCEEDED',
            maxSessions,
          }, 403);
        }
      }
    } else if (userData.registeredDeviceId !== deviceId) {
      userData.registeredDeviceId = deviceId;
      await kv.set(`user:${row.id}`, userData);
    }

    // ===== WEB EŞZAMANLI OTURUM (kullanıcı hakkı / plan) =====
    if (!isAdmin && isWebDeviceId(deviceId)) {
      const webGate = await canOpenWebSession(String(row.id), maxSessions);
      if (!webGate.allowed && !forceLogin) {
        logLoginEvent({
          userId: row.id,
          username: rowUsername,
          ipAddress,
          userAgent: c.req.header('user-agent'),
          channel: 'web',
          success: false,
          errorCode: 'WEB_PRESENCE_LIMIT',
          message: `limit ${webGate.max} active ${webGate.active}`,
        });
        return c.json({
          error: `İzin verilen eşzamanlı web oturumu (${webGate.max}) dolu. Önce diğer sekmeden çıkış yapın.`,
          errorCode: 'WEB_PRESENCE_LIMIT',
          max: webGate.max,
          active: webGate.active,
        }, 403);
      }
    }

    // ===== SESSION LİMİT KONTROLÜ =====
    if (existingSessions.length >= maxSessions && !forceLogin) {
      return c.json({ 
        error: `Bu hesap için maksimum ${maxSessions} oturum açılabilir. Başka cihazda aktif oturumunuz var.`,
        errorCode: 'SESSION_LIMIT_EXCEEDED',
        currentSessions: existingSessions.length,
        maxSessions,
      }, 403);
    }

    // ForceLogin: Eski session'ları sil
    if (forceLogin && existingSessions.length > 0) {
      console.log(`🔄 Force login: ${existingSessions.length} eski session siliniyor...`);
      for (const session of existingSessions) {
        await kv.del(session.key);
      }
      await endAllWebPresenceForUser(String(row.id), 'force_login');
    }

    // Session oluştur
    const sessionId = `session:${row.id}:${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await kv.set(sessionId, {
      key: sessionId,
      userId: row.id,
      deviceId,
      accessToken,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    });
    
    console.log(`✅ Session oluşturuldu: ${userData.username} (${sessionId})`);

    if (!isAdmin && isWebDeviceId(deviceId)) {
      await startWebPresence({
        userId: String(row.id),
        sessionKey: sessionId,
        ipAddress,
        userAgent: c.req.header('user-agent'),
        deviceId,
      });
    }

    logLoginEvent({
      userId: row.id,
      username: rowUsername,
      ipAddress,
      userAgent: c.req.header('user-agent'),
      channel: 'web',
      success: true,
    });

    const sitePublic = await getSiteSettings();

    // Günlük indirme limitini sıfırla (yeni gün ise)
    const lastReset = new Date(userData.lastDownloadReset);
    const now = new Date();
    if (now.getDate() !== lastReset.getDate() || 
        now.getMonth() !== lastReset.getMonth() || 
        now.getFullYear() !== lastReset.getFullYear()) {
      userData.dailyDownloads = 0;
      userData.lastDownloadReset = now.toISOString();
      await kv.set(`user:${row.id}`, userData);
    }

    return c.json({
      success: true,
      accessToken,
      sessionId,
      webPresenceKey: sessionId,
      user: {
        id: row.id,
        username: userData.username,
        email: userData.email ?? null,
        name: userData.name,
        role: userData.role,
        plan: userData.plan,
        dailyDownloads: userData.dailyDownloads,
        createdAt: userData.createdAt,
        expiresAt: userData.expiresAt ?? null,
        maxSessions: effectiveMaxSessions(userData),
      },
    });
  } catch (error) {
    console.log('Giriş hatası:', error);
    return c.json({ error: 'Giriş işlemi başarısız' }, 500);
  }
});

// ===== ELECTRON GİRİŞ (Hardware ID ile) - SQL VERSION =====
app.post('/make-server-47081311/electron-signin', async (c) => {
  try {
    const body = await c.req.json();
    const usernameRaw = body.username ?? body.email;
    const { password, hardwareId, deviceInfo } = body;

    if (!usernameRaw || !password || !hardwareId) {
      return c.json({ error: 'Kullanıcı adı, şifre ve cihaz bilgisi gerekli' }, 400);
    }

    const trimmed = String(usernameRaw).trim();
    if (!trimmed) {
      return c.json({ error: 'Kullanıcı adı, şifre ve cihaz bilgisi gerekli' }, 400);
    }

    let user: Awaited<ReturnType<typeof db.getUserByUsername>>;

    if (trimmed.includes('@')) {
      user = await db.getUserByEmail(trimmed);
      if (!user) {
        return c.json({ error: 'Kullanıcı adı veya şifre hatalı' }, 400);
      }
      const ph = user.password_hash as string;
      if (!ph || ph.length < 10) {
        await db.updateUserPassword(user.id, await pwd.hashPassword(password));
        user = await db.getUserById(user.id);
      } else if (!(await verifyPasswordPooled(password, ph))) {
        return c.json({ error: 'Kullanıcı adı veya şifre hatalı' }, 400);
      }
    } else {
      const username = normalizeLoginUsername(trimmed);
      if (!isValidLoginUsername(username)) {
        return c.json({
          error:
            'Geçersiz kullanıcı adı. 3–32 karakter; yalnızca küçük harf, rakam ve alt çizgi (_) kullanın.',
        }, 400);
      }

      user = await db.getUserByUsername(username);
      if (!user) {
        const uid = crypto.randomUUID();
        const hash = await pwd.hashPassword(password);
        user = await db.createUser({
          id: uid,
          username,
          email: null,
          passwordHash: hash,
          name: username,
          role: 'user',
          plan: 'free',
        });
      } else {
        const ph = user.password_hash as string;
        if (!ph || ph.length < 10) {
          await db.updateUserPassword(user.id, await pwd.hashPassword(password));
          user = await db.getUserById(user.id);
        } else if (!(await verifyPasswordPooled(password, ph))) {
          return c.json({ error: 'Kullanıcı adı veya şifre hatalı' }, 400);
        }
      }
    }

    const userId = user!.id;
    let userDataKv = await kv.get(`user:${userId}`);
    if (!userDataKv) {
      userDataKv = {
        id: userId,
        username: canonicalLoginUsernameFromUserRow({
          id: String(user!.id),
          username: user!.username,
          email: user!.email,
        }),
        role: user!.role ?? 'user',
        plan: user!.plan ?? 'free',
      };
    }
    userDataKv.maxSessions = maxSessionsFromSources(userDataKv, user!);
    await kv.set(`user:${userId}`, userDataKv);

    const gate = await loginApproval.gateElectronLogin(
      userId,
      user!,
      userDataKv,
      hardwareId,
      deviceInfo,
    );
    if (!gate.allowed) {
      return c.json(
        {
          error: gate.error,
          errorCode: gate.errorCode,
          registeredDevice: gate.registeredDevice,
        },
        gate.status,
      );
    }

    if (loginApproval.isAdminAccount(user!, userDataKv)) {
      await loginApproval.ensureAdminLoginReady(userId, user!, userDataKv, {
        hardwareId,
        deviceInfo,
      });
      userDataKv = (await kv.get(`user:${userId}`)) ?? userDataKv;
    }

    // 5. Download limit sıfırlama kontrolü
    await db.checkDownloadLimit(userId, user.plan === 'premium' ? -1 : 5);
    
    // 6. Electron token oluştur (24 saat)
    const electronToken = await db.createElectronToken(userId, hardwareId, 24);

    const un = canonicalLoginUsernameFromUserRow({
      id: String(user!.id),
      username: user!.username,
      email: user!.email,
    });
    console.log(`✅ Electron signin başarılı: ${un}, token: ${electronToken}`);

    const latestKv = (await kv.get(`user:${userId}`)) as Record<string, unknown> | null;
    return c.json({
      success: true,
      electronToken,
      user: publicSessionUser(
        latestKv ?? {
          id: user.id,
          username: un,
          email: user.email ?? null,
          name: user.name,
          role: user.role,
          plan: user.plan,
          dailyDownloads: user.daily_downloads,
          createdAt: user.created_at,
        },
      ),
    });
  } catch (error: any) {
    console.error('Electron signin error:', error);
    return c.json({ error: error.message || 'Giriş işlemi başarısız' }, 500);
  }
});

// ===== ELECTRON TOKEN DOĞRULAMA - SQL VERSION =====
app.post('/make-server-47081311/validate-electron-token', async (c) => {
  console.log('🚀 /validate-electron-token endpoint çağrıldı');
  
  try {
    const body = await c.req.json();
    const electronToken = body?.electronToken;
    
    console.log('📦 Request body:', body);
    console.log('🔑 Electron token:', electronToken);

    if (!electronToken) {
      console.error('❌ Token gerekli');
      return c.json({ error: 'Token gerekli' }, 400);
    }

    console.log(`🔍 Token validation başladı: ${electronToken}`);

    // 1. SQL'den token'ı doğrula
    console.log('📊 SQL query başlıyor...');
    const tokenData = await db.validateElectronToken(electronToken);
    console.log('📊 Token data:', tokenData);

    if (!tokenData) {
      console.error('❌ Token geçersiz veya süresi dolmuş');
      return c.json({ error: 'Geçersiz veya süresi dolmuş token' }, 401);
    }

    console.log(`✅ Token geçerli, user_id: ${tokenData.user_id}`);

    // 2. Kullanıcı bilgilerini al
    const user = await db.getUserById(tokenData.user_id);

    if (!user) {
      console.error('❌ Kullanıcı bulunamadı');
      return c.json({ error: 'Kullanıcı bulunamadı' }, 404);
    }

    const unRaw = normalizeLoginUsername(String((user as { username?: string }).username ?? ''));
    const principal = isValidLoginUsername(unRaw)
      ? unRaw
      : normalizeLoginUsername(`u${String(user.id).replace(/-/g, '').slice(0, 12)}`);

    console.log(`✅ Kullanıcı bulundu: ${principal}`);

    const accessToken = await jwtAuth.signAccessToken(String(user.id), principal);

    console.log(`✅ Access token oluşturuldu`);

    // 4. SQL'de session oluştur
    const deviceId = `electron_${Date.now()}`;
    await db.createSession({
      userId: user.id,
      deviceId,
      hardwareId: tokenData.hardware_id,
      userAgent: 'ILSA Support Electron App',
    });

    console.log(`✅ SQL session oluşturuldu: ${deviceId}`);

    // 5. Token'ı sil (tek kullanımlık)
    await db.deleteElectronToken(electronToken);
    console.log(`✅ Electron token silindi (tek kullan��mlık)`);

    console.log(`🎉 Token validation başarılı: ${principal}`);

    const latestKv = (await kv.get(`user:${user.id}`)) as Record<string, unknown> | null;
    return c.json({
      success: true,
      accessToken,
      user: publicSessionUser(
        latestKv ?? {
          id: user.id,
          username: principal,
          email: user.email ?? null,
          name: user.name,
          role: user.role,
          plan: user.plan,
          dailyDownloads: user.daily_downloads || 0,
          createdAt: user.created_at,
        },
      ),
    });
  } catch (error: any) {
    console.error('❌ Token validation error:', error);
    console.error('❌ Error stack:', error.stack);
    return c.json({ 
      error: error.message || 'Token doğrulama başarısız',
      details: error.toString(),
      stack: error.stack 
    }, 500);
  }
});

app.post('/make-server-47081311/signout', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];

    if (!accessToken) {
      return c.json({ error: 'Token gerekli' }, 401);
    }

    let userId: string | null = null;
    if (jwtAuth.looksLikeJwt(accessToken)) {
      const active = await jwtAuth.verifyAccessTokenActive(accessToken);
      if (active) {
        userId = active.sub;
        await jwtAuth.revokeJwtSessionByToken(accessToken);
      }
    } else {
      const sec = await security.validateSecureRequest(c);
      if (sec.valid && sec.user && typeof sec.user === 'object' && 'id' in sec.user) {
        userId = String((sec.user as { id: string }).id);
        if (sec.newToken) c.header('X-New-Token', sec.newToken);
      }
    }

    if (!userId) {
      return c.json({ error: 'Geçersiz token' }, 401);
    }

    const sessions = await kv.getByPrefix(`session:${userId}:`);
    const currentSession = sessions.find((s: { accessToken?: string }) => s.accessToken === accessToken);

    if (currentSession?.key) {
      await kv.del(currentSession.key);
      await endWebPresence(String(currentSession.key), userId, 'signout');
    }

    return c.json({ success: true });
  } catch (error) {
    console.log('Çıkış hatası:', error);
    return c.json({ error: 'Çıkış başarısız' }, 500);
  }
});

/** Tüm web + secure oturumları sonlandır */
app.post('/make-server-47081311/logout-all-sessions', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Giriş gerekli', errorCode: 'LOGIN_REQUIRED' }, 401);
    }

    let userId: string | null = null;
    let newToken: string | undefined;

    const __auth = await authUser(accessToken, c);
    if (__auth.ok) {
      userId = __auth.user.id;
    } else {
      const sec = await security.validateSecureRequest(c);
      if (!sec.valid || !sec.user || typeof sec.user !== 'object' || !('id' in sec.user)) {
        return c.json({
          error: sec.error || 'Geçersiz oturum',
          errorCode: sec.errorCode || 'TOKEN_INVALID',
        }, sec.statusCode || 401);
      }
      userId = String((sec.user as { id: string }).id);
      newToken = sec.newToken;
    }

    const revokedSecure = await security.revokeAllSessionsForUser(userId!);
    const revokedJwt = await jwtAuth.revokeAllJwtSessionsForUser(userId!);
    if (newToken) c.header('X-New-Token', newToken);

    return c.json({
      success: true,
      revokedCount: revokedSecure + revokedJwt,
      revokedSecure,
      revokedJwt,
      message: `${revokedSecure + revokedJwt} oturum sonlandırıldı`,
    });
  } catch (error) {
    console.error('logout-all-sessions:', error);
    return c.json({ error: 'Oturumlar kapatılamadı' }, 500);
  }
});

app.get('/make-server-47081311/verify-session', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Token gerekli' }, 401);
    }

    const active = jwtAuth.looksLikeJwt(accessToken)
      ? await jwtAuth.verifyAccessTokenActive(accessToken)
      : null;
    const user = active
      ? { id: active.sub, username: active.username }
      : null;

    if (!user) {
      console.log('❌ Token validation failed: aktif JWT oturumu yok');
      return c.json({ error: 'Geçersiz token', errorCode: 'TOKEN_INVALID' }, 401);
    }

    // ✅ KV'den user verisini çekmeyi dene, yoksa Supabase Auth'dan devam et
    let userData = null;
    try {
      userData = await kv.get(`user:${user.id}`);
    } catch (kvError) {
      console.log(`⚠️ KV error (non-fatal): ${kvError.message}`);
    }
    
    if (!userData) {
      const jwtUsername = user.username;
      console.log(`ℹ️ User not in KV, creating from JWT: ${jwtUsername}`);
      const pgRow = await db.getUserById(user.id);
      userData = {
        id: user.id,
        username: jwtUsername,
        email: pgRow?.email ?? null,
        name: pgRow?.name ?? (jwtUsername || 'User'),
        role: pgRow?.role ?? 'user',
        plan: pgRow?.plan ?? 'free',
        downloadLimit: pgRow?.role === 'admin' ? -1 : 5,
        downloadsToday: 0,
      };
      
      // KV'ye kaydet (gelecekte kullanmak için)
      try {
        await kv.set(`user:${user.id}`, userData);
        console.log(`✅ User saved to KV: ${jwtUsername}`);
      } catch (kvSaveError) {
        console.log(`⚠️ Failed to save user to KV (non-fatal): ${kvSaveError.message}`);
      }
    } else {
      const pgRow = await db.getUserById(user.id);
      if (pgRow) {
        userData = {
          ...userData,
          role: pgRow.role ?? userData.role,
          plan: pgRow.plan ?? userData.plan,
          name: pgRow.name ?? userData.name,
          email: pgRow.email ?? userData.email ?? null,
        };
        try {
          await kv.set(`user:${user.id}`, userData);
        } catch {
          /* non-fatal */
        }
      }
    }

    // Session kontrolü - Token KV'de var mı?
    let sessions = [];
    let currentSession = null;
    
    try {
      sessions = await kv.getByPrefix(`session:${user.id}:`);
      currentSession = sessions.find((s: any) => s.accessToken === accessToken);
    } catch (kvError) {
      console.log(`⚠️ KV session check error (non-fatal): ${kvError.message}`);
      // Session kontrolünde hata olsa bile devam et
    }
    
    const displayLogin = userData.username ?? userData.email ?? user.username;

    if (currentSession) {
      // Son aktiviteyi güncelle
      try {
        currentSession.lastActivity = new Date().toISOString();
        await kv.set(currentSession.key, currentSession);
      } catch (kvError) {
        console.log(`⚠️ Failed to update session activity (non-fatal): ${kvError.message}`);
      }
      console.log(`✅ Session verified: ${displayLogin} (${sessions.length} active)`);
    } else {
      console.log(`ℹ️ No session in KV for ${displayLogin}, but auth token is valid`);
    }

    return c.json({ 
      success: true,
      user: {
        id: user.id,
        username: userData.username ?? user.username,
        email: userData.email ?? null,
        name: userData.name,
        role: userData.role,
        plan: userData.plan,
        downloadLimit: userData.downloadLimit,
        downloadsToday: userData.downloadsToday,
        expiresAt: userData.expiresAt ?? null,
        maxSessions: effectiveMaxSessions(userData),
      }
    });
  } catch (error) {
    console.error('❌ Session verification error:', error);
    return c.json({ error: 'Doğrulama başarısız' }, 500);
  }
});

// ===== KATEGORİ YÖNETİMİ =====
app.post('/make-server-47081311/categories', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Token gerekli' }, 401);
    }

    const __auth = await authUser(accessToken, c);
    const user = __auth.ok ? __auth.user : null;
    const error = __auth.ok ? null : new Error('auth');
    
    if (error || !user) {
      return c.json({ error: 'Geçersiz token' }, 401);
    }

    const userData = await kv.get(`user:${user.id}`);
    if (userData.role !== 'admin') {
      return c.json({ error: 'Yetkiniz yok' }, 403);
    }

    const { name, slug, icon, description } = await c.req.json();

    if (!name || !slug) {
      return c.json({ error: 'Name ve slug gerekli' }, 400);
    }

    const categoryId = crypto.randomUUID();
    await kv.set(`category:${categoryId}`, {
      id: categoryId,
      name,
      slug,
      icon: icon || '📱',
      description: description || '',
      fileCount: 0,
      createdAt: new Date().toISOString(),
    });

    return c.json({ success: true, categoryId });
  } catch (error) {
    console.log('Kategori oluşturma hatası:', error);
    return c.json({ error: 'Kategori oluşturma başarısız' }, 500);
  }
});

app.get('/make-server-47081311/categories', async (c) => {
  try {
    const brandId = c.req.query('brandId');
    
    // PostgreSQL'den kategorileri çek
    const categories = await pg.getCategoriesFromDB(brandId);
    
    return c.json({ 
      success: true, 
      categories: categories
    });
  } catch (error) {
    console.log('Kategori listeleme hatası:', error);
    return c.json({ error: 'Kategori listeleme başarısız' }, 500);
  }
});

// Markaları getir (PostgreSQL)
app.get('/make-server-47081311/brands', async (c) => {
  try {
    const brands = await pg.getBrandsFromDB();
    
    return c.json({ 
      success: true, 
      brands: brands
    });
  } catch (error) {
    console.log('Marka listeleme hatası:', error);
    return c.json({ error: 'Marka listeleme başarısız' }, 500);
  }
});

// Test endpoint - JSON dosyalarının durumunu kontrol et
app.get('/make-server-47081311/test-json', async (c) => {
  try {
    const kategoriler = await readJSONFile('kategoriler.json');
    const bilgi = await readJSONFile('bilgi.json');
    
    // Örnek kayıtlar
    const sampleKategoriler = kategoriler.slice(0, 3);
    const sampleBilgi = bilgi.slice(0, 3);
    
    // Altkat değerlerini analiz et
    const altkats = kategoriler.map((k: any) => k.altkat);
    const uniqueAltkats = [...new Set(altkats)];
    
    // alkat2 değerlerini analiz et
    const alkat2s = kategoriler.map((k: any) => k.alkat2);
    const uniqueAlkat2s = [...new Set(alkat2s)];

    const isPhpSoftRow = (k: any) => {
      const root = k.altkat === '0' || k.altkat === 0;
      if (root) return false;
      const a2 = k.alkat2;
      return a2 === '0' || a2 === 0 || a2 == null || String(a2).trim() === '';
    };
    const isPhpAlkat2ChildRow = (k: any) => {
      const a2 = k.alkat2;
      return a2 != null && String(a2).trim() !== '' && a2 !== '0' && a2 !== 0;
    };
    const softLevelFolders = kategoriler.filter(isPhpSoftRow).length;
    const alkat2LinkedFolders = kategoriler.filter(isPhpAlkat2ChildRow).length;

    return c.json({
      success: true,
      kategoriler: {
        total: kategoriler.length,
        sample: sampleKategoriler,
        uniqueAltkats,
        uniqueAlkat2s,
        brands: kategoriler.filter((k: any) => k.altkat === '0' || k.altkat === 0).length,
        /** Home::Soft: kök değil ve alkat2 sıfır/boş */
        softLevelFolders,
        /** Home::alt: alkat2 üst id ile bağlı */
        alkat2LinkedFolders,
        /** Eski API alan adları (artık PHP ile uyumlu sayım) */
        mainCategories: softLevelFolders,
        subcategories: alkat2LinkedFolders,
      },
      bilgi: {
        total: bilgi.length,
        sample: sampleBilgi,
      }
    });
  } catch (error) {
    console.error('Test hatası:', error);
    return c.json({ error: 'Test başarısız', details: String(error) }, 500);
  }
});

// ===== ALT KATEGORİ YÖNETİMİ =====
app.post('/make-server-47081311/subcategories', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Token gerekli' }, 401);
    }

    const __auth = await authUser(accessToken, c);
    const user = __auth.ok ? __auth.user : null;
    const error = __auth.ok ? null : new Error('auth');
    
    if (error || !user) {
      return c.json({ error: 'Geçersiz token' }, 401);
    }

    const userData = await kv.get(`user:${user.id}`);
    if (userData.role !== 'admin') {
      return c.json({ error: 'Yetkiniz yok' }, 403);
    }

    const { name, categoryId, icon } = await c.req.json();

    if (!name || !categoryId) {
      return c.json({ error: 'Name ve categoryId gerekli' }, 400);
    }

    const subcategoryId = crypto.randomUUID();
    await kv.set(`subcategory:${subcategoryId}`, {
      id: subcategoryId,
      name,
      categoryId,
      icon: icon || '📁',
      fileCount: 0,
      createdAt: new Date().toISOString(),
    });

    return c.json({ success: true, subcategoryId });
  } catch (error) {
    console.log('Alt kategori oluşturma hatası:', error);
    return c.json({ error: 'Alt kategori oluşturma başarısız' }, 500);
  }
});

app.get('/make-server-47081311/subcategories', async (c) => {
  try {
    const categoryId = c.req.query('categoryId');
    
    // PostgreSQL'den alt kategorileri çek
    const subcategories = await pg.getSubcategoriesFromDB(categoryId);
    
    return c.json({ 
      success: true, 
      subcategories: subcategories
    });
  } catch (error) {
    console.log('Alt kategori listeleme hatası:', error);
    return c.json({ error: 'Alt kategori listeleme başarısız' }, 500);
  }
});

// ===== DOSYA YÖNETİMİ =====
app.post('/make-server-47081311/files', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Token gerekli' }, 401);
    }

    const __auth = await authUser(accessToken, c);
    const user = __auth.ok ? __auth.user : null;
    const error = __auth.ok ? null : new Error('auth');
    
    if (error || !user) {
      return c.json({ error: 'Geçersiz token' }, 401);
    }

    const userData = await kv.get(`user:${user.id}`);
    if (userData.role !== 'admin') {
      return c.json({ error: 'Yetkiniz yok' }, 403);
    }

    const { 
      name, 
      description, 
      categoryId,
      subcategoryId, 
      fileType, 
      version, 
      size,
      downloadUrl,
      isPremium 
    } = await c.req.json();

    if (!name || !subcategoryId || !downloadUrl) {
      return c.json({ error: 'Name, subcategoryId ve downloadUrl gerekli' }, 400);
    }

    const fileId = crypto.randomUUID();
    await kv.set(`file:${fileId}`, {
      id: fileId,
      name,
      description: description || '',
      categoryId: categoryId || '',
      subcategoryId,
      fileType: fileType || 'firmware',
      version: version || '1.0',
      size: size || 0,
      downloadUrl,
      isPremium: isPremium || false,
      downloadCount: 0,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
    });

    // Alt kategori dosya sayısını güncelle
    const subcategory = await kv.get(`subcategory:${subcategoryId}`);
    if (subcategory) {
      await kv.set(`subcategory:${subcategoryId}`, {
        ...subcategory,
        fileCount: (subcategory.fileCount || 0) + 1,
      });
    }

    return c.json({ success: true, fileId });
  } catch (error) {
    console.log('Dosya oluşturma hatası:', error);
    return c.json({ error: 'Dosya oluşturma başarısız' }, 500);
  }
});

app.get('/make-server-47081311/files', async (c) => {
  try {
    const brandId = c.req.query('brandId');
    const categoryId = c.req.query('categoryId');
    const subcategoryId = c.req.query('subcategoryId');
    const search = c.req.query('search');

    const files = await pg.getFilesFromDB({
      brandId,
      categoryId,
      subcategoryId,
      searchTerm: search,
      resultLimit: pg.FILES_PAGE_SIZE,
      offset: 0,
    });

    return c.json({
      success: true,
      files: files.sort((a: any, b: any) =>
        new Date(b.date || b.tarih || 0).getTime() - new Date(a.date || a.tarih || 0).getTime(),
      ),
    });
  } catch (error) {
    console.log('Dosya listeleme hatası:', error);
    return c.json({ error: 'Dosya listeleme başarısız' }, 500);
  }
});

/** En yeni dosyalar listesine Drive alanları (yalnızca web’de açma için) */
function mapLatestFileDriveFields(file: any) {
  const rawLink = file.link != null ? String(file.link) : '';
  const googleDriveLink = gdrive.normalizeDriveUrlToUsercontent(rawLink) || rawLink;
  const driveId = rawLink ? gdrive.extractFileIdFromDriveUrl(rawLink) : null;
  const driveWebViewUrl =
    driveId != null ? `https://drive.google.com/file/d/${driveId}/view` : undefined;
  return { googleDriveLink, driveWebViewUrl, driveFileId: driveId };
}

// En yeni dosyalar (tarih DESC); bilgi.link → Google Drive alanları
app.get('/make-server-47081311/latest-files', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50');

    console.log(`📋 Latest files request - limit: ${limit}`);

    const sql = getSql();
    const filesData = await sql`
      SELECT id, adi, bildiri, boyut, down, tarih, katid, altkat, link
      FROM bilgi
      ORDER BY tarih DESC NULLS LAST
      LIMIT ${limit}
    `;

    const markaPaths = await getBrandMarkaPaths();
    const catRows = await sql`
      SELECT id, kategori_adi, ust_kategori_id, resim FROM kategoriler
    `;
    const catById = new Map<number, (typeof catRows)[0]>();
    for (const row of catRows || []) {
      catById.set(Number(row.id), row);
    }

    const files = (filesData || []).map((file: any) => {
      let brandName = null;
      let brandIcon = '';
      let brandId: number | null = null;
      let categoryName = null;
      let subcategoryName = null;

      if (file.katid != null && file.katid !== '' && Number.isFinite(Number(file.katid))) {
        const categoryData = catById.get(Number(file.katid));
        if (categoryData) {
          categoryName = categoryData.kategori_adi;
          if (categoryData.ust_kategori_id) {
            const brandRow = catById.get(Number(categoryData.ust_kategori_id));
            if (brandRow) {
              brandId = Number(brandRow.id);
              brandName = brandRow.kategori_adi;
              brandIcon =
                resolveMarkaIconWithPaths(brandRow.kategori_adi, brandRow.resim, markaPaths) || '';
            }
          } else {
            brandId = Number(categoryData.id);
            brandName = categoryData.kategori_adi;
            brandIcon =
              resolveMarkaIconWithPaths(categoryData.kategori_adi, categoryData.resim, markaPaths) ||
              '';
          }
        }
      }

      if (file.altkat != null && file.altkat !== '' && Number.isFinite(Number(file.altkat))) {
        const sub = catById.get(Number(file.altkat));
        if (sub) subcategoryName = sub.kategori_adi;
      }

      const sizeParsed = Number(file.boyut);
      const sizeSafe = Number.isFinite(sizeParsed) ? sizeParsed : 0;
      const { googleDriveLink, driveWebViewUrl, driveFileId } = mapLatestFileDriveFields(file);

      const infoText =
        (file.boyut && String(file.boyut).trim()) ||
        (file.asama && String(file.asama).trim()) ||
        (file.bildiri && String(file.bildiri).trim()) ||
        '';

      return {
        id: file.id,
        name: file.adi || 'Dosya',
        description: infoText,
        size: sizeSafe,
        downloadCount: file.down || 0,
        createdAt: file.tarih || new Date().toISOString(),
        brandId: brandId != null ? String(brandId) : null,
        brandName,
        brandIcon,
        categoryName,
        subcategoryName,
        driveFileId,
        googleDriveLink,
        driveWebViewUrl,
      };
    });

    console.log(`✅ Returned ${files.length} latest files`);

    const viewer = await getRequestUserKvData(c);
    const isAdmin = viewer?.role === 'admin';
    const payloadFiles = isAdmin ? files : stripPublicDownloadStats(files);

    return c.json({
      success: true,
      files: payloadFiles,
      total: payloadFiles.length,
    });
  } catch (error) {
    console.error('Latest files error:', error);
    return c.json({ error: 'En yeni dosyalar yüklenemedi' }, 500);
  }
});

// ----- CMS: ana sayfa slaytları & bilgi sayfaları (tablolar yoksa boş dizi) -----
app.get('/make-server-47081311/cms/hero-slides', async (c) => {
  try {
    const sql = getSql();
    await ensureCmsContentTables(sql);
    const rows = await sql`
      SELECT id, sort_order, title, subtitle, description, button_text, button_url, image_url, gradient
      FROM cms_hero_slides
      WHERE is_active = true
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
    }));
    return c.json({ success: true, slides });
  } catch (e) {
    console.error('cms/hero-slides:', e);
    return c.json({ success: true, slides: [] });
  }
});

app.get('/make-server-47081311/cms/pricing-page', async (c) => {
  try {
    const sql = getSql();
    await ensureCmsPricingPageTable(sql);
    const rows = await sql`SELECT payload FROM cms_pricing_page WHERE id = 'default' LIMIT 1`;
    const payload = (rows[0] as { payload?: unknown } | undefined)?.payload;
    return c.json({ success: true, payload: payload ?? null });
  } catch (e) {
    console.error('cms/pricing-page:', e);
    return c.json({ success: true, payload: null });
  }
});

app.get('/make-server-47081311/cms/info-pages', async (c) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(String(c.req.query('limit') || '10'), 10) || 10));
    const page = Math.max(1, parseInt(String(c.req.query('page') || '1'), 10) || 1);
    const offset = (page - 1) * limit;
    const sql = getSql();
    const countRows = await sql`
      SELECT COUNT(*)::int AS c FROM cms_info_pages WHERE is_published = true
    `;
    const total = Number((countRows[0] as { c: number })?.c) || 0;
    const rows = await sql`
      SELECT id, slug, title, description, created_at
      FROM cms_info_pages
      WHERE is_published = true
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const pages = (rows || []).map((r: any) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      description: r.description,
      createdAt: r.created_at,
    }));
    return c.json({
      success: true,
      pages,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (e) {
    console.error('cms/info-pages:', e);
    return c.json(
      { success: true, pages: [], total: 0, page: 1, limit: 10, totalPages: 1 },
      200,
    );
  }
});

app.get('/make-server-47081311/cms/info-pages/:slug', async (c) => {
  try {
    const raw = c.req.param('slug') || '';
    const slug = decodeURIComponent(raw).trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) {
      return c.json({ error: 'Geçersiz slug' }, 400);
    }
    const sql = getSql();
    const rows = await sql`
      SELECT id, slug, title, description, created_at
      FROM cms_info_pages
      WHERE slug = ${slug} AND is_published = true
      LIMIT 1
    `;
    const r = rows[0];
    if (!r) return c.json({ error: 'Sayfa bulunamadı' }, 404);
    return c.json({
      success: true,
      page: {
        id: r.id,
        slug: r.slug,
        title: r.title,
        description: r.description,
        createdAt: r.created_at,
      },
    });
  } catch (e) {
    console.error('cms/info-pages/:slug', e);
    return c.json({ error: 'Sayfa yüklenemedi' }, 500);
  }
});

app.post('/make-server-47081311/files/:fileId/download', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const fileId = c.req.param('fileId');

    const file = await kv.get(`file:${fileId}`);
    if (!file) {
      return c.json({ error: 'Dosya bulunamadı' }, 404);
    }

    // Premium kontrol
    if (file.isPremium && !accessToken) {
      return c.json({ error: 'Bu dosya premium üyeler içindir' }, 403);
    }

    let userData = null;
    if (accessToken) {
      const __auth = await authUser(accessToken, c);
      const user = __auth.ok ? __auth.user : null;
      const error = __auth.ok ? null : new Error('auth');
      
      if (!error && user) {
        userData = await kv.get(`user:${user.id}`);
        
        // Premium dosya kontrolü (admin / aktif premium)
        if (file.isPremium) {
          if (!canAccessPremiumContent(userData)) {
            return c.json({
              error: userData.plan === 'premium' && !isPremiumPlanActive(userData)
                ? 'Premium üyeliğinizin süresi dolmuş. Yenileme sonrası tekrar deneyin.'
                : 'Bu dosya premium üyeler içindir',
              errorCode: 'PREMIUM_REQUIRED',
            }, 403);
          }
        }

        // İndirme limiti kontrolü
        if (PREMIUM_UPSELL_ENABLED && userData.plan === 'free') {
          const today = new Date().toISOString().split('T')[0];
          const lastReset = userData.lastDownloadReset?.split('T')[0];
          
          if (today !== lastReset) {
            userData.downloadsToday = 0;
            userData.lastDownloadReset = new Date().toISOString();
          }

          if (userData.downloadsToday >= userData.downloadLimit) {
            return c.json({ 
              error: 'Günlük indirme limitiniz doldu. Premium yeliğe geçin.' 
            }, 403);
          }

          // İndirme sayısını artır
          userData.downloadsToday += 1;
          await kv.set(`user:${user.id}`, userData);
        }
      }
    }

    if (!userData) {
      return c.json(
        {
          error: 'İndirmek için giriş yapmalısınız.',
          errorCode: 'LOGIN_REQUIRED',
        },
        403,
      );
    }

    // Tek kullanımlık token oluştur
    const downloadToken = crypto.randomUUID();
    await kv.set(`download:${downloadToken}`, {
      fileId,
      userId: userData.id,
      used: false,
      speed: userData?.plan === 'premium' ? 'fast' : 'slow',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    // İndirme sayısını artır
    await kv.set(`file:${fileId}`, {
      ...file,
      downloadCount: (file.downloadCount || 0) + 1,
    });

    // İndirme geçmişine kaydet
    if (userData?.id) {
      const downloadRecordId = crypto.randomUUID();
      const category = await kv.get(`category:${file.categoryId}`);
      const subcategory = await kv.get(`subcategory:${file.subcategoryId}`);

      await kv.set(`download:${userData.id}:${downloadRecordId}`, {
        id: downloadRecordId,
        userId: userData.id,
        fileId,
        fileName: file.name,
        categoryName: category?.name || 'Unknown',
        subcategoryName: subcategory?.name || 'Unknown',
        fileType: file.fileType,
        size: file.size,
        downloadedAt: new Date().toISOString(),
      });
    }

    return c.json({ 
      success: true, 
      downloadToken,
      fileName: file.name,
      fileSize: file.size,
      speed: userData?.plan === 'premium' ? 'fast' : 'slow',
    });
  } catch (error) {
    console.log('İndirme hazırlama hatası:', error);
    return c.json({ error: 'İndirme hazırlama başarısız' }, 500);
  }
});

app.get('/make-server-47081311/download/:token', async (c) => {
  try {
    const token = c.req.param('token');
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📥 DOWNLOAD TOKEN REQUEST:');
    console.log(`🔑 Token: ${token}`);
    
    // Token'ı KV'den al
    const downloadData = await kv.get(`download_token:${token}`);

    if (!downloadData) {
      console.log('❌ Token bulunamadı veya süresi dolmuş!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return c.json({ error: 'Geçersiz veya süresi dolmuş link' }, 404);
    }

    if (downloadData.used) {
      console.log('❌ Token zaten kullanılmış!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return c.json({ error: 'Bu link zaten kullanılmış' }, 400);
    }

    if (new Date(downloadData.expiresAt) < new Date()) {
      await kv.del(`download_token:${token}`);
      console.log('❌ Token süresi dolmuş!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return c.json({ error: 'Link süresi dolmuş' }, 400);
    }

    // Token'ı kullanıldı olarak işaretle
    await kv.set(`download_token:${token}`, {
      ...downloadData,
      used: true,
      usedAt: new Date().toISOString(),
    });

    console.log(`✅ Token geçerli - Dosya: ${downloadData.fileName}`);
    console.log(`📄 Link Type: ${downloadData.linkType}`);

    // Google Drive linkinden file ID çıkar
    const googleDriveUrl = downloadData.googleDriveUrl;
    
    if (isGoogleDriveStorageUrl(googleDriveUrl)) {
      const fileIdMatch = googleDriveUrl.match(/\/d\/([a-zA-Z0-9_-]+)|[?&]id=([a-zA-Z0-9_-]+)/);
      const driveFileId = fileIdMatch ? (fileIdMatch[1] || fileIdMatch[2]) : null;
      
      if (driveFileId) {
        console.log(`📥 Google Drive indirme başlatılıyor: ${driveFileId}`);
        console.log(`📄 Dosya adı: ${downloadData.fileName}`);
        console.log('🔐 Service Account kullanılıyor (hardcoded credentials)');
        
        try {
          // 🔐 Service Account ile indirme (credentials kod içinde)
          const response = await downloadWithServiceAccount(driveFileId);
          
          console.log(`✅ Service Account indirme başarılı: ${downloadData.fileName}`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

          return new Response(response.body, {
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadData.fileName)}"`,
              'Access-Control-Allow-Origin': '*',
            },
          });
        } catch (error: any) {
          console.error('❌ Google Drive indirme hatası:', error);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          
          return c.json({ 
            error: 'Dosya indirme başarısız',
            details: error.message || 'Bilinmeyen hata',
          }, 500);
        }
      }
    }

    // Google Drive değilse normal link döndür
    console.log('⚠️ Google Drive değil, normal link döndürülüyor');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return c.json({ 
      success: true, 
      downloadUrl: googleDriveUrl,
      fileName: downloadData.fileName,
    });
  } catch (error) {
    console.log('Dosya indirme hatası:', error);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return c.json({ error: 'İndirme başarısız' }, 500);
  }
});

// ===== PREMIUM İŞLEMLERİ =====
app.post('/make-server-47081311/upgrade-premium', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Token gerekli' }, 401);
    }

    const __auth = await authUser(accessToken, c);
    const user = __auth.ok ? __auth.user : null;
    const error = __auth.ok ? null : new Error('auth');
    
    if (error || !user) {
      return c.json({ error: 'Geçersiz token' }, 401);
    }

    const { planType } = await c.req.json(); // monthly, yearly

    const userData = await kv.get(`user:${user.id}`);

    // Burada gerçek ödeme işlemi yapılacak (iyzico/Stripe)
    // Şimdilik direkt premium yapıyoruz

    const expiresAt = planType === 'yearly' 
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await kv.set(`user:${user.id}`, {
      ...userData,
      plan: 'premium',
      planType,
      downloadLimit: -1, // Sınırsız
      maxSessions: 3,
      premiumSince: new Date().toISOString(),
      premiumExpiresAt: expiresAt.toISOString(),
    });

    return c.json({ 
      success: true,
      message: 'Premium üyeliğe geçildi',
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.log('Premium yükseltme hatası:', error);
    return c.json({ error: 'Yükseltme başarısız' }, 500);
  }
});

// admin/stats → setupAdminEndpoints (bilgi / kategoriler / indirme_gecmisi SQL)

// ===== ADMIN SESSION YÖNETİMİ =====
app.post('/make-server-47081311/admin/clear-all-sessions', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Token gerekli' }, 401);
    }

    const __auth = await authUser(accessToken, c);
    const user = __auth.ok ? __auth.user : null;
    const error = __auth.ok ? null : new Error('auth');
    
    if (error || !user) {
      return c.json({ error: 'Geçersiz token' }, 401);
    }

    const userData = await kv.get(`user:${user.id}`);
    if (userData.role !== 'admin') {
      return c.json({ error: 'Yetkiniz yok' }, 403);
    }

    // Tüm session'ları getir
    const allSessions = await kv.getByPrefix('session:');
    console.log(`🗑️ Tüm session'lar temizleniyor... (${allSessions.length} session)`);

    // Tümünü sil
    const sessionKeys = allSessions.map((s: any) => s.key);
    if (sessionKeys.length > 0) {
      await kv.mdel(sessionKeys);
    }

    console.log(`✅ ${sessionKeys.length} session silindi`);

    return c.json({ 
      success: true,
      message: `${sessionKeys.length} session temizlendi`,
      deletedCount: sessionKeys.length
    });
  } catch (error) {
    console.log('Session temizleme hatası:', error);
    return c.json({ error: 'Session temizleme başarısız' }, 500);
  }
});

app.post('/make-server-47081311/admin/clear-user-sessions', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Token gerekli' }, 401);
    }

    const __auth = await authUser(accessToken, c);
    const user = __auth.ok ? __auth.user : null;
    const error = __auth.ok ? null : new Error('auth');
    
    if (error || !user) {
      return c.json({ error: 'Geçersiz token' }, 401);
    }

    const userData = await kv.get(`user:${user.id}`);
    if (userData.role !== 'admin') {
      return c.json({ error: 'Yetkiniz yok' }, 403);
    }

    const { userId } = await c.req.json();
    if (!userId) {
      return c.json({ error: 'userId gerekli' }, 400);
    }

    // Kullanıcının tüm session'larını sil
    const userSessions = await kv.getByPrefix(`session:${userId}:`);
    const sessionKeys = userSessions.map((s: any) => s.key);
    
    if (sessionKeys.length > 0) {
      await kv.mdel(sessionKeys);
    }

    console.log(`✅ ${userId} kullanıcısının ${sessionKeys.length} session'ı silindi`);

    return c.json({ 
      success: true,
      message: `${sessionKeys.length} session temizlendi`,
      deletedCount: sessionKeys.length
    });
  } catch (error) {
    console.log('Kullanıcı session temizleme hatası:', error);
    return c.json({ error: 'Session temizleme başarısız' }, 500);
  }
});

// ===== ŞİFRE DEĞİŞTİRME =====
app.post('/make-server-47081311/change-password', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Token gerekli' }, 401);
    }

    const __auth = await authUser(accessToken, c);
    const user = __auth.ok ? __auth.user : null;
    const error = __auth.ok ? null : new Error('auth');
    
    if (error || !user) {
      return c.json({ error: 'Geçersiz token' }, 401);
    }

    const { newPassword } = await c.req.json();

    if (!newPassword) {
      return c.json({ error: 'Yeni şifre gerekli' }, 400);
    }

    if (newPassword.length < 8) {
      return c.json({ error: 'Yeni şifre en az 8 karakter olmalı' }, 400);
    }

    const userData = await kv.get(`user:${user.id}`);
    const row = await db.getUserById(user.id);
    if (!row) return c.json({ error: 'Kullanıcı bulunamadı' }, 404);

    await db.updateUserPassword(user.id, await pwd.hashPassword(newPassword));

    console.log(`✅ Şifre değiştirildi: ${userData?.username ?? userData?.email ?? row.username ?? row.email}`);

    return c.json({ success: true, message: 'Şifre başarıyla değiştirildi' });

  } catch (error) {
    console.log('Şifre değiştirme hatası:', error);
    return c.json({ error: 'Şifre değiştirilemedi' }, 500);
  }
});

// ===== İNDİRME GEÇMİŞİ =====
app.get('/make-server-47081311/download-history', async (c) => {
  try {
    const actor = await resolveDownloadHistoryActor(c);
    if (!actor) {
      return c.json({ error: 'Geçersiz token' }, 401);
    }
    if (actor.newToken) c.header('X-New-Token', actor.newToken);
    const userId = actor.userId;

    // Kullanıcının indirme kayıtlarını al (listeden gizlenenler hariç; satır DB'de kalır)
    const downloadRecords = (await kv.getByPrefix(`download:${userId}:`))
      .map((x: any) => x.value ?? x)
      .filter((d: any) => d.downloadedAt && !d.hiddenFromUser);
    
    // Tarihe göre sırala (en yeni en üstte)
    downloadRecords.sort((a: any, b: any) => {
      return new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime();
    });

    return c.json({ 
      success: true, 
      downloads: downloadRecords,
      total: downloadRecords.length,
    });

  } catch (error) {
    console.log('İndirme geçmişi hatası:', error);
    return c.json({ error: 'İndirme geçmişi yüklenemedi' }, 500);
  }
});

/** Kullanıcı listesinden kaldırır; kayıt silinmez, admin tüm indirmelerde görür. */
app.post('/make-server-47081311/download-history/dismiss', async (c) => {
  try {
    const actor = await resolveDownloadHistoryActor(c);
    if (!actor) {
      return c.json({ error: 'Geçersiz token' }, 401);
    }
    if (actor.newToken) c.header('X-New-Token', actor.newToken);
    const authedUserId = actor.userId;

    let body: { recordId?: string; id?: string } = {};
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      body = {};
    }
    const recordId = (body.recordId ?? body.id ?? '').trim();
    if (!recordId) {
      return c.json({ error: 'recordId gerekli' }, 400);
    }

    const hiddenAt = new Date().toISOString();
    const key = `download:${authedUserId}:${recordId}`;
    let sqlRows = 0;
    let sqlUnavailable = false;

    try {
      const sql = getSql();
      const u1 = await sql`
        UPDATE user_download_history
        SET hidden_from_user = true,
            hidden_at = ${hiddenAt}::timestamptz
        WHERE id = ${recordId}::uuid
          AND user_id = ${authedUserId}::uuid
        RETURNING id`;
      sqlRows = (u1 as { length: number }).length;

      if (sqlRows === 0) {
        const u2 = await sql`
          UPDATE user_download_history
          SET hidden_from_user = true,
              hidden_at = ${hiddenAt}::timestamptz
          WHERE id = ${recordId}::uuid
            AND user_id::text = ${String(authedUserId)}
          RETURNING id`;
        sqlRows = (u2 as { length: number }).length;
      }
    } catch (e: unknown) {
      const d = postgresErrorDetail(e);
      if (isPgSchemaMismatchForHistory(d)) {
        return c.json(
          {
            error: 'Veritabanı şeması indirme geçmişi gizleme için güncel değil.',
            code: 'SCHEMA_MISMATCH',
            detail: d.message,
            hint: 'API’nin bağlandığı Postgres’te sql/11_user_download_history_user_hide.sql uygulayın (npm run db:migrate:hide-history).',
          },
          503,
        );
      }
      if (/DATABASE_URL/.test(d.message) || d.message.includes('DATABASE_URL')) {
        sqlUnavailable = true;
      } else {
        console.log('İndirme geçmişi dismiss SQL hatası:', d.code, d.message);
        sqlUnavailable = true;
      }
    }

    const cur = await kv.get(key);
    if (cur && typeof cur === 'object') {
      const rowUserId = String((cur as any).userId ?? '').trim();
      if (rowUserId && rowUserId !== String(authedUserId)) {
        return c.json({ error: 'Yetkisiz' }, 403);
      }
      await kv.set(key, sanitizeDownloadHistoryForKvHide(cur as Record<string, unknown>, true, hiddenAt));
    }

    if (sqlRows === 0 && (!cur || typeof cur !== 'object')) {
      if (sqlUnavailable) {
        return c.json(
          {
            error: 'Kayıt bulunamadı veya veritabanı kullanılamıyor',
            detail: 'PostgreSQL bağlantısı yoksa migration ve Kayıt eşleşmesi kontrol edin.',
          },
          404,
        );
      }
      return c.json({ error: 'Kayıt bulunamadı' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.log('İndirme geçmişi gizleme hatası:', error);
    return c.json({ error: 'İşlem başarısız' }, 500);
  }
});

// ===== ADMIN: TÜM İNDİRMELER =====
app.get('/make-server-47081311/get-all-downloads', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Token gerekli' }, 401);
    }

    const __auth = await authUser(accessToken, c);
    const user = __auth.ok ? __auth.user : null;
    const error = __auth.ok ? null : new Error('auth');
    
    if (error || !user) {
      return c.json({ error: 'Geçersiz token' }, 401);
    }

    // Admin kontrolü
    const userData = await kv.get(`user:${user.id}`);
    if (!userData || userData.role !== 'admin') {
      return c.json({ error: 'Sadece adminler erişebilir' }, 403);
    }

    // Tüm indirme kayıtlarını al
    const allDownloads = (await kv.getByPrefix('download:')).map((x: any) => x.value ?? x);
    
    // Kullanıcı bilgilerini ekle ve dosya bazlı gruplama yap
    const enrichedDownloads = await Promise.all(
      allDownloads.map(async (download: any) => {
        const downloadUser = download.userId ? await kv.get(`user:${download.userId}`) : null;
        return {
          ...download,
          userEmail: downloadUser?.username || downloadUser?.email || 'Unknown',
          userName: downloadUser?.name || 'Unknown',
        };
      })
    );

    // Tarihe göre sırala (en yeni en üstte)
    enrichedDownloads.sort((a: any, b: any) => {
      const tb = new Date(b.downloadedAt || b.createdAt || 0).getTime();
      const ta = new Date(a.downloadedAt || a.createdAt || 0).getTime();
      return tb - ta;
    });

    // Dosya bazlı istatistikler
    const fileStats: { [key: string]: { count: number; users: Set<string>; downloads: any[] } } = {};
    enrichedDownloads.forEach((download: any) => {
      if (!fileStats[download.fileId]) {
        fileStats[download.fileId] = {
          count: 0,
          users: new Set(),
          downloads: [],
        };
      }
      fileStats[download.fileId].count++;
      fileStats[download.fileId].users.add(download.userId);
      fileStats[download.fileId].downloads.push(download);
    });

    // En çok indirilen dosyalar
    const topFiles = Object.entries(fileStats)
      .map(([fileId, stats]) => ({
        fileId,
        fileName: stats.downloads[0]?.fileName || 'Unknown',
        downloadCount: stats.count,
        uniqueUsers: stats.users.size,
        downloads: stats.downloads,
      }))
      .sort((a, b) => b.downloadCount - a.downloadCount)
      .slice(0, 10);

    return c.json({ 
      success: true, 
      downloads: enrichedDownloads,
      total: enrichedDownloads.length,
      fileStats: topFiles,
    });

  } catch (error) {
    console.log('Admin indirme listesi hatası:', error);
    return c.json({ error: 'İndirme listesi yüklenemedi' }, 500);
  }
});

/** Admin: dosyayı kimlerin indirdiği (user_download_history / KV uyumu) */
app.get('/make-server-47081311/admin/file/:fileId/downloaders', async (c) => {
  try {
    const ud = await getRequestUserKvData(c);
    if (!ud || ud.role !== 'admin') {
      return c.json({ error: 'Sadece adminler erişebilir' }, 403);
    }
    const fileId = c.req.param('fileId');
    const rawList = await kv.getByPrefix('download:');
    const entries: Array<{
      id: string;
      userId: string;
      userEmail: string;
      userName: string;
      downloadedAt: string;
      fileName?: string;
    }> = [];

    for (const item of rawList) {
      const d = (item as { value?: any }).value ?? item;
      if (!d || typeof d !== 'object') continue;
      if (String(d.fileId ?? '') !== String(fileId)) continue;
      if (!d.downloadedAt) continue;
      const uid = d.userId;
      if (uid == null || String(uid) === 'anonymous') continue;
      const u = await kv.get(`user:${uid}`);
      const login =
        typeof u?.username === 'string' && u.username
          ? u.username
          : typeof u?.email === 'string'
            ? u.email
            : 'Bilinmiyor';
      entries.push({
        id: String(d.id ?? ''),
        userId: String(uid),
        userEmail: login,
        userName: typeof u?.name === 'string' ? u.name : 'Bilinmiyor',
        downloadedAt: String(d.downloadedAt),
        fileName: typeof d.fileName === 'string' ? d.fileName : undefined,
      });
    }

    entries.sort((a, b) => new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime());

    return c.json({
      success: true,
      fileId: String(fileId),
      entries,
      total: entries.length,
    });
  } catch (error) {
    console.error('Admin file downloaders:', error);
    return c.json({ error: 'Liste alınamadı' }, 500);
  }
});

// ===== �� YENİ GÜVENLİK SİSTEMİ - TEK KULLANIMLIK TOKENLER =====

/** Masaüstü portable sürüm bilgisi (giriş öncesi kontrol) */
app.get('/make-server-47081311/desktop-app-config', async (c) => {
  try {
    const clientVersion =
      c.req.query('version')?.trim() ||
      c.req.header('x-client-version')?.trim() ||
      '';
    const release = await desktopApp.getDesktopReleaseConfig();
    const updateRequired = clientVersion
      ? desktopApp.compareSemver(clientVersion, release.requiredVersion) < 0
      : false;
    const updateAvailable = clientVersion
      ? desktopApp.compareSemver(clientVersion, release.latestVersion) < 0
      : false;
    return c.json({
      requiredVersion: release.requiredVersion,
      latestVersion: release.latestVersion,
      downloadUrl: release.downloadUrl,
      downloadPath: release.downloadPath,
      clientVersion: clientVersion || null,
      updateRequired,
      updateAvailable,
    });
  } catch (error) {
    console.error('desktop-app-config:', error);
    const release = await desktopApp.getDesktopReleaseConfig();
    return c.json({
      requiredVersion: release.requiredVersion,
      latestVersion: release.latestVersion,
      downloadUrl: release.downloadUrl,
      downloadPath: release.downloadPath,
      updateRequired: false,
    });
  }
});

/**
 * 🚀 Electron App giriş - Secure session oluşturur
 */
app.post('/make-server-47081311/electron-signin-secure', async (c) => {
  try {
    const body = await c.req.json();
    const usernameRaw = body.username ?? body.email;
    const { password, hardwareId, deviceInfo } = body;
    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';
    const userAgent = c.req.header('user-agent') || 'ILSA Support Electron App';

    if (!usernameRaw || !password || !hardwareId) {
      return c.json({ error: 'Kullanıcı adı, şifre ve cihaz bilgisi gerekli' }, 400);
    }

    const verGate = await desktopApp.assertDesktopClientVersion(
      desktopApp.clientVersionFromDeviceInfo(deviceInfo),
    );
    if (!verGate.ok) return desktopVersionReject(c, verGate);

    const devicePublicKey = String(body.devicePublicKey ?? '').trim();
    const deviceSignature = String(body.deviceSignature ?? '').trim();
    const deviceSignatureTimestamp = String(
      body.deviceSignatureTimestamp ?? body.deviceSignatureTs ?? '',
    ).trim();

    if (!devicePublicKey || !deviceSignature || !deviceSignatureTimestamp) {
      return c.json({
        error: 'Cihaz anahtarı ve imza gerekli. Lütfen güncel masaüstü uygulamasını kullanın.',
        errorCode: 'DEVICE_KEY_REQUIRED',
      }, 400);
    }

    const username = normalizeLoginUsername(String(usernameRaw));
    if (!isValidLoginUsername(username)) {
      return c.json({
        error:
          'Geçersiz kullanıcı adı. 3–32 karakter; yalnızca küçük harf, rakam ve alt çizgi (_) kullanın.',
      }, 400);
    }

    const loginSigCheck = await deviceSig.assertDeviceSignature({
      userId: `login:${username}:${hardwareId}`,
      devicePublicKey,
      headers: { signature: deviceSignature, timestamp: deviceSignatureTimestamp },
      expectedPurpose: 'LOGIN',
      method: 'POST',
      path: '/make-server-47081311/electron-signin-secure',
      loginContext: { username, hardwareId: String(hardwareId) },
    });
    if (!loginSigCheck.ok) {
      return c.json({
        error: loginSigCheck.error,
        errorCode: loginSigCheck.errorCode,
      }, 403);
    }

    // 1. Rate limiting
    const rateLimit = await setupGuard.rateLimitPublic('electron_signin', ipAddress, 10, 60 * 1000);
    if (!rateLimit.allowed) {
      return c.json({ 
        error: 'Çok fazla deneme yaptınız. Lütfen bekleyiniz.',
        resetAt: new Date(rateLimit.resetAt).toISOString()
      }, 429);
    }

    const row = await db.getUserByUsername(username);
    if (!row || !(await verifyPasswordPooled(password, row.password_hash as string))) {
      return c.json({ error: 'Kullanıcı adı veya şifre hatalı' }, 400);
    }

    const userId = row.id;
    const rowUsername = normalizeLoginUsername(String(row.username ?? username));
    const accessToken = await jwtAuth.signAccessToken(userId, rowUsername);

    let userData = await kv.get(`user:${userId}`);

    if (!userData) {
      userData = {
        id: userId,
        username: rowUsername,
        email: row.email ?? null,
        name: row.name || rowUsername,
        role: row.role ?? 'user',
        plan: row.plan ?? 'free',
        createdAt: row.created_at ?? new Date().toISOString(),
        dailyDownloads: row.daily_downloads ?? 0,
        lastDownloadReset: row.last_download_reset ?? new Date().toISOString(),
      };
    } else {
      userData = {
        ...userData,
        username: rowUsername,
        email: row.email ?? userData.email ?? null,
        name: row.name ?? userData.name,
        role: row.role ?? userData.role,
        plan: row.plan ?? userData.plan,
      };
    }
    userData.maxSessions = maxSessionsFromSources(userData, row);
    await kv.set(`user:${userId}`, userData);
    await setCachedUserKv(String(userId), userData as Record<string, unknown>);

    const gate = await loginApproval.gateElectronLogin(
      userId,
      row,
      userData,
      hardwareId,
      deviceInfo,
    );
    if (!gate.allowed) {
      return c.json(
        {
          error: gate.error,
          errorCode: gate.errorCode,
          registeredDevice: gate.registeredDevice,
        },
        gate.status,
      );
    }

    if (loginApproval.isAdminAccount(row, userData)) {
      await loginApproval.ensureAdminLoginReady(userId, row, userData, {
        hardwareId,
        deviceInfo,
      });
      userData = (await kv.get(`user:${userId}`)) ?? userData;
    }

    // 6. Security context
    const securityContext = {
      hardwareId,
      devicePublicKey,
      ipAddress,
      userAgent,
      fingerprint: '',
      timestamp: Date.now(),
    };

    // 7. Secure session oluştur
    const { sessionId, oneTimeToken } = await security.createSecureSession(
      userId,
      accessToken,
      securityContext
    );

    return c.json({
      success: true,
      oneTimeToken,
      sessionId,
      signPortRequired: true,
      user: {
        id: userData.id,
        username: userData.username,
        email: userData.email ?? null,
        name: userData.name,
        role: userData.role,
        plan: userData.plan,
      },
    });
  } catch (error: any) {
    console.error('Electron secure signin error:', error);
    return c.json({ error: error.message || 'Giriş işlemi başarısız' }, 500);
  }
});

/**
 * 🔐 Korumalı endpoint örneği
 */
app.get('/make-server-47081311/profile-secure', async (c) => {
  const validation = await security.validateSecureRequest(c);
  
  if (!validation.valid) {
    return c.json({ 
      error: validation.error,
      errorCode: validation.errorCode 
    }, validation.statusCode || 401);
  }

  if (validation.newToken) {
    c.header('X-New-Token', validation.newToken);
  }

  const boundDevice = validation.session?.devicePublicKey?.trim();
  const u = validation.user as { id?: string; username?: string } | undefined;
  const userId = u?.id ? String(u.id) : '';
  let accessToken: string | undefined;
  if (userId) {
    const row = await db.getUserById(userId);
    const unRaw = normalizeLoginUsername(String((u?.username ?? row?.username) || ''));
    const principal = isValidLoginUsername(unRaw)
      ? unRaw
      : normalizeLoginUsername(`u${userId.replace(/-/g, '').slice(0, 12)}`);
    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';
    const userAgent = c.req.header('user-agent') || 'ILSA Secure Profile';
    accessToken = await jwtAuth.signAccessToken(userId, principal, { ipAddress, userAgent });
  }

  const profileUser =
    validation.user && typeof validation.user === 'object'
      ? publicSessionUser(validation.user as Record<string, unknown>)
      : validation.user;

  return c.json({
    success: true,
    user: profileUser,
    deviceBound: !!boundDevice,
    ...(accessToken ? { accessToken } : {}),
  });
});

/** Masaüstü girişinden sonra varsayılan tarayıcıda oturum (tek kullanımlık kod) */
app.post('/make-server-47081311/desktop-browser-handoff', async (c) => {
  try {
    const validation = await security.validateSecureRequest(c);
    if (!validation.valid) {
      return c.json(
        { error: validation.error, errorCode: validation.errorCode },
        validation.statusCode || 401,
      );
    }

    const u = validation.user as { id?: string; username?: string } | undefined;
    const userId = u?.id ? String(u.id) : '';
    if (!userId) {
      return c.json({ error: 'Kullanıcı bulunamadı', errorCode: 'USER_NOT_FOUND' }, 404);
    }

    const row = await db.getUserById(userId);
    const unRaw = normalizeLoginUsername(
      String((u?.username ?? row?.username) || ''),
    );
    const principal = isValidLoginUsername(unRaw)
      ? unRaw
      : normalizeLoginUsername(`u${userId.replace(/-/g, '').slice(0, 12)}`);

    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';
    const userAgent = c.req.header('user-agent') || 'ILSA Browser Handoff';
    const accessToken = await jwtAuth.signAccessToken(userId, principal, { ipAddress, userAgent });

    const handoffId = crypto.randomUUID();
    const userPayload =
      validation.user && typeof validation.user === 'object'
        ? validation.user
        : await kv.get(`user:${userId}`);

    await kv.set(
      `browser_handoff:${handoffId}`,
      {
        accessToken,
        userId,
        user: userPayload,
        createdAt: new Date().toISOString(),
      },
      120,
    );

    if (validation.newToken) {
      c.header('X-New-Token', validation.newToken);
    }

    return c.json({ success: true, handoffId });
  } catch (error) {
    console.error('desktop-browser-handoff error:', error);
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Tarayıcı oturumu oluşturulamadı',
        errorCode: 'HANDOFF_FAILED',
      },
      500,
    );
  }
});

app.post('/make-server-47081311/redeem-browser-handoff', async (c) => {
  try {
    const body = await c.req.json();
    const handoffId = String(body?.handoffId ?? '').trim();
    if (!handoffId) {
      return c.json({ error: 'Handoff kodu gerekli', errorCode: 'HANDOFF_REQUIRED' }, 400);
    }

    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';
    const rateLimit = await setupGuard.rateLimitPublic(
      'browser_handoff_redeem',
      ipAddress,
      20,
      60 * 1000,
    );
    if (!rateLimit.allowed) {
      return c.json({ error: 'Çok fazla deneme. Lütfen bekleyin.', errorCode: 'RATE_LIMIT' }, 429);
    }

    const key = `browser_handoff:${handoffId}`;
    const data = await kv.get(key);
    if (!data?.accessToken) {
      return c.json(
        { error: 'Bağlantı geçersiz veya süresi doldu. Masaüstünden tekrar deneyin.', errorCode: 'HANDOFF_INVALID' },
        401,
      );
    }

    await kv.del(key);

    let user = data.user;
    if (!user || typeof user !== 'object') {
      user = await kv.get(`user:${data.userId}`);
    }
    if (!user) {
      const row = await db.getUserById(String(data.userId));
      if (!row) {
        return c.json({ error: 'Kullanıcı bulunamadı' }, 404);
      }
      user = {
        id: row.id,
        username: row.username,
        email: row.email ?? null,
        name: row.name,
        role: row.role ?? 'user',
        plan: row.plan ?? 'free',
      };
    }

    return c.json({
      success: true,
      accessToken: data.accessToken,
      user,
      browserMode: true,
    });
  } catch (error) {
    console.error('redeem-browser-handoff error:', error);
    return c.json({ error: 'Oturum aktarımı başarısız' }, 500);
  }
});

/**
 * 🔓 Logout
 */
app.post('/make-server-47081311/logout-secure', async (c) => {
  const validation = await security.validateSecureRequest(c);

  if (!validation.valid) {
    return c.json({
      error: validation.error,
      errorCode: validation.errorCode,
    }, validation.statusCode || 401);
  }

  try {
    const uid =
      validation.user &&
      typeof validation.user === 'object' &&
      'id' in validation.user
        ? String((validation.user as { id: string }).id)
        : '';
    if (validation.session && uid) {
      await security.invalidateSession(uid, validation.session.sessionId);
    }
    if (validation.newToken) {
      c.header('X-New-Token', validation.newToken);
    }

    return c.json({ success: true, message: 'Çıkış yapıldı' });
  } catch (error) {
    return c.json({ error: 'Çıkış başarısız' }, 500);
  }
});

// ===== 🔥 GOOGLE DRIVE İNDİRME SİSTEMİ =====

/**
 * Basitleştirilmiş indirme endpoint'i - LatestFilesPage için
 */
app.post('/make-server-47081311/download', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { fileId } = await c.req.json();
    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 DOWNLOAD REQUEST:');
    console.log(`📌 FileId: ${fileId}`);
    console.log(`📌 User IP: ${ipAddress}`);
    console.log(`📌 Has Token: ${!!accessToken}`);

    if (!fileId) {
      console.log('❌ FileId missing!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return c.json({ error: 'FileId gerekli' }, 400);
    }

    const sql = getSql();
    const fid = parseInt(String(fileId), 10);
    const fr = await sql`SELECT * FROM bilgi WHERE id = ${fid} LIMIT 1`;
    const fileData = fr[0];

    if (!fileData) {
      console.log('❌ File not found in PostgreSQL!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return c.json({ error: 'Dosya bulunamadı' }, 404);
    }

    const file = {
      id: fileData.id,
      name: fileData.adi || 'unknown',
      downloadUrl:
        gdrive.normalizeDriveUrlToUsercontent(String(fileData.link ?? '')) ||
        String(fileData.link ?? ''),
      size: fileData.boyut || 0,
      downloadCount: fileData.down || 0,
      isPremium: fileData.asama && fileData.asama.trim() !== '',
      categoryId: fileData.katid,
      subcategoryId: fileData.altkat,
      fileType: 'file',
    };

    console.log(`✅ File found: ${file.name}`);

    const actor = await resolveRequestActor(c);
    if (!actor) {
      return c.json(
        {
          error: 'İndirmek için giriş yapmalısınız.',
          errorCode: 'LOGIN_REQUIRED',
        },
        403,
      );
    }
    const userData = actor.userData;
    const userId = actor.userId;
    if (actor.newSecureToken) c.header('X-New-Token', actor.newSecureToken);

    if (file.isPremium) {
      if (!canAccessPremiumContent(userData)) {
        return c.json(
          {
            error: userData.plan === 'premium' && !isPremiumPlanActive(userData)
              ? 'Premium üyeliğinizin süresi dolmuş. Yenileme sonrası tekrar deneyin.'
              : 'Bu dosya premium üyeler içindir. Premium paket alın.',
            errorCode: 'PREMIUM_REQUIRED',
          },
          403,
        );
      }
    }

    // İndirme limiti kontrolü (free users)
    if (PREMIUM_UPSELL_ENABLED && userData.plan === 'free') {
      const today = new Date().toISOString().split('T')[0];
      const lastReset = userData.lastDownloadReset?.split('T')[0];
      
      if (today !== lastReset) {
        userData.dailyDownloads = 0;
        userData.lastDownloadReset = new Date().toISOString();
      }

      const dailyLimit = 5;
      if (userData.dailyDownloads >= dailyLimit) {
        return c.json({ 
          error: `Günlük indirme limitiniz doldu (${dailyLimit}). Premium üyeliğe geçin.`,
          errorCode: 'DAILY_LIMIT_EXCEEDED',
          limit: dailyLimit,
          used: userData.dailyDownloads,
        }, 403);
      }

      // İndirme sayısını artır
      userData.dailyDownloads += 1;
      await kv.set(`user:${userId}`, userData);
    }

    // 🔗 Link tipini tespit et (Google Drive, MediaFire, veya diğer)
    console.log('🔄 Detecting link type...');
    console.log(`📌 File download URL: ${file.downloadUrl}`);
    const isGoogleDrive = isGoogleDriveStorageUrl(file.downloadUrl);

    let directLink = file.downloadUrl;
    let driveFileId: string | null = null;

    if (isGoogleDrive) {
      console.log('✅ Google Drive link detected');

      driveFileId = gdrive.extractFileIdFromDriveUrl(String(file.downloadUrl));

      if (!driveFileId) {
        console.log('❌ Could not extract Google Drive file ID!');
        return c.json({
          error: 'Google Drive link geçersiz',
          errorCode: 'INVALID_DRIVE_LINK',
        }, 500);
      }

      directLink = gdrive.createUsercontentDirectDownloadUrl(driveFileId);
      try {
        const metadata = await getFileMetadataWithServiceAccount(driveFileId);
        if (metadata?.name) {
          file.name = metadata.name;
          if (metadata.size) file.size = parseInt(String(metadata.size), 10);
        }
      } catch (_e) {
        console.warn('⚠️ SA metadata failed (/download), using DB name');
      }
    }

    await sql`UPDATE bilgi SET down = COALESCE(down, 0) + 1 WHERE id = ${fid}`;

    // İndirme geçmişine kaydet (giriş yapmış kullanıcılar için)
    if (userData && userData.id) {
      const downloadRecordId = crypto.randomUUID();

      let categoryName = 'Unknown';
      let subcategoryName = 'Unknown';
      if (file.categoryId != null && file.categoryId !== '' && Number.isFinite(Number(file.categoryId))) {
        const cr = await sql`SELECT kategori_adi FROM kategoriler WHERE id = ${Number(file.categoryId)} LIMIT 1`;
        if (cr[0]) categoryName = cr[0].kategori_adi as string;
      }
      if (file.subcategoryId != null && file.subcategoryId !== '' && Number.isFinite(Number(file.subcategoryId))) {
        const sr = await sql`SELECT kategori_adi FROM kategoriler WHERE id = ${Number(file.subcategoryId)} LIMIT 1`;
        if (sr[0]) subcategoryName = sr[0].kategori_adi as string;
      }

      await kv.set(`download:${userData.id}:${downloadRecordId}`, {
        id: downloadRecordId,
        userId: userData.id,
        fileId,
        fileName: file.name,
        categoryName,
        subcategoryName,
        fileType: file.fileType,
        size: file.size,
        downloadedAt: new Date().toISOString(),
      });
    }

    console.log(`📥 Download: ${file.name}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (isGoogleDrive && driveFileId) {
      const downloadToken = crypto.randomUUID();
      await kv.set(`download_token:${downloadToken}`, {
        fileId: String(fileId),
        userId: userId ?? 'anonymous',
        googleDriveUrl: file.downloadUrl,
        directLink,
        driveFileId,
        fileName: file.name,
        fileSize: file.size,
        ipAddress,
        linkType: 'google_drive',
        used: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      return c.json({
        success: true,
        downloadToken,
        fileName: file.name,
        fileSize: file.size,
        linkType: 'google_drive',
        useDirectDownload: true,
        useBackendDriveStream: true,
        fallbackUrl: file.downloadUrl,
        /** Modal iframe: gerçek Google usercontent sayfası (srcDoc formu yerine) */
        driveIframePreviewUrl: directLink,
      });
    }

    return c.json({
      success: true,
      downloadUrl: directLink,
      fileName: file.name,
      fileSize: file.size,
    });

  } catch (error) {
    console.error('Download request error:', error);
    return c.json({ error: 'İndirme isteği başarısız' }, 500);
  }
});

/**
 * İndirme isteği oluşturur - Google Drive linkini gizler
 * Role-based access control uygular
 */
app.post('/make-server-47081311/request-download', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const fileId = c.req.query('fileId');
    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 REQUEST-DOWNLOAD DEBUG:');
    console.log(`📌 FileId: ${fileId}`);
    console.log(`📌 User IP: ${ipAddress}`);
    console.log(`📌 Has Token: ${!!accessToken}`);

    if (!fileId) {
      console.log('❌ FileId missing!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return c.json({ error: 'FileId gerekli' }, 400);
    }

    const sql = getSql();
    const fidNum = parseInt(String(fileId), 10);
    console.log(`🔎 Looking for file in PostgreSQL: bilgi.id = ${fileId}`);
    const fr = await sql`SELECT * FROM bilgi WHERE id = ${fidNum} LIMIT 1`;
    const fileData = fr[0];
    
    if (!fileData) {
      console.log(`❌ File NOT found in PostgreSQL: ${fileId}`);
      console.log(`❌ Error: not found`);
      console.log('━━━━━━━━━━━━━━━━━━━━━���━━━━━━━━━━━━━━━━');
      return c.json({ error: 'Dosya bulunamadı' }, 404);
    }
    
    // PostgreSQL'den gelen veriyi dönüştür
    const file = {
      id: fileData.id,
      name: fileData.adi,
      size: fileData.boyut,
      downloadUrl:
        gdrive.normalizeDriveUrlToUsercontent(String(fileData.link ?? '')) ||
        String(fileData.link ?? ''),
      isPremium: fileData.asama === 'Premium',
      downloadCount: fileData.down || 0,
      categoryId: fileData.katid,
      subcategoryId: fileData.altkat,
      fileType: 'file',
    };
    
    console.log(`✅ File found in PostgreSQL!`);
    console.log(`📄 File name: ${file.name}`);
    console.log(`📄 File size: ${file.size}`);
    console.log(`📄 Google Drive URL: ${file.downloadUrl}`);
    console.log(`📄 Is Premium: ${file.isPremium}`);

    const actor = await resolveRequestActor(c, { consumeSecureToken: false });
    if (!actor) {
      return c.json(
        {
          error: 'İndirmek için giriş yapmalısınız. Masaüstü uygulamasından «Tarayıcıdan devam et» ile siteyi açın.',
          errorCode: 'LOGIN_REQUIRED',
        },
        403,
      );
    }
    const userData = actor.userData;
    let userId = actor.userId;
    const newToken = actor.newSecureToken ?? null;
    if (actor.newAccessToken) {
      c.header('X-New-Access-Token', actor.newAccessToken);
    }

    if (file.isPremium) {
      if (!canAccessPremiumContent(userData)) {
        return c.json(
          {
            error: userData.plan === 'premium' && !isPremiumPlanActive(userData)
              ? 'Premium üyeliğinizin süresi dolmuş. Yenileme sonrası tekrar deneyin.'
              : 'Bu dosya premium üyeler içindir. Premium paket alın.',
            errorCode: 'PREMIUM_REQUIRED',
          },
          403,
        );
      }
    }

    // İndirme limiti kontrolü (free users)
    if (PREMIUM_UPSELL_ENABLED && userData.plan === 'free') {
      const today = new Date().toISOString().split('T')[0];
      const lastReset = String(userData.lastDownloadReset ?? '').split('T')[0];
      
      if (today !== lastReset) {
        userData.dailyDownloads = 0;
        userData.lastDownloadReset = new Date().toISOString();
      }

      const dailyLimit = 5;
      if (userData.dailyDownloads >= dailyLimit) {
        return c.json({ 
          error: `Günlük indirme limitiniz doldu (${dailyLimit}). Premium üyeliğe geçin.`,
          errorCode: 'DAILY_LIMIT_EXCEEDED',
          limit: dailyLimit,
          used: userData.dailyDownloads,
        }, 403);
      }

      // İndirme sayısını artır
      userData.dailyDownloads += 1;
      await kv.set(`user:${userId}`, userData);
    }

    // 🔗 Link tipini tespit et (Google Drive, MediaFire, veya diğer)
    console.log('🔄 Detecting link type...');
    console.log(`📌 File download URL: ${file.downloadUrl}`);
    const isGoogleDrive = isGoogleDriveStorageUrl(file.downloadUrl);
    const isMediaFire = String(file.downloadUrl ?? '').toLowerCase().includes('mediafire.com');
    console.log(`📌 isGoogleDrive: ${isGoogleDrive}`);
    console.log(`📌 isMediaFire: ${isMediaFire}`);
    
    let directLink = file.downloadUrl;
    let linkType = 'other';
    let driveFileId = null; // ✅ Global scope'da tanımla (KV'de kullanacağız)

    if (isGoogleDrive) {
      console.log('✅ Google Drive link detected');
      linkType = 'google_drive';

      driveFileId = gdrive.extractFileIdFromDriveUrl(String(file.downloadUrl));

      if (!driveFileId) {
        console.warn('⚠️ Drive ID çözülemedi, SA stream devre dışı. Fallback direct link kullanılacak.');
        linkType = 'google_drive_fallback';
      } else {
        // Ana indirme: /download-file ile SA stream (Google HTML “İndir / Yine de indir” adımlarını atlar)
        // KV’deki directLink: SA başarısız olursa yönlendirme için usercontent
        directLink = gdrive.createUsercontentDirectDownloadUrl(driveFileId);
        // Hız optimizasyonu: metadata çağrısı büyük dosyalarda başlangıcı geciktirebildiği için
        // request-download aşamasında beklemiyoruz. İndirme stream'i doğrudan başlatılır.
      }
    } else if (isMediaFire) {
      console.log('⚠️ MediaFire link detected');
      linkType = 'mediafire';
    } else {
      console.log('⚠️ Unknown link type');
    }

    await sql`UPDATE bilgi SET down = COALESCE(down, 0) + 1 WHERE id = ${fidNum}`;
    
    console.log(`✅ Download count updated in PostgreSQL`);

    if (userData && userData.id) {
      const downloadRecordId = crypto.randomUUID();
      
      let categoryName = 'Unknown';
      let subcategoryName = 'Unknown';
      if (file.categoryId != null && file.categoryId !== '' && Number.isFinite(Number(file.categoryId))) {
        const cr = await sql`SELECT kategori_adi FROM kategoriler WHERE id = ${Number(file.categoryId)} LIMIT 1`;
        if (cr[0]) categoryName = cr[0].kategori_adi as string;
      }
      if (file.subcategoryId != null && file.subcategoryId !== '' && Number.isFinite(Number(file.subcategoryId))) {
        const sr = await sql`SELECT kategori_adi FROM kategoriler WHERE id = ${Number(file.subcategoryId)} LIMIT 1`;
        if (sr[0]) subcategoryName = sr[0].kategori_adi as string;
      }

      await kv.set(`download:${userData.id}:${downloadRecordId}`, {
        id: downloadRecordId,
        userId: userData.id,
        fileId,
        fileName: file.name,
        categoryName,
        subcategoryName,
        fileType: file.fileType,
        size: file.size,
        downloadedAt: new Date().toISOString(),
      });
    }

    // 🔐 Tek kullanımlık download token oluştur
    const downloadToken = crypto.randomUUID();
    
    await kv.set(`download_token:${downloadToken}`, {
      fileId,
      userId,
      googleDriveUrl: file.downloadUrl,
      directLink,
      driveFileId: driveFileId || null,
      fileName: file.name,
      fileSize: file.size,
      ipAddress,
      linkType,
      used: false,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 dakika
    });

    console.log(`📥 Download request: ${file.name} by ${userData?.username || userData?.email || 'anonymous'}`);
    console.log(`🔐 Download token created: ${downloadToken}`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(
      isGoogleDrive
        ? '🚀 GOOGLE DRIVE: /download-file Service Account stream (HTML adımları yok)'
        : '📥 Download prepare',
    );
    console.log('📌 File size:', file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Unknown');
    console.log('📌 Link type:', linkType);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 🔄 Electron için yeni token'ı header'a ekle
    if (newToken) {
      c.header('X-New-Token', newToken);
      console.log('🔄 New token sent in response header for Electron');
    }

    c.header('X-Download-Prepare-Mode', isGoogleDrive ? 'service-account-stream' : 'direct-url');

    return c.json({
      success: true,
      downloadToken,
      fileName: file.name,
      fileSize: file.size,
      linkType,

      useDirectDownload: true,
      useBackendDriveStream: isGoogleDrive && !!driveFileId,
      downloadUrl: isGoogleDrive ? undefined : directLink,
      fallbackUrl: isGoogleDrive ? file.downloadUrl : undefined,
      /** Modal iframe içinde Google ara/indir sayfası (drive.usercontent / googleusercontent) */
      driveIframePreviewUrl: isGoogleDrive ? directLink : undefined,

      message: isGoogleDrive
        ? 'İndirme: sunucu üzerinden stream (Google onay sayfaları atlanır; dosya SA ile paylaşılmalı)'
        : 'İndirme hazır',
    });

  } catch (error) {
    console.error('Download request error:', error);
    return c.json({ error: 'İndirme isteği başarısız' }, 500);
  }
});

function decodeHtmlHref(href: string): string {
  return href
    .replace(/&amp;/g, '&')
    .replace(/\\u0026/gi, '&')
    .replace(/&#x3d;/gi, '=')
    .replace(/&#61;/g, '=')
    .replace(/\\u003d/gi, '=')
    .replace(/\\\//g, '/');
}

function extractGoogleConfirmUrlFromHtml(html: string, driveFileId: string): string | null {
  if (!html) return null;

  // 1) Google sayfasındaki doğrudan indirme linkini yakala (uc veya usercontent).
  const hrefRegex = /href="([^"]*(?:confirm|usercontent)[^"]*)"/gi;
  let match: RegExpExecArray | null = null;
  while ((match = hrefRegex.exec(html)) !== null) {
    const raw = decodeHtmlHref(match[1] || '');
    if (!raw) continue;
    if (raw.startsWith('http') && (raw.includes('drive.google.com') || raw.includes('drive.usercontent.google.com'))) {
      return raw;
    }
    if (raw.startsWith('/')) {
      return `https://drive.google.com${raw}`;
    }
  }

  // 2) Form action + hidden confirm token ile URL üret.
  const actionMatch = html.match(/action="([^"]*\/uc\?export=download[^"]*)"/i);
  const confirmMatch = html.match(/name="confirm"\s+value="([^"]+)"/i);
  const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/i);
  const actionRaw = actionMatch?.[1] ? decodeHtmlHref(actionMatch[1]) : null;
  const confirm = confirmMatch?.[1] ? decodeHtmlHref(confirmMatch[1]) : null;
  const uuid = uuidMatch?.[1] ? decodeHtmlHref(uuidMatch[1]) : null;
  if (actionRaw) {
    const actionUrl = actionRaw.startsWith('http') ? actionRaw : `https://drive.google.com${actionRaw}`;
    const u = new URL(actionUrl);
    if (!u.searchParams.get('id')) u.searchParams.set('id', driveFileId);
    if (confirm && !u.searchParams.get('confirm')) u.searchParams.set('confirm', confirm);
    if (uuid && !u.searchParams.get('uuid')) u.searchParams.set('uuid', uuid);
    return u.toString();
  }

  // 3) confirm token bulunduysa klasik uc URL'si oluştur.
  if (confirm) {
    const u = new URL('https://drive.google.com/uc');
    u.searchParams.set('export', 'download');
    u.searchParams.set('id', driveFileId);
    u.searchParams.set('confirm', confirm);
    if (uuid) u.searchParams.set('uuid', uuid);
    return u.toString();
  }

  return null;
}

async function downloadGoogleDriveClassic(driveFileId: string): Promise<Response> {
  const initialUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveFileId)}`;
  const ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  const first = await fetch(initialUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': ua,
    },
  });

  const firstType = (first.headers.get('content-type') || '').toLowerCase();
  if (!firstType.includes('text/html')) {
    return first;
  }

  const html = await first.text();
  const confirmUrl = extractGoogleConfirmUrlFromHtml(html, driveFileId);
  if (!confirmUrl) {
    throw new Error('Google confirm link could not be extracted');
  }

  const cookie = first.headers.get('set-cookie') || '';
  const cookieHeader = cookie
    .split(',')
    .map((part) => part.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');

  const second = await fetch(confirmUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': ua,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      Referer: 'https://drive.google.com/',
    },
  });

  return second;
}

/**
 * Tek kullanımlık download token ile dosya indirir
 * Google Drive API üzerinden streaming download yapar
 * NOT: Bu endpoint public - token validation yeterli
 */
app.get('/make-server-47081311/download-file/:token', async (c) => {
  try {
    const token = c.req.param('token');

    // ✅ Public endpoint - Authorization header gerekmez
    console.log('🌐 PUBLIC DOWNLOAD REQUEST');
    console.log(`📌 Token: ${token}`);
    console.log(`📌 User-Agent: ${c.req.header('User-Agent')}`);

    // Download session'ı al (hem download_token hem downloadsession key'lerini kontrol et)
    let session = await kv.get(`download_token:${token}`);
    if (!session) {
      session = await kv.get(`downloadsession:${token}`);
    }

    if (!session) {
      return c.json({ 
        error: 'Geçersiz veya süresi dolmuş indirme linki',
        errorCode: 'INVALID_TOKEN'
      }, 404);
    }

    // Token zaten kullanılmış mı?
    if (session.used) {
      return c.json({ 
        error: 'Bu indirme linki zaten kullanılmış',
        errorCode: 'TOKEN_ALREADY_USED'
      }, 400);
    }

    // Süre dolmuş mu?
    if (new Date(session.expiresAt) < new Date()) {
      await kv.del(`downloadsession:${token}`);
      return c.json({ 
        error: 'İndirme linki süresi dolmuş. Yeniden talep edin.',
        errorCode: 'TOKEN_EXPIRED'
      }, 400);
    }

    // 🔍 DEBUG: Session bilgilerini logla
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 DOWNLOAD SESSION DEBUG:');
    console.log(`📌 Token: ${token}`);
    console.log(`📌 Original Google Drive URL: ${session.googleDriveUrl}`);
    console.log(`📌 Direct Download Link: ${session.directLink}`);
    console.log(`📌 Drive File ID: ${session.driveFileId}`);
    console.log(`📌 User IP: ${session.userIp}`);
    console.log(`📌 Created: ${session.createdAt}`);
    console.log(`📌 Expires: ${session.expiresAt}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Token'ı kullanıldı olarak işaretle
    const sessionKey = `download_token:${token}`;
    await kv.set(sessionKey, {
      ...session,
      used: true,
      usedAt: new Date().toISOString(),
    });

    // ⚠️ MediaFire veya diğer linkler için direkt redirect
    if (session.linkType === 'mediafire' || session.linkType === 'other') {
      console.log(`⚠️ Link type: ${session.linkType}`);
      console.log(`⚠️ Redirecting to: ${session.directLink}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return c.redirect(session.directLink);
    }

    // ✅ Google Drive için Service Account streaming
    const driveFileId = session.driveFileId;
    
    if (!driveFileId) {
      console.error('❌ No driveFileId in session');
      return c.json({
        error: 'Google Drive dosya kimliği bulunamadı.',
        errorCode: 'DRIVE_FILE_ID_MISSING',
      }, 400);
    }

    console.log('✅ MODE: Google Drive Service Account Streaming');
    console.log(`📥 Service Account Request: fileId=${driveFileId}`);

    try {
      // 🔐 Service Account ile indirme (credentials kod içinde)
      const driveResponse = await downloadWithServiceAccount(driveFileId);

      if (!driveResponse.body) {
        throw new Error('No response body from Google Drive');
      }

      // Stream'i client'a aktar
      console.log(`✅ Streaming file to client via Service Account`);
      console.log(`📄 File Name: ${session.fileName}`);
      console.log(`📊 Content-Length: ${driveResponse.headers.get('Content-Length')} bytes`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return new Response(driveResponse.body, {
        headers: {
          'Content-Type': driveResponse.headers.get('Content-Type') || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(session.fileName)}"`,
          'Content-Length': driveResponse.headers.get('Content-Length') || '',
          'Cache-Control': 'no-cache',
          'X-Download-Token': token,
        },
      });

    } catch (apiError) {
      console.error('❌ Google Drive Service Account error, trying classic confirm-flow fallback:', apiError);
      try {
        const classicResponse = await downloadGoogleDriveClassic(String(driveFileId));
        if (!classicResponse.ok || !classicResponse.body) {
          throw new Error(`Classic download failed with status ${classicResponse.status}`);
        }

        const contentType = classicResponse.headers.get('Content-Type') || 'application/octet-stream';
        const contentLength = classicResponse.headers.get('Content-Length') || '';
        const contentDispositionFromDrive = classicResponse.headers.get('Content-Disposition');

        return new Response(classicResponse.body, {
          headers: {
            'Content-Type': contentType,
            'Content-Disposition':
              contentDispositionFromDrive || `attachment; filename="${encodeURIComponent(session.fileName)}"`,
            'Content-Length': contentLength,
            'Cache-Control': 'no-cache',
            'X-Download-Token': token,
            'X-Download-Mode': 'classic-confirm-fallback',
          },
        });
      } catch (classicError) {
        // Stream başlamadı: token’ı serbest bırak (yeniden “Otomatik indir” denenebilsin)
        const afterFail = await kv.get(sessionKey);
        if (afterFail) {
          await kv.set(sessionKey, { ...afterFail, used: false });
        }
        return c.json({
          error: 'İndirme başlatılamadı. Lütfen tekrar deneyin.',
          errorCode: 'GOOGLE_CLASSIC_FALLBACK_FAILED',
          details: String(classicError),
        }, 403);
      }
    }

  } catch (error) {
    console.error('Download error:', error);
    return c.json({ error: 'İndirme başarısız' }, 500);
  }
});

/**
 * Role-based files endpoint - Kullanıcının görebileceği dosyaları filtreler
 */
app.get('/make-server-47081311/files-filtered', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const hardwareId = c.req.header('X-Hardware-ID'); // Electron için
    const brandId = c.req.query('brandId');
    const categoryId = c.req.query('categoryId');
    const subcategoryId = c.req.query('subcategoryId');
    const search = c.req.query('search');
    const PAGE_SIZE = pg.FILES_PAGE_SIZE;
    const page = Math.max(1, parseInt(String(c.req.query('page') || '1'), 10) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    let userData = null;
    let userPlan = 'free'; // Default: free (giriş yapmamış)
    let newToken = null; // Electron için yeni token

    // Token varsa kullanıcı bilgilerini al (GET: oturum tüketilmez — indirme JWT'si bozulmasın)
    if (accessToken) {
      const viewer = await resolveViewerFromRequest(c);
      if (viewer) {
        userData = viewer.userData;
        userPlan = (userData?.plan as string) || 'free';
        newToken = viewer.newSecureToken ?? null;
        console.log(`✅ Viewer authenticated: ${userData?.username ?? userData?.email} (${userPlan})`);
      }
    }

    const listFilters = { brandId, categoryId, subcategoryId, searchTerm: search };
    const totalCount = await pg.countFilesFromDB(listFilters);

    let files = await pg.getFilesFromDB({
      ...listFilters,
      userRole: userPlan,
      resultLimit: PAGE_SIZE,
      offset,
    });

    const isAdminFilesFiltered = userData?.role === 'admin';
    if (!isAdminFilesFiltered) {
      files = stripPublicDownloadStats(files);
    }

    // ✅ Google Drive URL'yi artık GÖNDERİYORUZ (client-side debug için gerekli)
    const filesWithInfo = files.map((file: any) => ({
      ...file,
      hasAccess:
        !file.isPremium ||
        canAccessPremiumContent(userData) ||
        userPlan === 'admin' ||
        userData?.role === 'admin',
    }));

    // 🔄 Electron için yeni token'ı header'a ekle
    if (newToken) {
      c.header('X-New-Token', newToken);
      console.log('🔄 New token sent in response header');
    }

    return c.json({
      success: true,
      files: filesWithInfo.sort((a: any, b: any) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
      userPlan,
      totalFiles: totalCount,
      page,
      pageSize: PAGE_SIZE,
      totalPages: totalCount > 0 ? Math.ceil(totalCount / PAGE_SIZE) : 0,
    });

  } catch (error) {
    console.error('Files filtered error:', error);
    const d = postgresErrorDetail(error);
    return c.json(
      {
        error: 'Dosya listeleme başarısız',
        detail: d.message,
      },
      500,
    );
  }
});

/**
 * Eski PHP ara.wizard: dizinler (kategori_adi ILIKE %term) + dosyalar (bilgi.adi ILIKE %term%)
 */
app.get('/make-server-47081311/search', async (c) => {
  try {
    const q = (c.req.query('q') || c.req.query('search') || '').trim();
    if (!q) {
      return c.json({
        success: true,
        folders: [],
        files: [],
        userPlan: 'free',
        totalFiles: 0,
        page: 1,
        pageSize: pg.FILES_PAGE_SIZE,
        totalPages: 0,
      });
    }

    const page = Math.max(1, parseInt(String(c.req.query('page') || '1'), 10) || 1);
    const PAGE_SIZE = pg.FILES_PAGE_SIZE;

    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const hardwareId = c.req.header('X-Hardware-ID');
    let userPlan = 'free';
    let newToken: string | null = null;
    let searchUserData: any = null;

    if (accessToken) {
      const viewer = await resolveViewerFromRequest(c);
      if (viewer) {
        searchUserData = viewer.userData;
        userPlan = (viewer.userData?.plan as string) || 'free';
        newToken = viewer.newSecureToken ?? null;
      }
    }

    let { folders, files, filesTotal } = await pg.legacyAraSearch(q, userPlan, { page, pageSize: PAGE_SIZE });
    const isAdminSearch = searchUserData?.role === 'admin';
    if (!isAdminSearch) {
      files = stripPublicDownloadStats(files);
    }
    const filesWithInfo = files.map((file: any) => ({
      ...file,
      hasAccess:
        !file.isPremium ||
        canAccessPremiumContent(searchUserData) ||
        userPlan === 'admin' ||
        searchUserData?.role === 'admin',
    }));

    if (newToken) {
      c.header('X-New-Token', newToken);
    }

    return c.json({
      success: true,
      folders,
      files: filesWithInfo.sort(
        (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
      userPlan,
      totalFiles: filesTotal,
      page,
      pageSize: PAGE_SIZE,
      totalPages: filesTotal > 0 ? Math.ceil(filesTotal / PAGE_SIZE) : 0,
    });
  } catch (error) {
    console.error('Search error:', error);
    return c.json({ error: 'Arama başarısız' }, 500);
  }
});

// ========================================
// 🔄 MIGRATION ENDPOINT
// ========================================

/**
 * JSON verilerini PostgreSQL'e migrate eder (tek seferlik)
 */
app.post('/make-server-47081311/migrate-json-to-postgresql', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // Admin kontrolü
    const __auth = await authUser(accessToken, c);
    const user = __auth.ok ? __auth.user : null;
    const error = __auth.ok ? null : new Error('auth');
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const userData = await kv.get(`user:${user.id}`);
    if (userData?.role !== 'admin') {
      return c.json({ error: 'Admin yetkisi gerekli' }, 403);
    }
    
    const { runMigration } = await import('./migrate_json_to_postgresql.tsx');
    const result = await runMigration();
    pg.clearPgHelpersCache();
    return c.json(result);
  } catch (error) {
    console.error('Migration error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return c.json({ error: 'Migration başarısız', details: msg }, 500);
  }
});

/**
 * bilgi tablosunu TRUNCATE eder, bilgi.json'dan yeniden doldurur (admin).
 * indirme_gecmisi bilgi'ye FK ile CASCADE silinir.
 */
app.post('/make-server-47081311/reload-bilgi-from-json', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const __auth = await authUser(accessToken, c);
    const user = __auth.ok ? __auth.user : null;
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const userData = await kv.get(`user:${user.id}`);
    if (userData?.role !== 'admin') {
      return c.json({ error: 'Admin yetkisi gerekli' }, 403);
    }

    const { reloadBilgiFromJson } = await import('./migrate_json_to_postgresql.tsx');
    const result = await reloadBilgiFromJson();
    pg.clearPgHelpersCache();
    return c.json({ success: true, ...result });
  } catch (error) {
    console.error('reload-bilgi error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return c.json({ error: 'bilgi yeniden yükleme başarısız', details: msg }, 500);
  }
});

// ========================================
// 🧪 TEST/DEBUG ENDPOINTS
// ========================================

/**
 * Google Drive link parsing test endpoint
 * Test için: /test-drive-link?url=https://drive.google.com/file/d/...
 */
app.get('/make-server-47081311/test-drive-link', async (c) => {
  try {
    const testUrl = c.req.query('url') || 'https://drive.google.com/file/d/18AbWvBEs0r3SzAp_KtbtYZ_doAP4cU6w/view?usp=sharing';
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧪 GOOGLE DRIVE LINK TEST:');
    console.log(`📌 Original URL: ${testUrl}`);
    
    const fileId = gdrive.extractFileIdFromDriveUrl(testUrl);
    console.log(`📌 Extracted File ID: ${fileId}`);
    
    if (!fileId) {
      console.log('❌ Could not extract file ID!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return c.json({ 
        success: false, 
        error: 'Could not extract file ID from URL',
        url: testUrl 
      });
    }
    
    const directLink = gdrive.createDirectDownloadLink(fileId);
    console.log(`📌 Direct Download Link: ${directLink}`);
    
    console.log('✅ Testing with Google Drive Service Account...');
    try {
      const metadata = await getFileMetadataWithServiceAccount(fileId);
      console.log(`📄 File Name: ${metadata.name}`);
      console.log(`📄 File Size: ${metadata.size} bytes`);
      console.log(`📄 MIME Type: ${metadata.mimeType}`);
      console.log('✅ Google Drive Service Account test successful!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      return c.json({
        success: true,
        originalUrl: testUrl,
        fileId: fileId,
        directDownloadLink: directLink,
        serviceAccountConfigured: true,
        fileMetadata: {
          name: metadata.name,
          size: metadata.size,
          mimeType: metadata.mimeType,
        },
        message: 'Google Drive Service Account is working! You can use streaming downloads.'
      });
    } catch (apiError) {
      console.error('❌ Service Account Error:', apiError);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      return c.json({
        success: false,
        originalUrl: testUrl,
        fileId: fileId,
        directDownloadLink: directLink,
        serviceAccountConfigured: true,
        apiError: String(apiError),
        message: 'File ID extracted, but Service Account call failed. Make sure file is shared as "Anyone with the link".'
      }, 500);
    }
    
  } catch (error) {
    console.error('Test error:', error);
    return c.json({ 
      success: false, 
      error: String(error) 
    }, 500);
  }
});

// ===== 🛠️ UZAKTAN DESTEK SİSTEMİ =====

/**
 * Kullanıcı için destek ID oluştur
 */
app.get('/make-server-47081311/get-support-id', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Token gerekli' }, 401);
    }

    const __auth = await authUser(accessToken, c);
    const user = __auth.ok ? __auth.user : null;
    const error = __auth.ok ? null : new Error('auth');
    
    if (error || !user) {
      return c.json({ error: 'Geçersiz token' }, 401);
    }

    // Kullanıcı bilgilerini al
    const userData = await kv.get(`user:${user.id}`);
    
    if (!userData) {
      return c.json({ error: 'Kullanıcı bulunamadı' }, 404);
    }

    // Destek ID oluştur (kullanıcı ID'sinin ilk 8 karakteri)
    const supportId = `ILSA-${user.id.substring(0, 8).toUpperCase()}`;
    
    return c.json({
      success: true,
      supportId,
      userId: user.id,
      username: userData.username ?? null,
      email: userData.email ?? null,
      name: userData.name,
    });
  } catch (error: any) {
    console.error('Get support ID error:', error);
    return c.json({ error: error.message || 'Destek ID oluşturulamadı' }, 500);
  }
});

/**
 * Destek talebi gönder (Destek ekibi tarafından kullanılır)
 */
app.post('/make-server-47081311/request-support', async (c) => {
  try {
    const { supportId, supporterName } = await c.req.json();
    
    if (!supportId) {
      return c.json({ error: 'Destek ID gerekli' }, 400);
    }

    const requestId = crypto.randomUUID();
    
    // Destek talebini kaydet (geçici olarak memory'de)
    const supportRequest = {
      requestId,
      supportId,
      supporterName: supporterName || 'ILSA Support Team',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    
    // KV store'a kaydet (1 saat geçerli)
    await kv.set(`support-request:${supportId}`, supportRequest, 3600);
    
    return c.json({
      success: true,
      requestId,
      message: 'Destek talebi gönderildi, kullanıcı onayı bekleniyor',
      supportId,
    });
  } catch (error: any) {
    console.error('Request support error:', error);
    return c.json({ error: error.message || 'Destek talebi gönderilemedi' }, 500);
  }
});

/**
 * Destek talebini kontrol et (Kullanıcı tarafından polling ile kullanılır)
 */
app.get('/make-server-47081311/check-support-request', async (c) => {
  try {
    const supportId = c.req.query('supportId');
    
    if (!supportId) {
      return c.json({ error: 'Destek ID gerekli' }, 400);
    }

    // Destek talebini al
    const request = await kv.get(`support-request:${supportId}`);
    
    if (!request) {
      return c.json({ 
        success: true,
        hasRequest: false,
      });
    }

    return c.json({
      success: true,
      hasRequest: true,
      request: {
        requestId: request.requestId,
        supporterName: request.supporterName,
        status: request.status,
        createdAt: request.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Check support request error:', error);
    return c.json({ error: error.message || 'Destek talebi kontrol edilemedi' }, 500);
  }
});

/**
 * Destek talebini onayla/reddet (Kullanıcı tarafından kullanılır)
 */
app.post('/make-server-47081311/respond-support-request', async (c) => {
  try {
    const { requestId, approved, supportId } = await c.req.json();
    
    if (!requestId || !supportId) {
      return c.json({ error: 'Request ID ve Support ID gerekli' }, 400);
    }

    // Destek talebini al
    const request = await kv.get(`support-request:${supportId}`);
    
    if (!request || request.requestId !== requestId) {
      return c.json({ error: 'Geçersiz destek talebi' }, 404);
    }

    if (approved) {
      // Onaylandı - destek oturumu oluştur
      const sessionId = crypto.randomUUID();
      const session = {
        sessionId,
        supportId,
        requestId,
        status: 'active',
        startedAt: new Date().toISOString(),
      };
      
      // Session'ı kaydet (2 saat geçerli)
      await kv.set(`support-session:${sessionId}`, session, 7200);
      
      // Request'i güncelle
      await kv.set(`support-request:${supportId}`, {
        ...request,
        status: 'approved',
        sessionId,
      }, 3600);
      
      return c.json({
        success: true,
        approved: true,
        sessionId,
        message: 'Destek talebi onaylandı',
      });
    } else {
      // Reddedildi
      await kv.set(`support-request:${supportId}`, {
        ...request,
        status: 'rejected',
      }, 300); // 5 dakika sakla
      
      return c.json({
        success: true,
        approved: false,
        message: 'Destek talebi reddedildi',
      });
    }
  } catch (error: any) {
    console.error('Respond support request error:', error);
    return c.json({ error: error.message || 'Destek talebi yanıtlanamadı' }, 500);
  }
});

/**
 * Aktif destek oturumunu kontrol et
 */
app.get('/make-server-47081311/check-support-session', async (c) => {
  try {
    const sessionId = c.req.query('sessionId');
    
    if (!sessionId) {
      return c.json({ error: 'Session ID gerekli' }, 400);
    }

    const session = await kv.get(`support-session:${sessionId}`);
    
    if (!session) {
      return c.json({
        success: true,
        active: false,
      });
    }

    return c.json({
      success: true,
      active: true,
      session: {
        sessionId: session.sessionId,
        supportId: session.supportId,
        status: session.status,
        startedAt: session.startedAt,
      },
    });
  } catch (error: any) {
    console.error('Check support session error:', error);
    return c.json({ error: error.message || 'Destek oturumu kontrol edilemedi' }, 500);
  }
});

/**
 * Destek oturumunu sonlandır
 */
app.post('/make-server-47081311/end-support-session', async (c) => {
  try {
    const { sessionId } = await c.req.json();
    
    if (!sessionId) {
      return c.json({ error: 'Session ID gerekli' }, 400);
    }

    // Session'ı sil
    await kv.del(`support-session:${sessionId}`);
    
    return c.json({
      success: true,
      message: 'Destek oturumu sonlandırıldı',
    });
  } catch (error: any) {
    console.error('End support session error:', error);
    return c.json({ error: error.message || 'Destek oturumu sonlandırılamadı' }, 500);
  }
});

// ===== 🎥 WEBRTC P2P UZAKTAN DESTEK SİSTEMİ =====

/**
 * WebRTC Signaling: Offer gönder (Destek ekibi → Kullanıcı)
 */
app.post('/make-server-47081311/webrtc-offer', async (c) => {
  try {
    const { supportId, offer } = await c.req.json();
    
    if (!supportId || !offer) {
      return c.json({ error: 'Destek ID ve offer gerekli' }, 400);
    }

    console.log(`📡 WebRTC offer alındı: ${supportId}`);
    await kv.set(`webrtc-offer:${supportId}`, { offer, timestamp: Date.now() }, 300);

    return c.json({ success: true, message: 'Offer kaydedildi' });
  } catch (error: any) {
    console.error('WebRTC offer error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * WebRTC Signaling: Answer gönder (Kullanıcı → Destek ekibi)
 */
app.post('/make-server-47081311/webrtc-answer', async (c) => {
  try {
    const { supportId, answer } = await c.req.json();
    
    if (!supportId || !answer) {
      return c.json({ error: 'Destek ID ve answer gerekli' }, 400);
    }

    console.log(`📡 WebRTC answer alındı: ${supportId}`);
    await kv.set(`webrtc-answer:${supportId}`, { answer, timestamp: Date.now() }, 300);

    return c.json({ success: true, message: 'Answer kaydedildi' });
  } catch (error: any) {
    console.error('WebRTC answer error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * WebRTC Signaling: ICE Candidate gönder
 */
app.post('/make-server-47081311/webrtc-ice', async (c) => {
  try {
    const { supportId, candidate, sender } = await c.req.json();
    
    if (!supportId || !candidate || !sender) {
      return c.json({ error: 'Destek ID, candidate ve sender gerekli' }, 400);
    }

    console.log(`🧊 ICE candidate: ${supportId} (${sender})`);
    const key = `webrtc-ice:${supportId}:${sender}`;
    const existing = await kv.get(key) || { candidates: [] };
    existing.candidates.push({ candidate, timestamp: Date.now() });
    await kv.set(key, existing, 300);

    return c.json({ success: true });
  } catch (error: any) {
    console.error('WebRTC ICE error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * WebRTC: Offer al (Kullanıcı polling)
 */
app.get('/make-server-47081311/webrtc-get-offer', async (c) => {
  try {
    const supportId = c.req.query('supportId');
    if (!supportId) return c.json({ error: 'Destek ID gerekli' }, 400);

    const data = await kv.get(`webrtc-offer:${supportId}`);
    if (!data) return c.json({ success: true, hasOffer: false });

    await kv.del(`webrtc-offer:${supportId}`);
    return c.json({ success: true, hasOffer: true, offer: data.offer });
  } catch (error: any) {
    console.error('Get offer error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * WebRTC: Answer al (Destek ekibi polling)
 */
app.get('/make-server-47081311/webrtc-get-answer', async (c) => {
  try {
    const supportId = c.req.query('supportId');
    if (!supportId) return c.json({ error: 'Destek ID gerekli' }, 400);

    const data = await kv.get(`webrtc-answer:${supportId}`);
    if (!data) return c.json({ success: true, hasAnswer: false });

    await kv.del(`webrtc-answer:${supportId}`);
    return c.json({ success: true, hasAnswer: true, answer: data.answer });
  } catch (error: any) {
    console.error('Get answer error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * WebRTC: ICE Candidates al
 */
app.get('/make-server-47081311/webrtc-get-ice', async (c) => {
  try {
    const supportId = c.req.query('supportId');
    const receiver = c.req.query('receiver');
    
    if (!supportId || !receiver) {
      return c.json({ error: 'Destek ID ve receiver gerekli' }, 400);
    }

    const sender = receiver === 'user' ? 'supporter' : 'user';
    const data = await kv.get(`webrtc-ice:${supportId}:${sender}`);
    
    if (!data || data.candidates.length === 0) {
      return c.json({ success: true, hasCandidates: false, candidates: [] });
    }

    const candidates = data.candidates;
    await kv.del(`webrtc-ice:${supportId}:${sender}`);

    return c.json({ success: true, hasCandidates: true, candidates });
  } catch (error: any) {
    console.error('Get ICE error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * WebRTC: Bağlantı durumu
 */
app.post('/make-server-47081311/webrtc-status', async (c) => {
  try {
    const { supportId, status, sender } = await c.req.json();
    
    if (!supportId || !status || !sender) {
      return c.json({ error: 'Parametreler eksik' }, 400);
    }

    console.log(`📊 WebRTC ${status}: ${supportId} (${sender})`);
    await kv.set(`webrtc-status:${supportId}:${sender}`, {
      status,
      timestamp: Date.now(),
    }, 600);

    return c.json({ success: true });
  } catch (error: any) {
    console.error('WebRTC status error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ===== ADMIN ENDPOINTS =====
setupAdminEndpoints(app);
setupSettingsEndpoints(app);
setupUserFeaturesEndpoints(app);

// ===== GİRİŞ =====
const _port = parseInt(Deno.env.get('PORT') || '8787', 10);
/** Tüm arayüzlerde dinle (LAN / dış IP). Sadece yerel istiyorsanız .env.local: HOST=127.0.0.1 */
const _host = (Deno.env.get('HOST') ?? '0.0.0.0').trim() || '0.0.0.0';
Deno.serve({ port: _port, hostname: _host }, app.fetch);
console.log(`🚀 API: http://${_host}:${_port} (make-server-47081311/*)`);
console.log(`📌 Drive indirme: /download-file Service Account stream (API key gerekmez)`);