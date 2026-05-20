/**
 * kategoriler.resim boşsa eski MySQL /img/marka yollarını (brand_marka_paths.json)
 * üzerinden kategori adı / slug ile eşleştirir.
 */

const pathsUrl = new URL('./brand_marka_paths.json', import.meta.url);

export type BrandMarkaPaths = {
  bySlug: Record<string, string>;
  byName: Record<string, string>;
};

let brandPathsCache: BrandMarkaPaths | null = null;

export async function getBrandMarkaPaths(): Promise<BrandMarkaPaths> {
  if (brandPathsCache) return brandPathsCache;
  const text = await Deno.readTextFile(pathsUrl);
  brandPathsCache = JSON.parse(text) as BrandMarkaPaths;
  return brandPathsCache;
}

function markaNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR');
}

/** Veritabanından gelen resim: tam URL, /img/... veya img/... */
export function normalizeStoredResim(resim: string | null | undefined): string {
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
