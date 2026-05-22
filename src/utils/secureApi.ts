/**
 * 🔒 SECURE API CLIENT
 * 
 * Tek kullanımlık tokenler ile güvenli API çağrıları
 * Her response'dan yeni token alır ve otomatik olarak kullanır
 */

import { apiFunctionsBase } from './supabase/info';
import { readResponseJson } from './readResponseJson';
import { getStoredJwtAccessToken, isJwtAccessToken, setStoredJwtAccessToken } from './authTokens';

const API_BASE = `${apiFunctionsBase}`;

// Token storage
let currentToken: string | null = null;
let hardwareId: string | null = null;
let signPort: number | null = null;
let fetchBridgeInstalled = false;

const SIGN_PORT_STORAGE = 'ilsaSignPort';

/**
 * Token'ı set et
 */
export function setSecureToken(token: string) {
  currentToken = token;
  if (typeof window !== 'undefined') {
    localStorage.setItem('secureToken', token);
  }
}

/**
 * Token'ı al
 */
export function getSecureToken(): string | null {
  if (currentToken) {
    return currentToken;
  }
  
  if (typeof window !== 'undefined') {
    currentToken = localStorage.getItem('secureToken');
  }
  
  return currentToken;
}

/**
 * Hardware ID'yi set et (Electron app'den gelecek)
 */
export function setHardwareId(hwId: string) {
  hardwareId = hwId;
  if (typeof window !== 'undefined') {
    localStorage.setItem('hardwareId', hwId);
  }
}

/**
 * Hardware ID'yi al
 */
export function getHardwareId(): string | null {
  if (hardwareId) {
    return hardwareId;
  }
  
  if (typeof window !== 'undefined') {
    hardwareId = localStorage.getItem('hardwareId');
  }
  
  return hardwareId;
}

/** Masaüstü localhost imza köprüsü (Electron) */
export function setSignPort(port: number) {
  signPort = port;
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(SIGN_PORT_STORAGE, String(port));
  }
}

export function getSignPort(): number | null {
  if (signPort != null) return signPort;
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(SIGN_PORT_STORAGE);
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function clearSignPort() {
  signPort = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(SIGN_PORT_STORAGE);
  }
}

function headersRecord(init?: HeadersInit): Record<string, string> {
  const h = new Headers(init);
  const out: Record<string, string> = {};
  h.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

async function bodyToProxyPayload(body: BodyInit | null | undefined): Promise<string | undefined> {
  if (body == null) return undefined;
  if (typeof body === 'string') return body;
  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }
  return await new Response(body).text();
}

/**
 * Secure API isteklerini Electron imza proxy üzerinden yönlendirir.
 * Token çalınsa bile başka PC'de imza üretilemez.
 */
type SignedFetchPayload = {
  targetUrl: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

type SignedFetchResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

declare global {
  interface Window {
    ilsaSignedFetch?: (payload: SignedFetchPayload) => Promise<SignedFetchResult>;
    ilsaOpenExternalUrl?: (url: string) => Promise<{ success?: boolean; error?: string }>;
    ilsaElectronShell?: boolean;
  }
}

function responseFromSignedResult(result: SignedFetchResult): Response {
  return new Response(result.body, {
    status: result.status,
    headers: result.headers,
  });
}

export function isElectronShell(): boolean {
  return typeof window !== 'undefined' && !!window.ilsaElectronShell;
}

export function installSignedFetchBridge() {
  if (fetchBridgeInstalled || typeof window === 'undefined') return;

  const useIpc = typeof window.ilsaSignedFetch === 'function';
  const port = getSignPort();
  if (!useIpc && !port) return;

  fetchBridgeInstalled = true;
  const nativeFetch = window.fetch.bind(window);
  const apiOrigin = new URL(API_BASE).origin;
  const ipcSign = window.ilsaSignedFetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    let target: URL;
    try {
      target = new URL(url, window.location.origin);
    } catch {
      return nativeFetch(input, init);
    }

    const isOurApi =
      url.startsWith(API_BASE) ||
      target.href.startsWith(API_BASE) ||
      target.origin === apiOrigin;

    if (!isOurApi) {
      return nativeFetch(input, init);
    }

    const secure = getSecureToken();
    if (!secure) {
      return nativeFetch(input, init);
    }

    const headers = headersRecord(init?.headers);
    const auth = headers.Authorization || headers.authorization || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (bearer !== secure) {
      return nativeFetch(input, init);
    }

    const method = (init?.method || 'GET').toUpperCase();
    const payload: SignedFetchPayload = {
      targetUrl: target.href,
      method,
      headers,
      body: await bodyToProxyPayload(init?.body),
    };

    if (ipcSign) {
      try {
        const result = await ipcSign(payload);
        return responseFromSignedResult(result);
      } catch (e) {
        console.error('[ilsaSignedFetch]', e);
        return new Response(JSON.stringify({ error: 'İmza köprüsü hatası' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const proxyRes = await nativeFetch(`http://127.0.0.1:${port}/forward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return proxyRes;
  };
}

/**
 * Web istekleri: yalnızca Bearer.
 * X-Hardware-ID göndermeyin — tarayıcıda kalmış eski localStorage hardwareId,
 * dosya listesi gibi uçlarda Electron yolunu tetikleyip sessizce anonim/ boş sonuçlara yol açabiliyordu.
 * Electron: `electronSecureSignIn` veya manuel header ile hardware ekleyin.
 */
export function buildOptionalAuthHeaders(accessToken: string | null | undefined): Record<string, string> {
  const bearer = getBearerForApi(accessToken);
  const h: Record<string, string> = {};
  if (!bearer) return h;
  h.Authorization = `Bearer ${bearer}`;
  const secure = getSecureToken();
  const hw = getHardwareId();
  if (secure && bearer === secure && hw && isElectronShell()) {
    h['X-Hardware-ID'] = hw;
  }
  return h;
}

/** Masaüstü secure oturum veya web JWT — ikisi de geçerli giriş */
export function isLoggedIn(user: unknown, accessToken: string | null | undefined): boolean {
  return !!user && !!getBearerForApi(accessToken);
}

/** profile-secure yanıtındaki JWT'yi kaydet */
export function applyJwtFromProfile(data: { accessToken?: string } | undefined): string | null {
  const jwt = data?.accessToken;
  if (jwt && isJwtAccessToken(jwt)) {
    setStoredJwtAccessToken(jwt);
    return jwt;
  }
  return getStoredJwtAccessToken();
}

/**
 * Üyelik süresi dahil güncel kullanıcı.
 * Masaüstü (secure token): profile-secure; web JWT: verify-session.
 */
export async function refreshUserMembership(): Promise<unknown | null> {
  if (getSecureToken()) {
    const result = await getSecureProfile();
    if (result.success && result.data?.user) {
      applyJwtFromProfile(result.data);
      const user = result.data.user;
      if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(user));
        try {
          window.dispatchEvent(new CustomEvent('ilsa-user-updated', { detail: user }));
        } catch {
          /* ignore */
        }
      }
      const jwt = getStoredJwtAccessToken();
      if (jwt) {
        const fromJwt = await refreshUserMembershipFromSession();
        if (fromJwt) return fromJwt;
      }
      return user;
    }
  }
  return await refreshUserMembershipFromSession();
}

/** verify-session ile expiresAt dahil güncel kullanıcı (JWT gerekir) */
export async function refreshUserMembershipFromSession(): Promise<unknown | null> {
  const jwt = getStoredJwtAccessToken();
  if (!jwt) return null;
  try {
    const response = await fetch(`${apiFunctionsBase}/verify-session`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!response.ok) return null;
    applyAccessTokenRotation(response);
    const result = await readResponseJson<{ user?: unknown }>(response);
    if (result?.user && typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(result.user));
      try {
        window.dispatchEvent(new CustomEvent('ilsa-user-updated', { detail: result.user }));
      } catch {
        /* ignore */
      }
    }
    return result?.user ?? null;
  } catch {
    return null;
  }
}

/** Tarayıcı yenilemede secure token + kullanıcıyı senkronize et */
export async function hydrateSecureSession(): Promise<{ user: unknown; accessToken: string | null } | null> {
  if (!hasValidToken()) return null;
  const result = await getSecureProfile();
  if (!result.success || !result.data?.user) return null;
  const jwt = applyJwtFromProfile(result.data);
  let user = result.data.user;
  const fromJwt = await refreshUserMembershipFromSession();
  if (fromJwt) user = fromJwt;
  if (typeof window !== 'undefined') {
    localStorage.setItem('user', JSON.stringify(user));
  }
  return { user, accessToken: jwt };
}

/** Yanıttaki X-New-Token (secure) ve X-New-Access-Token (JWT rotasyon) günceller */
export function applyAccessTokenRotation(response: Response) {
  const secure = response.headers.get('X-New-Token');
  if (secure) {
    setSecureToken(secure);
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('ilsa-secure-token-rotated', { detail: secure }));
      } catch {
        /* ignore */
      }
    }
  }

  const jwt = response.headers.get('X-New-Access-Token');
  if (jwt && isJwtAccessToken(jwt)) {
    const prev = getStoredJwtAccessToken();
    if (prev === jwt) return;
    setStoredJwtAccessToken(jwt);
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('ilsa-jwt-rotated', { detail: jwt }));
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * API Bearer seçimi:
 * - Masaüstü (secure + hardwareId): secure token
 * - Tarayıcı / handoff: JWT (eski secureToken indirmeyi kilitlemesin)
 */
export function getBearerForApi(accessTokenProp: string | null | undefined): string {
  const jwt = getStoredJwtAccessToken();
  if (jwt) return jwt;
  const secure = getSecureToken();
  const hw = getHardwareId();
  if (secure && hw && isElectronShell()) return secure;
  return secure || accessTokenProp || '';
}

/** JWT rotasyonu / secure token — indirme dahil kritik istekler sırayla gider */
let authenticatedFetchQueue: Promise<void> = Promise.resolve();

function isReadOnlyMethod(init?: RequestInit): boolean {
  const m = (init?.method || 'GET').toUpperCase();
  return m === 'GET' || m === 'HEAD';
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  accessTokenProp?: string | null,
): Promise<Response> {
  const execute = async (): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const bearer = getBearerForApi(accessTokenProp ?? null);
    if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
    const hw = getHardwareId();
    const secure = getSecureToken();
    if (secure && bearer === secure && hw && isElectronShell()) {
      headers.set('X-Hardware-ID', hw);
    }
    const response = await fetch(input, { ...init, headers });
    applyAccessTokenRotation(response);
    return response;
  };

  if (isReadOnlyMethod(init)) {
    return execute();
  }

  const result = authenticatedFetchQueue.then(execute);
  authenticatedFetchQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Token'ı temizle (logout)
 */
export function clearSecureToken() {
  currentToken = null;
  clearSignPort();
  if (typeof window !== 'undefined') {
    localStorage.removeItem('secureToken');
    localStorage.removeItem('hardwareId');
  }
}

/**
 * 🔐 Güvenli API çağrısı
 * 
 * Her request'te token gönderilir
 * Her response'dan yeni token alınır ve otomatik güncellenir
 */
export async function secureApiCall<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string; errorCode?: string }> {
  try {
    const token = getSecureToken();
    const hwId = getHardwareId();

    if (!token) {
      return {
        success: false,
        error: 'Token bulunamadı. Lütfen giriş yapın.',
        errorCode: 'NO_TOKEN',
      };
    }

    // Headers hazırla
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    };

    // Hardware ID varsa ekle
    if (hwId) {
      headers['X-Hardware-ID'] = hwId;
    }

    // Request yap
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    applyAccessTokenRotation(response);

    const data = await readResponseJson(response);

    // Hata kontrolü
    if (!response.ok) {
      // Token geçersiz veya session bitti
      if (response.status === 401 || data.errorCode === 'TOKEN_INVALID') {
        console.warn('Secure token geçersiz; JWT oturumu varsa site oturumu korunur.');
        clearSecureToken();
        if (typeof window !== 'undefined') {
          try {
            window.dispatchEvent(new CustomEvent('ilsa-secure-session-lost'));
          } catch {
            /* ignore */
          }
          const hasJwt = !!getStoredJwtAccessToken();
          if (!hasJwt) {
            window.location.href = '/';
          }
        }
      }

      // Hardware mismatch
      if (data.errorCode === 'HARDWARE_MISMATCH') {
        console.error('🚨 Farklı cihazdan erişim tespit edildi!');
        clearSecureToken();
        
        if (typeof window !== 'undefined') {
          alert('Güvenlik nedeniyle oturumunuz sonlandırıldı. Bu hesap başka bir cihazdan kullanılıyor olabilir.');
          window.location.href = '/';
        }
      }

      if (
        data.errorCode === 'DEVICE_SIGNATURE_REQUIRED' ||
        data.errorCode === 'DEVICE_SIGNATURE_INVALID' ||
        data.errorCode === 'DEVICE_KEY_REQUIRED' ||
        data.errorCode === 'DEVICE_SESSION_UPGRADE'
      ) {
        console.error('🚨 Cihaz imzası doğrulanamadı');
        clearSecureToken();
        if (typeof window !== 'undefined') {
          alert(
            'Bu oturum yalnızca kayıtlı bilgisayarınızdaki güncel masaüstü uygulaması ile kullanılabilir. Lütfen portable uygulamadan tekrar giriş yapın.',
          );
          window.location.href = '/';
        }
      }

      // Rate limit
      if (response.status === 429) {
        return {
          success: false,
          error: data.error || 'Çok fazla istek gönderdiniz. Lütfen bekleyiniz.',
          errorCode: 'RATE_LIMIT_EXCEEDED',
        };
      }

      return {
        success: false,
        error: data.error || 'Bir hata oluştu',
        errorCode: data.errorCode,
      };
    }

    return {
      success: true,
      data,
    };

  } catch (error: any) {
    console.error('🚨 Secure API call error:', error);
    return {
      success: false,
      error: error.message || 'Bağlantı hatası',
      errorCode: 'NETWORK_ERROR',
    };
  }
}

/**
 * 🚀 Electron App ile secure giriş
 */
export async function electronSecureSignIn(
  username: string,
  password: string,
  hardwareId: string,
  deviceInfo?: any
): Promise<{ success: boolean; user?: any; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/electron-signin-secure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
        hardwareId,
        deviceInfo,
      }),
    });

    const data = await readResponseJson<{
      error?: string;
      oneTimeToken?: string;
      user?: unknown;
    }>(response);

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Giriş başarısız',
      };
    }

    if (!data.oneTimeToken) {
      return {
        success: false,
        error: data.error || 'Sunucudan geçersiz yanıt',
      };
    }

    // Token'ı kaydet
    setSecureToken(data.oneTimeToken);
    setHardwareId(hardwareId);

    const refreshed = await refreshUserMembership();
    const user = refreshed ?? data.user;
    if (typeof window !== 'undefined' && user) {
      localStorage.setItem('user', JSON.stringify(user));
    }

    console.log('✅ Electron secure signin başarılı');

    return {
      success: true,
      user,
    };

  } catch (error: any) {
    console.error('🚨 Electron signin error:', error);
    return {
      success: false,
      error: error.message || 'Bağlantı hatası',
    };
  }
}

/**
 * 🔓 Secure oturumu sunucuda sonlandır (yerel temizlik yapmaz)
 */
export async function notifySecureLogout(): Promise<void> {
  if (!getSecureToken()) return;
  try {
    await secureApiCall('/logout-secure', { method: 'POST' });
  } catch (error) {
    console.error('Secure logout error:', error);
  }
}

/** Tüm oturumları sunucuda kapat */
export async function revokeAllSessions(): Promise<{ success: boolean; error?: string }> {
  const bearer = getBearerForApi(null);
  if (!bearer) return { success: false, error: 'Giriş gerekli' };
  try {
    const res = await fetch(`${API_BASE}/logout-all-sessions`, {
      method: 'POST',
      headers: buildOptionalAuthHeaders(null),
    });
    applyAccessTokenRotation(res);
    const data = await readResponseJson<{ error?: string; revokedCount?: number }>(res);
    if (!res.ok) {
      return { success: false, error: data.error || 'Oturumlar kapatılamadı' };
    }
    return { success: true };
  } catch {
    return { success: false, error: 'Bağlantı hatası' };
  }
}

/**
 * 🔓 Secure logout + ana sayfaya yönlendir
 */
export async function secureLogout(): Promise<void> {
  await notifySecureLogout();
  clearSecureToken();
  if (typeof window !== 'undefined') {
    localStorage.removeItem('user');
    window.location.href = '/';
  }
}

/**
 * 👤 Profil bilgilerini al
 */
export async function getSecureProfile() {
  return await secureApiCall('/profile-secure', {
    method: 'GET',
  });
}

/**
 * 📁 Kategorileri al
 */
export async function getCategories() {
  return await secureApiCall('/categories', {
    method: 'GET',
  });
}

/**
 * 📄 Dosyaları al
 */
export async function getFiles(filters?: {
  categoryId?: string;
  subcategoryId?: string;
  search?: string;
  type?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.categoryId) params.append('categoryId', filters.categoryId);
  if (filters?.subcategoryId) params.append('subcategoryId', filters.subcategoryId);
  if (filters?.search) params.append('search', filters.search);
  if (filters?.type) params.append('type', filters.type);

  const query = params.toString() ? `?${params.toString()}` : '';
  
  return await secureApiCall(`/files${query}`, {
    method: 'GET',
  });
}

/**
 * 📥 Dosya indir
 */
export async function downloadFile(fileId: string) {
  return await secureApiCall(`/files/${fileId}/download`, {
    method: 'POST',
  });
}

/**
 * 💎 Premium'a yükselt
 */
export async function upgradeToPremium(planType: 'monthly' | 'yearly') {
  return await secureApiCall('/upgrade-premium', {
    method: 'POST',
    body: JSON.stringify({ planType }),
  });
}

/**
 * 📊 Admin istatistikleri
 */
export async function getAdminStats() {
  return await secureApiCall('/admin/stats', {
    method: 'GET',
  });
}

/**
 * 🔐 Security events (Admin)
 */
export async function getSecurityEvents(limit?: number, severity?: string) {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit.toString());
  if (severity) params.append('severity', severity);

  const query = params.toString() ? `?${params.toString()}` : '';
  
  return await secureApiCall(`/security-events${query}`, {
    method: 'GET',
  });
}

/**
 * 🔍 Token durumunu kontrol et
 */
export function hasValidToken(): boolean {
  const token = getSecureToken();
  return !!token;
}

/**
 * 👤 Local user bilgilerini al
 */
export function getLocalUser(): any | null {
  if (typeof window === 'undefined') return null;
  
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

/**
 * 🔄 Token rotation test fonksiyonu (debugging için)
 */
export async function testTokenRotation() {
  console.log('🧪 Token rotation testi başlıyor...');
  
  const token1 = getSecureToken();
  console.log('1️⃣ İlk token:', token1?.substring(0, 20) + '...');
  
  // İlk request
  const result1 = await getSecureProfile();
  const token2 = getSecureToken();
  console.log('2️⃣ İkinci token (1. request sonrası):', token2?.substring(0, 20) + '...');
  console.log('Token değişti mi?', token1 !== token2 ? '✅ EVET' : '❌ HAYIR');
  
  // İkinci request
  const result2 = await getSecureProfile();
  const token3 = getSecureToken();
  console.log('3️⃣ Üçüncü token (2. request sonrası):', token3?.substring(0, 20) + '...');
  console.log('Token değişti mi?', token2 !== token3 ? '✅ EVET' : '❌ HAYIR');
  
  // Eski token ile deneme (başarısız olmalı)
  console.log('\n🧪 Eski token ile deneme yapılıyor...');
  setSecureToken(token1!);
  const result3 = await getSecureProfile();
  console.log('Eski token çalıştı mı?', result3.success ? '❌ ÇALIŞTI (HATA!)' : '✅ ÇALIŞMADI (DOĞRU)');
  
  // Token'ı geri yükle
  setSecureToken(token3!);
  
  console.log('\n✅ Token rotation testi tamamlandı!');
}
