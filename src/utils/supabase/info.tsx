/**
 * Yerel/özel API tabanı.
 * - Geliştirme + tarayıcı localhost dışındaysa: daima göreli /make-server-* (Vite proxy);
 *   böylece .env’deki localhost / yanlış sabit IP istemci PC’ye gitmez.
 * - Üretim: VITE_API_BASE_URL doluysa kullanılır; localhost hedefi uzak sayfada ise origin’e düşülür.
 */
function urlHostIsLoopback(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  } catch {
    return false;
  }
}

function computeApiRoots(): { apiBaseUrl: string; apiFunctionsBase: string } {
  const raw = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '');
  const isDev = !!import.meta.env.DEV;
  const pageOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin.replace(/\/$/, '')
      : '';
  const pageHost =
    typeof window !== 'undefined' && window.location?.hostname
      ? window.location.hostname.toLowerCase()
      : '';
  const remoteBrowser =
    !!pageHost && pageHost !== 'localhost' && pageHost !== '127.0.0.1';

  // Geliştirme: sayfa başka makineden IP ile açıldıysa yalnızca aynı kök + Vite proxy
  if (isDev && remoteBrowser) {
    return { apiBaseUrl: '', apiFunctionsBase: '/make-server-47081311' };
  }

  // Üretim (veya dev localhost): env’deki API kökü loopback ise uzak tarayıcıda istemci localhost’una gider
  if (remoteBrowser && raw && urlHostIsLoopback(raw) && pageOrigin && /^https?:\/\//i.test(pageOrigin)) {
    return {
      apiBaseUrl: pageOrigin,
      apiFunctionsBase: `${pageOrigin}/make-server-47081311`,
    };
  }

  const isLocalApi =
    !raw ||
    raw === 'http://localhost:8787' ||
    raw === 'http://127.0.0.1:8787';

  if (isDev && isLocalApi) {
    return { apiBaseUrl: '', apiFunctionsBase: '/make-server-47081311' };
  }

  if (raw) {
    return {
      apiBaseUrl: raw,
      apiFunctionsBase: `${raw}/make-server-47081311`,
    };
  }

  if (pageOrigin && /^https?:\/\//i.test(pageOrigin)) {
    return {
      apiBaseUrl: pageOrigin,
      apiFunctionsBase: `${pageOrigin}/make-server-47081311`,
    };
  }

  const fb = 'http://localhost:8787';
  return {
    apiBaseUrl: fb,
    apiFunctionsBase: `${fb}/make-server-47081311`,
  };
}

const roots = computeApiRoots();
export const apiBaseUrl = roots.apiBaseUrl;
/** Tüm make-server-47081311 uç noktaları için kök */
export const apiFunctionsBase = roots.apiFunctionsBase;

/**
 * CMS slayt / bilgi görselleri: DB’de `/img/slayt/...` veya eski `/make-server-47081311/cms/image/...`.
 * API farklı kökteyse eski yolu tam URL’ye çevirir; statik `/img/...` olduğu gibi kalır.
 */
export function resolveCmsPublicAssetUrl(stored: string): string {
  const u = (stored || '').trim();
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('/img/')) return u;
  if (u.startsWith('/make-server-47081311/')) {
    const base = apiFunctionsBase.replace(/\/make-server-47081311\/?$/, '');
    return base ? `${base}${u}` : u;
  }
  return u;
}

/** Eski import uyumluluğu — artık kullanılmaz */
export const projectId = '';
/** Genel (anon) çağrılarda isteğe bağlı; boş bırakılabilir */
export const publicAnonKey = '';
