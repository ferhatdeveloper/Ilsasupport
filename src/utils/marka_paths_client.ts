/** Tarayıcı: /brand_marka_paths.json + sunucudaki marka_icon_resolver ile aynı mantık */

export type BrandMarkaPaths = {
  bySlug: Record<string, string>;
  byName: Record<string, string>;
};

let pathsCache: BrandMarkaPaths | null = null;
let inflight: Promise<BrandMarkaPaths | null> | null = null;

export async function fetchBrandMarkaPaths(): Promise<BrandMarkaPaths | null> {
  if (pathsCache) return pathsCache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('/brand_marka_paths.json');
      if (!res.ok) return null;
      pathsCache = (await res.json()) as BrandMarkaPaths;
      return pathsCache;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function markaNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR');
}

function normalizeStoredResim(resim: string | null | undefined): string {
  if (resim == null) return '';
  const t = String(resim).trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) {
    try {
      const pathname = new URL(t).pathname;
      if (pathname.includes('/img/marka/')) {
        return pathname.startsWith('/') ? pathname : `/${pathname}`;
      }
    } catch {
      /* ignore */
    }
    return '';
  }
  if (t.startsWith('/img/marka/')) return t;
  if (t.startsWith('img/marka/')) return `/${t}`;
  return '';
}

function computeSlugForMap(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export function resolveMarkaIconWithPaths(
  kategori_adi: string,
  resim: string | null | undefined,
  paths: BrandMarkaPaths,
): string {
  const fromDb = normalizeStoredResim(resim);
  if (fromDb) return fromDb;

  const name = kategori_adi || '';
  const nameKey = markaNameKey(name);
  if (paths.byName[nameKey]) return paths.byName[nameKey];

  const slug = computeSlugForMap(name);
  if (slug && paths.bySlug[slug]) return paths.bySlug[slug];

  const asciiKey = name.trim().replace(/\s+/g, ' ').toUpperCase();
  if (paths.byName[asciiKey]) return paths.byName[asciiKey];

  return '';
}

/** API'den gelen icon alanı resim yolu değilse isimden /img/marka yolu üret */
export function resolveBrandIconForGrid(
  name: string,
  iconFromApi: string | null | undefined,
  paths: BrandMarkaPaths | null,
): string {
  const icon = String(iconFromApi ?? '').trim();
  if (looksLikeMarkaImageSrc(icon)) return icon;
  if (!paths) return icon;
  const resolved = resolveMarkaIconWithPaths(name, null, paths);
  return resolved || icon;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveFromKnownBrandInText(text: string, paths: BrandMarkaPaths): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return '';

  const keys = Object.keys(paths.byName).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const pattern = new RegExp(`(^|\\s)${escapeRegExp(key)}(\\s|$)`, 'i');
    if (pattern.test(normalized)) {
      return paths.byName[key];
    }
  }

  return '';
}

/** Dizin/kategori isimlerinden marka logosunu daha agresif çözer. */
export function resolveDirectoryIconForGrid(
  directoryName: string,
  iconFromApi: string | null | undefined,
  paths: BrandMarkaPaths | null,
  contextBrandName?: string | null,
): string {
  const icon = String(iconFromApi ?? '').trim();
  if (looksLikeMarkaImageSrc(icon)) return icon;
  if (!paths) return icon;

  if (contextBrandName) {
    const fromContext = resolveMarkaIconWithPaths(contextBrandName, null, paths);
    if (fromContext) return fromContext;
  }

  const direct = resolveMarkaIconWithPaths(directoryName, null, paths);
  if (direct) return direct;

  const fromText = resolveFromKnownBrandInText(directoryName, paths);
  if (fromText) return fromText;

  return icon;
}

function looksLikeMarkaImageSrc(s: string): boolean {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t) || t.startsWith('//')) return true;
  if (!t.startsWith('/')) return false;
  if (/\/img\//i.test(t)) return true;
  return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(t);
}
