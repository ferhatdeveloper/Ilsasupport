/**
 * JSON → PostgreSQL Migration Script (doğrudan postgres.js)
 */

import { getSql } from './pg_client.ts';

async function readJSONFile(fileName: string): Promise<any> {
  try {
    const base = Deno.env.get('JSON_STORAGE_DIR') ?? './storage/json-files';
    const path = `${base.replace(/\/$/, '')}/${fileName}`;
    const content = await Deno.readTextFile(path);
    const jsonData = JSON.parse(content);

    if (Array.isArray(jsonData) && jsonData.length > 0) {
      // phpMyAdmin JSON export: header/database/table blokları gelebilir.
      const tableBlock = jsonData.find(
        (x: any) => x && x.type === 'table' && Array.isArray(x.data),
      );
      if (tableBlock) {
        console.log(`✅ ${fileName} okundu: ${tableBlock.data.length} kayıt`);
        return tableBlock.data;
      }
    }

    if (Array.isArray(jsonData)) {
      console.log(`✅ ${fileName} okundu: ${jsonData.length} kayıt`);
      return jsonData;
    }

    return [];
  } catch (error) {
    console.error(`❌ readJSONFile hatası (${fileName}):`, error);
    return [];
  }
}

export type MigrateCounts = { successCount: number; errorCount: number; total: number };

function coalesceFirst<T = unknown>(...values: T[]): T | undefined {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
}

function toIntOrNull(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

type KategoriRecord = {
  id: number;
  kategori_adi: string;
  ust_kategori_id: number | null;
  aciklama: string;
  resim: string | null;
  sira: number;
  durum: string;
  eklenme_tarihi: string;
  legacy_altkat: string | null;
  legacy_alkat2: string | null;
  slug: string | null;
};

function buildKategoriRecordsFromJsonRows(kategoriler: any[]): {
  ordered: KategoriRecord[];
  placeholderCount: number;
} {
  const byId = new Map<number, KategoriRecord>();

  for (const k of kategoriler) {
    const id = toIntOrNull(k?.id);
    if (id == null) continue;

    const alkat2Num = Number(k.alkat2);
    let ust: number | null = null;
    if (Number.isFinite(alkat2Num) && alkat2Num > 0) {
      ust = alkat2Num;
    } else if (k.altkat !== '0' && k.altkat !== 0 && k.altkat != null && String(k.altkat).trim() !== '') {
      const p = parseInt(String(k.altkat), 10);
      ust = Number.isFinite(p) ? p : null;
    }

    byId.set(id, {
      id,
      kategori_adi: k.adi || k.kategori_adi || 'Bilinmeyen',
      ust_kategori_id: ust,
      aciklama: k.aciklama || '',
      resim: k.resim || null,
      sira: typeof k.sira === 'number' ? k.sira : toIntOrNull(k.sira) ?? 0,
      durum: 'active',
      eklenme_tarihi: k.tarih || new Date().toISOString(),
      legacy_altkat: k.altkat != null && String(k.altkat).trim() !== '' ? String(k.altkat) : null,
      legacy_alkat2: k.alkat2 != null && String(k.alkat2).trim() !== '' ? String(k.alkat2) : null,
      slug: k.slug != null && String(k.slug).trim() !== '' ? String(k.slug) : null,
    });
  }

  let placeholderCount = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of byId.values()) {
      const p = r.ust_kategori_id;
      if (p != null && !byId.has(p)) {
        byId.set(p, {
          id: p,
          kategori_adi: `(ORT) üst kategori dump'ta yok (id=${p})`,
          ust_kategori_id: null,
          aciklama: 'JSON dump eksik: ust_kategori_id hedefi bulunamadı; FK için sentezlendi.',
          resim: null,
          sira: 0,
          durum: 'active',
          eklenme_tarihi: new Date().toISOString(),
          legacy_altkat: null,
          legacy_alkat2: null,
          slug: `missing-parent-${p}`,
        });
        placeholderCount++;
        changed = true;
      }
    }
  }

  const nodes = [...byId.values()];
  const indeg = new Map<number, number>();
  const adj = new Map<number, number[]>();

  for (const n of nodes) {
    indeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const n of nodes) {
    const p = n.ust_kategori_id;
    if (p != null && byId.has(p)) {
      indeg.set(n.id, (indeg.get(n.id) ?? 0) + 1);
      adj.get(p)!.push(n.id);
    }
  }

  const q: number[] = [];
  for (const n of nodes) {
    if ((indeg.get(n.id) ?? 0) === 0) q.push(n.id);
  }
  q.sort((a, b) => a - b);

  const orderedIds: number[] = [];
  while (q.length) {
    const u = q.shift()!;
    orderedIds.push(u);
    for (const v of adj.get(u) ?? []) {
      const nv = (indeg.get(v) ?? 0) - 1;
      indeg.set(v, nv);
      if (nv === 0) {
        q.push(v);
        q.sort((a, b) => a - b);
      }
    }
  }

  if (orderedIds.length !== nodes.length) {
    console.warn(
      '⚠️ Kategori ağacında döngü veya sıralanamayan kenar var; kalan düğümler id sırasıyla ekleniyor.',
    );
    const rest = nodes.map((n) => n.id).filter((id) => !orderedIds.includes(id)).sort((a, b) => a - b);
    orderedIds.push(...rest);
  }

  const ordered = orderedIds.map((id) => byId.get(id)!);
  return { ordered, placeholderCount };
}

async function migrateKategoriler(): Promise<MigrateCounts> {
  console.log('\n========================================');
  console.log('📦 KATEGORİLER MİGRATION BAŞLIYOR...');
  console.log('========================================\n');

  const kategoriler = await readJSONFile('kategoriler.json');

  if (kategoriler.length === 0) {
    console.error('❌ kategoriler.json boş veya okunamadı!');
    return { successCount: 0, errorCount: 0, total: 0 };
  }

  console.log(`📊 Toplam kategori sayısı: ${kategoriler.length}`);

  const sql = getSql();
  let successCount = 0;
  let errorCount = 0;

  const { ordered, placeholderCount } = buildKategoriRecordsFromJsonRows(kategoriler);
  if (placeholderCount > 0) {
    console.log(`🧩 Eksik üst kategori için sentezlenen kayıt: ${placeholderCount}`);
  }

  for (const record of ordered) {
    try {
      await sql`
        INSERT INTO kategoriler (
          id, kategori_adi, ust_kategori_id, aciklama, resim, sira, durum, eklenme_tarihi,
          legacy_altkat, legacy_alkat2, slug
        ) VALUES (
          ${record.id},
          ${record.kategori_adi},
          ${record.ust_kategori_id},
          ${record.aciklama},
          ${record.resim},
          ${record.sira},
          ${record.durum},
          ${record.eklenme_tarihi}::timestamptz,
          ${record.legacy_altkat},
          ${record.legacy_alkat2},
          ${record.slug}
        )
        ON CONFLICT (id) DO UPDATE SET
          kategori_adi = EXCLUDED.kategori_adi,
          ust_kategori_id = EXCLUDED.ust_kategori_id,
          aciklama = EXCLUDED.aciklama,
          resim = EXCLUDED.resim,
          sira = EXCLUDED.sira,
          durum = EXCLUDED.durum,
          legacy_altkat = EXCLUDED.legacy_altkat,
          legacy_alkat2 = EXCLUDED.legacy_alkat2,
          slug = EXCLUDED.slug
      `;
      successCount++;
    } catch (e: any) {
      console.error(`❌ id=${record.id}:`, e.message);
      errorCount++;
    }
  }

  console.log(`\n📊 KATEGORİLER SONUÇ:`);
  console.log(`   ✅ Başarılı: ${successCount}`);
  console.log(`   ❌ Hatalı: ${errorCount}`);
  return { successCount, errorCount, total: ordered.length };
}

export async function migrateBilgi(): Promise<MigrateCounts> {
  console.log('\n========================================');
  console.log('📦 BİLGİ (DOSYALAR) MIGRATION BAŞLIYOR...');
  console.log('========================================\n');

  const bilgi = await readJSONFile('bilgi.json');

  if (bilgi.length === 0) {
    console.error('❌ bilgi.json boş veya okunamadı!');
    return { successCount: 0, errorCount: 0, total: 0 };
  }

  console.log(`📊 Toplam dosya sayısı: ${bilgi.length}`);

  const sql = getSql();
  let successCount = 0;
  let errorCount = 0;
  const maxRows = await sql`SELECT COALESCE(MAX(id), 0) AS max_id FROM bilgi`;
  const maxExistingId = Number(maxRows[0]?.max_id || 0);

  for (let i = 0; i < bilgi.length; i++) {
    const b = bilgi[i];
    const rawId = coalesceFirst(
      b?.id,
      b?.ID,
      b?.Id,
      b?.bilgi_id,
      b?.BILGI_ID,
      b?.['bilgi.id'],
    );
    const parsedId = toIntOrNull(rawId);
    // id yoksa/bozuksa deterministic fallback (TRUNCATE sonrası güvenli).
    const safeId = parsedId ?? (maxExistingId + i + 1);

    const record = {
      id: safeId,
      katid:
        coalesceFirst(b?.katid, b?.KATID, b?.katId, b?.['bilgi.katid']) != null
          ? String(coalesceFirst(b?.katid, b?.KATID, b?.katId, b?.['bilgi.katid']))
          : null,
      altkat:
        coalesceFirst(b?.altkat, b?.ALTKAT, b?.altKat, b?.['bilgi.altkat']) != null
          ? String(coalesceFirst(b?.altkat, b?.ALTKAT, b?.altKat, b?.['bilgi.altkat']))
          : null,
      adi: String(coalesceFirst(b?.adi, b?.ADI, b?.ad, b?.name) || 'Bilinmeyen Dosya'),
      boyut: String(coalesceFirst(b?.boyut, b?.BOYUT, b?.size) || ''),
      link: String(coalesceFirst(b?.link, b?.LINK, b?.url) || ''),
      link2: String(coalesceFirst(b?.link2, b?.LINK2) || ''),
      link3: String(coalesceFirst(b?.link3, b?.LINK3) || ''),
      tarih: String(coalesceFirst(b?.tarih, b?.TARIH, b?.created_at) || new Date().toISOString()),
      hit: toIntOrNull(coalesceFirst(b?.hit, b?.HIT)) ?? 0,
      down: toIntOrNull(coalesceFirst(b?.down, b?.DOWN)) ?? 0,
      asama: String(coalesceFirst(b?.asama, b?.ASAMA) || ''),
      bildiri: String(coalesceFirst(b?.bildiri, b?.BILDIRI, b?.description) || ''),
      renkodu: String(coalesceFirst(b?.renkodu, b?.RENKODU, b?.color) || '#008000'),
    };

    try {
      await sql`
        INSERT INTO bilgi (
          id, katid, altkat, adi, boyut, link, link2, link3, tarih, hit, down, asama, bildiri, renkodu
        ) VALUES (
          ${record.id},
          ${record.katid},
          ${record.altkat},
          ${record.adi},
          ${record.boyut},
          ${record.link},
          ${record.link2},
          ${record.link3},
          ${record.tarih}::timestamptz,
          ${record.hit},
          ${record.down},
          ${record.asama},
          ${record.bildiri},
          ${record.renkodu}
        )
        ON CONFLICT (id) DO UPDATE SET
          katid = EXCLUDED.katid,
          altkat = EXCLUDED.altkat,
          adi = EXCLUDED.adi,
          boyut = EXCLUDED.boyut,
          link = EXCLUDED.link,
          link2 = EXCLUDED.link2,
          link3 = EXCLUDED.link3,
          tarih = EXCLUDED.tarih,
          hit = EXCLUDED.hit,
          down = EXCLUDED.down,
          asama = EXCLUDED.asama,
          bildiri = EXCLUDED.bildiri,
          renkodu = EXCLUDED.renkodu
      `;
      successCount++;
    } catch (e: any) {
      console.error(`❌ bilgi id=${record.id}:`, e.message);
      errorCount++;
    }
  }

  console.log(`\n📊 BİLGİ SONUÇ:`);
  console.log(`   ✅ Başarılı: ${successCount}`);
  console.log(`   ❌ Hatalı: ${errorCount}`);
  return { successCount, errorCount, total: bilgi.length };
}

/**
 * bilgi tablosunu tamamen boşaltır (indirme_gecmisi CASCADE ile silinir),
 * ardından bilgi.json kayıtlarını tekrar INSERT eder.
 */
export async function reloadBilgiFromJson(): Promise<{
  truncated: true;
  bilgi: MigrateCounts;
}> {
  const sql = getSql();
  console.log('\n🗑️ TRUNCATE bilgi RESTART IDENTITY CASCADE ...');
  await sql`TRUNCATE bilgi RESTART IDENTITY CASCADE`;
  const bilgi = await migrateBilgi();
  console.log('\n✅ bilgi yeniden yükleme tamamlandı.\n');
  return { truncated: true, bilgi };
}

export async function runMigration(): Promise<{
  success: true;
  kategoriler: MigrateCounts;
  bilgi: MigrateCounts;
}> {
  console.log('\n');
  console.log('╔════════════════════════════════════════╗');
  console.log('║   JSON → PostgreSQL MIGRATION          ║');
  console.log('║   ILSA Support Platform                ║');
  console.log('╚════════════════════════════════════════╝');

  const kategoriler = await migrateKategoriler();
  const bilgi = await migrateBilgi();

  console.log('\n✅ Migration tamamlandı.\n');
  return { success: true, kategoriler, bilgi };
}

if (import.meta.main) {
  const arg = Deno.args[0];
  if (arg === '--reload-bilgi') {
    reloadBilgiFromJson().catch(console.error);
  } else {
    runMigration().catch(console.error);
  }
}
