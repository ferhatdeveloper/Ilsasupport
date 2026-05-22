/**
 * PostgreSQL — kategoriler ve bilgi tabloları (doğrudan postgres.js)
 */

import { getSql } from './pg_client.ts';
import { getBrandMarkaPaths, resolveMarkaIconWithPaths } from './marka_icon_resolver.ts';
import * as gdrive from './google_drive_helper.tsx';
import { cacheGetJson, cacheSetJson } from './cache/index.ts';

const FILES_LIST_CACHE_SEC = Math.min(
  120,
  Math.max(10, parseInt(Deno.env.get('FILES_LIST_CACHE_SEC') || '30', 10) || 30),
);

const SEARCH_CACHE_SEC = Math.min(
  300,
  Math.max(30, parseInt(Deno.env.get('SEARCH_CACHE_SEC') || '90', 10) || 90),
);

const DEBUG_CACHE = (Deno.env.get('ILSA_DEBUG_CACHE') || '').trim() === '1';

function db() {
  return getSql();
}

/** MySQL LIKE uyumu: ILIKE içinde % ve _ anlamlarını kaçır */
export function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Türkçe aramalarda büyük/küçük + aksan farklarını sadeleştirir.
 * Örn: "REDMİ", "redmi", "REDMI" hepsi aynı anahtara iner.
 */
function normalizeSearchForDb(value: string): string {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/i̇/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function slugifyKategori(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** Kökten yaprağa kategori zinciri (kök = path[0]) */
async function fetchCategoryAncestorChain(
  s: any,
  leafId: number,
): Promise<Array<{ id: number; name: string }>> {
  const rev: Array<{ id: number; name: string }> = [];
  let cur: number | null = leafId;
  const seen = new Set<number>();
  while (cur != null && Number.isFinite(cur) && !seen.has(cur)) {
    seen.add(cur);
    const rows = await s`
      SELECT kategori_adi, ust_kategori_id FROM kategoriler WHERE id = ${cur} LIMIT 1
    `;
    const first = rows[0];
    if (!first) break;
    rev.push({
      id: Number(cur),
      name: String(first.kategori_adi || ''),
    });
    const ust = first.ust_kategori_id as number | string | null | undefined;
    cur = ust != null && ust !== '' ? Number(ust) : null;
  }
  return rev.reverse();
}

type KategoriNode = { id: number; name: string; parentId: number | null; resim: string | null };

let kategoriMapCache: { map: Map<number, KategoriNode>; at: number } | null = null;
const KATEGORI_MAP_TTL_MS = 5 * 60 * 1000;

async function getKategoriMap(s: ReturnType<typeof db>): Promise<Map<number, KategoriNode>> {
  if (kategoriMapCache && Date.now() - kategoriMapCache.at < KATEGORI_MAP_TTL_MS) {
    return kategoriMapCache.map;
  }
  const rows = await s`SELECT id, kategori_adi, ust_kategori_id, resim FROM kategoriler`;
  const map = new Map<number, KategoriNode>();
  for (const r of rows || []) {
    const id = Number(r.id);
    const ust = r.ust_kategori_id as number | string | null | undefined;
    map.set(id, {
      id,
      name: String(r.kategori_adi || ''),
      parentId: ust != null && ust !== '' ? Number(ust) : null,
      resim: r.resim ?? null,
    });
  }
  kategoriMapCache = { map, at: Date.now() };
  return map;
}

function ancestorChainFromMap(
  map: Map<number, KategoriNode>,
  leafId: number,
): Array<{ id: number; name: string }> {
  const rev: Array<{ id: number; name: string }> = [];
  let cur: number | null = leafId;
  const seen = new Set<number>();
  while (cur != null && Number.isFinite(cur) && !seen.has(cur)) {
    seen.add(cur);
    const node = map.get(cur);
    if (!node) break;
    rev.push({ id: node.id, name: node.name });
    cur = node.parentId;
  }
  return rev.reverse();
}

/** React marka / kategori / alt kategori seçimine çevir (3 seviye; derin ağaçta yaprak yaklaşımı) */
export function navigationHintsFromPathIds(pathIds: number[]): {
  brandId: string;
  categoryId: string | null;
  subcategoryId: string | null;
} {
  if (!pathIds.length) return { brandId: '', categoryId: null, subcategoryId: null };
  if (pathIds.length === 1) {
    return { brandId: String(pathIds[0]), categoryId: null, subcategoryId: null };
  }
  if (pathIds.length === 2) {
    return { brandId: String(pathIds[0]), categoryId: String(pathIds[1]), subcategoryId: null };
  }
  return {
    brandId: String(pathIds[0]),
    categoryId: String(pathIds[pathIds.length - 2]),
    subcategoryId: String(pathIds[pathIds.length - 1]),
  };
}

const cache: { [key: string]: { data: any; timestamp: number } } = {};
const CACHE_TTL = 60 * 1000;

function getCached(key: string): any | null {
  const cached = cache[key];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    if (DEBUG_CACHE) console.log(`✅ Cache HIT: ${key}`);
    return cached.data;
  }
  if (DEBUG_CACHE) console.log(`❌ Cache MISS: ${key}`);
  return null;
}

function setCache(key: string, data: any): void {
  cache[key] = { data, timestamp: Date.now() };
}

export function clearPgHelpersCache(): void {
  for (const k of Object.keys(cache)) delete cache[k];
  kategoriMapCache = null;
}

export async function getBrandsFromDB(): Promise<any[]> {
  try {
    const cacheKey = 'brands:all';
    const cached = getCached(cacheKey);
    if (cached) return cached;

    console.log('🏢 Fetching brands from PostgreSQL...');
    const s = db();
    const data = await s`
      SELECT id, kategori_adi, aciklama, sira, resim, slug
      FROM kategoriler
      WHERE ust_kategori_id IS NULL
        AND durum = 'active'
        AND kategori_adi NOT LIKE '(ORT)%'
      ORDER BY kategori_adi ASC
    `;

    const paths = await getBrandMarkaPaths();
    const brands = (data || []).map((b: any) => {
      const iconUrl = resolveMarkaIconWithPaths(b.kategori_adi, b.resim, paths);
      return {
        id: b.id.toString(),
        name: b.kategori_adi,
        slug:
          b.slug && String(b.slug).trim() !== ''
            ? String(b.slug)
            : slugifyKategori(b.kategori_adi),
        icon: iconUrl || '📱',
        description: b.aciklama || '',
      };
    });

    setCache(cacheKey, brands);
    return brands;
  } catch (error) {
    console.error('❌ getBrandsFromDB error:', error);
    return [];
  }
}

/**
 * Eski PHP Home::Soft: whereAltkatAnd(markaId) + whereAlkat2('0')
 * → ust_kategori_id = marka ve legacy_alkat2 boş / 0 (MySQL alkat2≈0)
 */
export async function getCategoriesFromDB(brandId?: string): Promise<any[]> {
  try {
    const cacheKey = `categories:brandId=${brandId}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    if (!brandId) {
      console.warn('⚠️ No brandId provided');
      return [];
    }

    console.log('📂 Fetching categories from PostgreSQL... brandId:', brandId);
    const s = db();
    const bid = parseInt(brandId, 10);
    const data = await s`
      SELECT id, kategori_adi, aciklama, sira, ust_kategori_id, resim, slug, legacy_alkat2
      FROM kategoriler
      WHERE ust_kategori_id = ${bid}
        AND durum = 'active'
        AND (
          legacy_alkat2 IS NULL
          OR BTRIM(legacy_alkat2::text) = ''
          OR legacy_alkat2::text IN ('0', '00')
        )
      ORDER BY kategori_adi ASC
    `;

    const paths = await getBrandMarkaPaths();
    const categories = (data || []).map((c: any) => ({
      id: c.id.toString(),
      name: c.kategori_adi,
      slug:
        c.slug && String(c.slug).trim() !== ''
          ? String(c.slug)
          : slugifyKategori(c.kategori_adi),
      icon: resolveMarkaIconWithPaths(c.kategori_adi, c.resim, paths) || '📁',
      description: c.aciklama || '',
      brandId: brandId,
    }));

    setCache(cacheKey, categories);
    return categories;
  } catch (error) {
    console.error('❌ getCategoriesFromDB error:', error);
    return [];
  }
}

/**
 * Eski PHP Home::alt: whereAlkat2And(ustKlasorId)
 * Öncelik: legacy_alkat2 = categoryId; legacy yoksa ust_kategori_id (yalnızca yeni admin kayıtları)
 */
export async function getSubcategoriesFromDB(categoryId?: string): Promise<any[]> {
  try {
    const cacheKey = `subcategories:categoryId=${categoryId}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    if (!categoryId) {
      console.warn('⚠️ No categoryId provided');
      return [];
    }

    console.log('📁 Fetching subcategories from PostgreSQL... categoryId:', categoryId);
    const s = db();
    const cid = parseInt(categoryId, 10);
    const sid = String(categoryId);
    const data = await s`
      SELECT id, kategori_adi, aciklama, sira, ust_kategori_id, resim, slug, legacy_alkat2
      FROM kategoriler
      WHERE durum = 'active'
        AND (
          (
            legacy_alkat2 IS NOT NULL
            AND BTRIM(legacy_alkat2::text) <> ''
            AND legacy_alkat2::text NOT IN ('0', '00')
            AND legacy_alkat2::text = ${sid}
          )
          OR (
            legacy_alkat2 IS NULL
            AND ust_kategori_id = ${cid}
          )
        )
      ORDER BY kategori_adi ASC
    `;

    const paths = await getBrandMarkaPaths();
    const subcategories = (data || []).map((srow: any) => ({
      id: srow.id.toString(),
      name: srow.kategori_adi,
      slug:
        srow.slug && String(srow.slug).trim() !== ''
          ? String(srow.slug)
          : slugifyKategori(srow.kategori_adi),
      icon: resolveMarkaIconWithPaths(srow.kategori_adi, srow.resim, paths) || '📄',
      description: srow.aciklama || '',
      categoryId: categoryId,
    }));

    setCache(cacheKey, subcategories);
    return subcategories;
  } catch (error) {
    console.error('❌ getSubcategoriesFromDB error:', error);
    return [];
  }
}

/** Dosya listesi / sayım için ortak WHERE (bilgi) */
export type BilgiFilterInput = {
  brandId?: string;
  categoryId?: string;
  subcategoryId?: string;
  searchTerm?: string;
};

function filesListCacheKey(
  kind: 'count' | 'list',
  filters?: BilgiFilterInput & { userRole?: string; resultLimit?: number; offset?: number },
): string {
  const f = {
    kind,
    brandId: filters?.brandId ?? '',
    categoryId: filters?.categoryId ?? '',
    subcategoryId: filters?.subcategoryId ?? '',
    searchTerm: (filters?.searchTerm || '').trim().slice(0, 80),
    userRole: filters?.userRole ?? '',
    limit: filters?.resultLimit ?? 100,
    offset: filters?.offset ?? 0,
  };
  return `files:v2:${JSON.stringify(f)}`;
}

function buildBilgiWhere(s: ReturnType<typeof db>, filters?: BilgiFilterInput) {
  let conditions = s`TRUE`;
  if (filters?.subcategoryId) {
    conditions = s`${conditions} AND altkat = ${String(filters.subcategoryId)}`;
  } else if (filters?.categoryId) {
    conditions = s`${conditions} AND altkat = ${String(filters.categoryId)}`;
  } else if (filters?.brandId) {
    conditions = s`${conditions} AND katid = ${String(filters.brandId)}`;
  }
  if (filters?.searchTerm && String(filters.searchTerm).trim() !== '') {
    const esc = escapeIlikePattern(normalizeSearchForDb(String(filters.searchTerm)));
    const pat = `%${esc}%`;
    conditions = s`${conditions} AND (
      REPLACE(LOWER(TRANSLATE(COALESCE(adi, ''), 'İIıŞşĞğÜüÖöÇç', 'iiisSGgUuOoCc')), 'i̇', 'i') LIKE ${pat} ESCAPE '\\'
      OR REPLACE(LOWER(TRANSLATE(COALESCE(bildiri, ''), 'İIıŞşĞğÜüÖöÇç', 'iiisSGgUuOoCc')), 'i̇', 'i') LIKE ${pat} ESCAPE '\\'
      OR REPLACE(LOWER(TRANSLATE(COALESCE(asama, ''), 'İIıŞşĞğÜüÖöÇç', 'iiisSGgUuOoCc')), 'i̇', 'i') LIKE ${pat} ESCAPE '\\'
    )`;
  }
  return conditions;
}

export async function countFilesFromDB(filters?: BilgiFilterInput): Promise<number> {
  const cacheKey = filesListCacheKey('count', filters);
  const cached = await cacheGetJson<number>(cacheKey);
  if (cached != null && Number.isFinite(cached)) return cached;

  const s = db();
  const conditions = buildBilgiWhere(s, filters);
  const rows = await s`SELECT COUNT(*)::bigint AS c FROM bilgi WHERE ${conditions}`;
  const count = Number(rows[0]?.c ?? 0);
  await cacheSetJson(cacheKey, count, FILES_LIST_CACHE_SEC);
  return count;
}

/** Sayfa başına en fazla 100 satır; offset ile sayfalama */
export const FILES_PAGE_SIZE = 100;

export async function getFilesFromDB(filters?: BilgiFilterInput & {
  userRole?: string;
  resultLimit?: number;
  offset?: number;
}): Promise<any[]> {
  const cacheKey = filesListCacheKey('list', filters);
  const cached = await cacheGetJson<any[]>(cacheKey);
  if (cached) return cached;

  const s = db();

  const conditions = buildBilgiWhere(s, filters);

  const pageSize = Math.min(FILES_PAGE_SIZE, Math.max(1, Number(filters?.resultLimit) || FILES_PAGE_SIZE));
  const offset = Math.max(0, Number(filters?.offset) || 0);

  const data = await s`
    SELECT
      id, katid, altkat, adi, boyut, link, link2, link3, tarih, hit, down,
      asama, bildiri, renkodu
    FROM bilgi
    WHERE ${conditions}
    ORDER BY id DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;

  const paths = await getBrandMarkaPaths();

  /** PHP ara.wizard / Bilgiler: logo = kategoriler satırı where id = bilgi.katid */
  const katIdNums = [
    ...new Set(
      (data || [])
        .map((f: any) => {
          const n = Number(f.katid);
          return Number.isFinite(n) ? n : null;
        })
        .filter((x: number | null): x is number => x !== null),
    ),
  ];
  const katById = new Map<number, { kategori_adi: string; resim: string | null }>();
  if (katIdNums.length > 0) {
    const katRows = await s`
      SELECT id, kategori_adi, resim FROM kategoriler
      WHERE id IN ${s(katIdNums)}
    `;
    for (const row of katRows || []) {
      katById.set(Number(row.id), {
        kategori_adi: row.kategori_adi,
        resim: row.resim ?? null,
      });
    }
  }

  const categoryIds = [
    ...new Set(
      (data || [])
        .map((f: any) => {
          const v = f.altkat;
          if (v === null || v === undefined || v === '') return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        })
        .filter((x: number | null): x is number => x !== null),
    ),
  ];

  const categoryMap: Record<number, string> = {};
  const categoryInfoMap: Record<number, { id: number; name: string; parentId: number | null; image: string | null }> = {};
  if (categoryIds.length > 0) {
    const categories = await s`
      SELECT id, kategori_adi, ust_kategori_id, resim FROM kategoriler
      WHERE id IN ${s(categoryIds)}
    `;
    (categories || []).forEach((cat: any) => {
      categoryMap[cat.id] = cat.kategori_adi;
      categoryInfoMap[cat.id] = {
        id: Number(cat.id),
        name: cat.kategori_adi,
        parentId: cat.ust_kategori_id != null ? Number(cat.ust_kategori_id) : null,
        image: cat.resim ?? null,
      };
    });
  }

  const brandIds = [
    ...new Set(
      Object.values(categoryInfoMap).map((cat) => (cat.parentId != null ? cat.parentId : cat.id)),
    ),
  ];
  const brandInfoMap: Record<number, { id: number; name: string; icon: string }> = {};
  if (brandIds.length > 0) {
    const brandRows = await s`
      SELECT id, kategori_adi, resim FROM kategoriler
      WHERE id IN ${s(brandIds)}
    `;
    (brandRows || []).forEach((brand: any) => {
      brandInfoMap[Number(brand.id)] = {
        id: Number(brand.id),
        name: brand.kategori_adi,
        icon: resolveMarkaIconWithPaths(brand.kategori_adi, brand.resim, paths) || '',
      };
    });
  }

  const mapped = (data || [])
    .map((f: any) => {
      const isPremium = f.asama && String(f.asama).trim() !== '';
      const rawLink = f.link != null ? String(f.link) : '';
      const googleDriveLink = gdrive.normalizeDriveUrlToUsercontent(rawLink);
      const driveId = rawLink ? gdrive.extractFileIdFromDriveUrl(rawLink) : null;
      const driveWebViewUrl =
        driveId != null
          ? `https://drive.google.com/file/d/${driveId}/view`
          : undefined;
      const categoryInfo = categoryInfoMap[Number(f.altkat)];
      const resolvedBrandId = categoryInfo
        ? (categoryInfo.parentId != null ? categoryInfo.parentId : categoryInfo.id)
        : null;
      const resolvedBrand = resolvedBrandId != null ? brandInfoMap[resolvedBrandId] : null;

      const katKey = Number(f.katid);
      const katMeta = Number.isFinite(katKey) ? katById.get(katKey) : undefined;
      const iconFromKatid = katMeta
        ? resolveMarkaIconWithPaths(katMeta.kategori_adi, katMeta.resim, paths)
        : '';

      // Legacy JSON/PHP uyumu: "Bilgi" metni boyut alanında tutuluyor.
      const infoText =
        (f.boyut && String(f.boyut).trim()) ||
        (f.asama && String(f.asama).trim()) ||
        (f.bildiri && String(f.bildiri).trim()) ||
        '';

      return {
        id: f.id.toString(),
        name: f.adi,
        size: f.boyut,
        driveFileId: driveId,
        googleDriveLink,
        driveWebViewUrl,
        alternativeLink: f.link2 != null && String(f.link2).trim() !== ''
          ? gdrive.normalizeDriveUrlToUsercontent(String(f.link2))
          : f.link2,
        freeLink: f.link3 != null && String(f.link3).trim() !== ''
          ? gdrive.normalizeDriveUrlToUsercontent(String(f.link3))
          : f.link3,
        date: f.tarih,
        uploadDate: f.tarih,
        createdAt: f.tarih,
        downloadCount: f.down || 0,
        downloads: f.down || 0,
        views: f.hit || 0,
        isPremium: isPremium,
        brandId: f.katid?.toString(),
        brandResolvedId: resolvedBrandId != null ? String(resolvedBrandId) : null,
        brandName: katMeta?.kategori_adi || resolvedBrand?.name || null,
        brandIcon: iconFromKatid || resolvedBrand?.icon || '',
        categoryId: f.altkat?.toString(),
        categoryName: categoryMap[Number(f.altkat)] || 'Uncategorized',
        categoryIcon: '📦',
        version: f.asama || '1.0',
        description: infoText,
        status: f.asama,
        notification: f.bildiri,
        colorCode: f.renkodu || '#008000',
      };
    }) as any[];

  const result = mapped;
  await cacheSetJson(cacheKey, result, FILES_LIST_CACHE_SEC);
  return result;
}

/**
 * Eski PHP ara.wizard: kategoriler whereEndlike('adi', ara), bilgi whereLike('adi', ara) + orderByIdDesc
 */
export async function legacyAraSearch(
  qRaw: string,
  userRole?: string,
  opts?: { page?: number; pageSize?: number },
): Promise<{ folders: any[]; files: any[]; filesTotal: number }> {
  const q = (qRaw || '').trim();
  if (!q) return { folders: [], files: [], filesTotal: 0 };

  const pageSize = Math.min(FILES_PAGE_SIZE, Math.max(1, opts?.pageSize ?? FILES_PAGE_SIZE));
  const page = Math.max(1, opts?.page ?? 1);
  const searchCacheKey = `search:v2:${normalizeSearchForDb(q)}:${page}:${pageSize}:${userRole ?? ''}`;
  const cachedSearch = await cacheGetJson<{ folders: any[]; files: any[]; filesTotal: number }>(
    searchCacheKey,
  );
  if (cachedSearch) return cachedSearch;

  try {
    const s = db();
    const esc = escapeIlikePattern(normalizeSearchForDb(q));
    const endPat = `%${esc}`;
    const containsPat = `%${esc}%`;

    const folderRows = await s`
      SELECT id, kategori_adi, aciklama, resim, ust_kategori_id, slug, legacy_altkat, legacy_alkat2
      FROM kategoriler
      WHERE durum = 'active'
        AND (
          REPLACE(LOWER(TRANSLATE(COALESCE(kategori_adi, ''), 'İIıŞşĞğÜüÖöÇç', 'iiisSGgUuOoCc')), 'i̇', 'i') LIKE ${endPat} ESCAPE '\\'
          OR REPLACE(LOWER(TRANSLATE(COALESCE(kategori_adi, ''), 'İIıŞşĞğÜüÖöÇç', 'iiisSGgUuOoCc')), 'i̇', 'i') LIKE ${containsPat} ESCAPE '\\'
        )
      ORDER BY kategori_adi ASC
      LIMIT 100
    `;

    const kategoriMap = await getKategoriMap(s);
    const paths = await getBrandMarkaPaths();
    const folders: any[] = [];
    const rootBrandById = new Map<number, { kategori_adi: string; resim: string | null } | null>();
    for (const fr of folderRows || []) {
      const path = ancestorChainFromMap(kategoriMap, Number(fr.id));
      const pathIds = path.map((p) => p.id);
      const nav = navigationHintsFromPathIds(pathIds);
      const rootId = pathIds.length ? Number(pathIds[0]) : NaN;
      let rootRow: { kategori_adi: string; resim: string | null } | null = null;
      if (Number.isFinite(rootId)) {
        if (!rootBrandById.has(rootId)) {
          const node = kategoriMap.get(rootId);
          rootBrandById.set(
            rootId,
            node ? { kategori_adi: node.name, resim: node.resim } : null,
          );
        }
        rootRow = rootBrandById.get(rootId) ?? null;
      }
      const selfIcon = resolveMarkaIconWithPaths(fr.kategori_adi, fr.resim, paths);
      const rootIcon = rootRow
        ? resolveMarkaIconWithPaths(rootRow.kategori_adi, rootRow.resim, paths)
        : '';
      const icon = selfIcon || rootIcon || '📁';
      folders.push({
        id: String(fr.id),
        name: fr.kategori_adi,
        slug:
          fr.slug && String(fr.slug).trim() !== ''
            ? String(fr.slug)
            : slugifyKategori(fr.kategori_adi),
        description: fr.aciklama || '',
        icon,
        legacyAltkat: fr.legacy_altkat != null ? String(fr.legacy_altkat) : null,
        legacyAlkat2: fr.legacy_alkat2 != null ? String(fr.legacy_alkat2) : null,
        brandId: nav.brandId || null,
        categoryId: nav.categoryId,
        subcategoryId: nav.subcategoryId,
        path: path.map((p) => ({
          id: String(p.id),
          name: p.name,
        })),
      });
    }

    const offset = (page - 1) * pageSize;

    const fileFilters: BilgiFilterInput = { searchTerm: q };
    const filesTotal = await countFilesFromDB(fileFilters);
    const files = await getFilesFromDB({
      ...fileFilters,
      userRole,
      resultLimit: pageSize,
      offset,
    });

    const result = { folders, files, filesTotal };
    await cacheSetJson(searchCacheKey, result, SEARCH_CACHE_SEC);
    return result;
  } catch (error) {
    console.error('❌ legacyAraSearch error:', error);
    return { folders: [], files: [], filesTotal: 0 };
  }
}

export async function getCategoryById(categoryId: string): Promise<any | null> {
  try {
    const s = db();
    const cid = parseInt(categoryId, 10);
    const rows = await s`
      SELECT id, kategori_adi, aciklama, ust_kategori_id
      FROM kategoriler WHERE id = ${cid} LIMIT 1
    `;
    const data = rows[0];
    if (!data) return null;
    return {
      id: data.id.toString(),
      name: data.kategori_adi,
      description: data.aciklama,
      parentId: data.ust_kategori_id?.toString(),
    };
  } catch (error) {
    console.error('❌ getCategoryById error:', error);
    return null;
  }
}

export async function getFileById(fileId: string): Promise<any | null> {
  try {
    const s = db();
    const fid = parseInt(fileId, 10);
    const rows = await s`SELECT * FROM bilgi WHERE id = ${fid} LIMIT 1`;
    const data = rows[0];
    if (!data) return null;

    const rawLink = data.link != null ? String(data.link) : '';
    const driveId = rawLink ? gdrive.extractFileIdFromDriveUrl(rawLink) : null;

    return {
      id: data.id.toString(),
      name: data.adi,
      size: data.boyut,
      driveFileId: driveId,
      googleDriveLink: gdrive.normalizeDriveUrlToUsercontent(rawLink),
      driveWebViewUrl:
        driveId != null ? `https://drive.google.com/file/d/${driveId}/view` : undefined,
      alternativeLink:
        data.link2 != null && String(data.link2).trim() !== ''
          ? gdrive.normalizeDriveUrlToUsercontent(String(data.link2))
          : data.link2,
      freeLink:
        data.link3 != null && String(data.link3).trim() !== ''
          ? gdrive.normalizeDriveUrlToUsercontent(String(data.link3))
          : data.link3,
      uploadDate: data.tarih,
      downloads: data.down || 0,
      views: data.hit || 0,
      isPremium: data.asama && String(data.asama).trim() !== '',
      brandId: data.katid?.toString(),
      categoryId: data.altkat?.toString(),
      status: data.asama,
      notification: data.bildiri,
      colorCode: data.renkodu || '#008000',
    };
  } catch (error) {
    console.error('❌ getFileById error:', error);
    return null;
  }
}

export async function incrementFileViews(fileId: string): Promise<boolean> {
  try {
    const s = db();
    const fid = parseInt(fileId, 10);
    try {
      await s`SELECT increment_file_hit(${fid})`;
    } catch {
      await s`UPDATE bilgi SET hit = COALESCE(hit, 0) + 1 WHERE id = ${fid}`;
    }
    return true;
  } catch (error) {
    console.error('❌ incrementFileViews error:', error);
    return false;
  }
}

export async function incrementFileDownloads(fileId: string): Promise<boolean> {
  try {
    const s = db();
    const fid = parseInt(fileId, 10);
    try {
      await s`SELECT increment_file_down(${fid})`;
    } catch {
      await s`UPDATE bilgi SET down = COALESCE(down, 0) + 1 WHERE id = ${fid}`;
    }
    return true;
  } catch (error) {
    console.error('❌ incrementFileDownloads error:', error);
    return false;
  }
}
