/**
 * Uzak MySQL → yerel PostgreSQL (legacy tablolar: kategoriler, bilgi)
 *
 * Kullanım:
 *   npm install
 *   Varsayılan kapalı. Açmak için .env.local: MYSQL_SYNC_ENABLED=1 ve MYSQL_* (bkz. .env.example)
 *   npm run sync:mysql
 *
 * Seçenekler:
 *   --dry-run          Sadece sayıları yaz, PG'ye yazma
 *   --kat-only         Yalnız kategoriler
 *   --bilgi-only       Yalnız bilgi
 *   --from-kat-id N    MySQL kategoriler.id > N (belirtilmezse PG MAX(id))
 *   --from-bilgi-id N  MySQL bilgi.id > N (belirtilmezse PG MAX(id))
 *
 * MySQL kolon adları eski dump ile uyumlu varsayılır (adi, altkat, alkat2, …).
 * Farklı şema için env ile tablo adlarını değiştirebilirsiniz.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

let mysql2;
try {
  mysql2 = require('mysql2/promise');
} catch (e) {
  console.error('mysql2 paketi yok. Çalıştırın: npm install');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');

function loadEnvFile(name) {
  const p = path.join(ROOT, name);
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function mergeEnv() {
  return { ...loadEnvFile('.env.local'), ...loadEnvFile('.env'), ...process.env };
}

function lowerKeys(row) {
  const o = {};
  for (const [k, v] of Object.entries(row)) o[String(k).toLowerCase()] = v;
  return o;
}

function rowToKatMapped(L) {
  const id = Number(L.id);
  if (!Number.isFinite(id)) return null;
  const altkat = L.altkat == null ? '0' : String(L.altkat).trim();
  const adi = String(L.adi ?? L.ad ?? L.baslik ?? L.name ?? '').trim() || 'Adsız kategori';
  const etiketler = L.etiketler != null ? String(L.etiketler) : '';
  const aciklama = L.aciklama != null ? String(L.aciklama) : '';
  const resim = L.resim != null && L.resim !== '' ? String(L.resim) : null;
  const sira = L.sira != null && L.sira !== '' ? Number(L.sira) : 0;
  const alkat2Raw = L.alkat2;
  const altStr = altkat === '' ? '0' : altkat;
  const alkat2Num = Number(alkat2Raw);
  let ust = null;
  if (Number.isFinite(alkat2Num) && alkat2Num > 0) {
    ust = alkat2Num;
  } else if (altStr !== '0' && altStr !== '') {
    const p = parseInt(altStr, 10);
    ust = Number.isFinite(p) ? p : null;
  }
  const ac = [aciklama, etiketler].filter(Boolean).join(' | ').trim();
  const slug = L.slug != null && String(L.slug).trim() ? String(L.slug).trim() : null;
  const durum = L.durum != null && String(L.durum).trim() ? String(L.durum).trim() : 'active';
  const legacy_altkat = altStr;
  const legacy_alkat2 =
    alkat2Raw == null || alkat2Raw === '' ? null : String(alkat2Raw).trim();
  return {
    id,
    kategori_adi: adi,
    ust,
    aciklama: ac,
    resim,
    sira: Number.isFinite(sira) ? sira : 0,
    durum,
    slug,
    legacy_altkat,
    legacy_alkat2,
    eklenme_tarihi: L.eklenme_tarihi ?? L.eklenme ?? L.tarih ?? null,
  };
}

function rowToBilgiMapped(L) {
  const id = Number(L.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    katid: L.katid == null ? null : String(L.katid),
    altkat: L.altkat == null ? null : String(L.altkat),
    adi: L.adi == null || L.adi === '' ? 'Bilinmeyen Dosya' : String(L.adi),
    boyut: L.boyut == null ? '' : String(L.boyut),
    link: L.link == null ? '' : String(L.link),
    link2: L.link2 == null ? null : String(L.link2),
    link3: L.link3 == null ? null : String(L.link3),
    tarih: L.tarih || new Date().toISOString(),
    hit: Number(L.hit) || 0,
    down: Number(L.down) || 0,
    asama: L.asama == null ? '' : String(L.asama),
    bildiri: L.bildiri == null ? '' : String(L.bildiri),
    renkodu: L.renkodu == null ? '#008000' : String(L.renkodu),
  };
}

function parseArgs(argv) {
  const flags = new Set();
  const opts = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') flags.add('dry');
    else if (a === '--kat-only') flags.add('katOnly');
    else if (a === '--bilgi-only') flags.add('bilgiOnly');
    else if (a === '--from-kat-id') opts.fromKatId = Number(argv[++i]);
    else if (a === '--from-bilgi-id') opts.fromBilgiId = Number(argv[++i]);
  }
  return { flags, opts };
}

async function main() {
  const env = mergeEnv();
  const { flags, opts } = parseArgs(process.argv);
  const dry = flags.has('dry');
  const katOnly = flags.has('katOnly');
  const bilgiOnly = flags.has('bilgiOnly');

  const syncEnabled =
    env.MYSQL_SYNC_ENABLED === '1' ||
    env.MYSQL_SYNC_ENABLED === 'true' ||
    flags.has('force');
  if (!syncEnabled) {
    console.log(
      'MySQL senkronu kapalı (MYSQL_SYNC_ENABLED≠1). İhtiyaç olunca .env.local içinde MYSQL_SYNC_ENABLED=1 ve MYSQL_* tanımlayıp tekrar çalıştırın.',
    );
    process.exit(0);
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL tanımlı değil (.env.local).');
    process.exit(1);
  }

  const mysqlHost = env.MYSQL_HOST || '127.0.0.1';
  const mysqlUser = env.MYSQL_USER;
  const mysqlPassword = env.MYSQL_PASSWORD ?? '';
  const mysqlDatabase = env.MYSQL_DATABASE;
  const mysqlPort = Number(env.MYSQL_PORT || 3306);
  const mysqlSsl = env.MYSQL_SSL === '1' || env.MYSQL_SSL === 'true';

  if (!mysqlUser || !mysqlDatabase) {
    console.error('MYSQL_USER ve MYSQL_DATABASE gerekli (.env.local).');
    process.exit(1);
  }

  const tableKat = env.MYSQL_TABLE_KATEGORILER || 'kategoriler';
  const tableBilgi = env.MYSQL_TABLE_BILGI || 'bilgi';

  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();

  let mysqlConn;
  try {
    mysqlConn = await mysql2.createConnection({
      host: mysqlHost,
      port: mysqlPort,
      user: mysqlUser,
      password: mysqlPassword,
      database: mysqlDatabase,
      ssl: mysqlSsl ? { rejectUnauthorized: false } : undefined,
    });
  } catch (e) {
    console.error('MySQL bağlantı hatası:', e.message || e);
    await pg.end().catch(() => {});
    process.exit(1);
  }

  const maxRes = await pg.query('SELECT COALESCE(MAX(id),0)::int AS m FROM kategoriler');
  const maxBilgi = await pg.query('SELECT COALESCE(MAX(id),0)::int AS m FROM bilgi');
  const pgMaxKat = maxRes.rows[0].m;
  const pgMaxBilgi = maxBilgi.rows[0].m;

  const fromKat = Number.isFinite(opts.fromKatId) ? opts.fromKatId : pgMaxKat;
  const fromBilgi = Number.isFinite(opts.fromBilgiId) ? opts.fromBilgiId : pgMaxBilgi;

  console.log(
    `PG mevcut: kategoriler max_id=${pgMaxKat}, bilgi max_id=${pgMaxBilgi} → çekim eşiği: kat>${fromKat}, bilgi>${fromBilgi}`,
  );

  const kats = [];
  const bilg = [];

  try {
    if (!bilgiOnly) {
      const [rows] = await mysqlConn.query(`SELECT * FROM \`${tableKat}\` WHERE id > ? ORDER BY id ASC`, [fromKat]);
      for (const row of rows) {
        const m = rowToKatMapped(lowerKeys(row));
        if (m) kats.push(m);
      }
      console.log(`MySQL ${tableKat}: ${kats.length} satır (id > ${fromKat})`);
    }

    if (!katOnly) {
      const [rows] = await mysqlConn.query(`SELECT * FROM \`${tableBilgi}\` WHERE id > ? ORDER BY id ASC`, [fromBilgi]);
      for (const row of rows) {
        const m = rowToBilgiMapped(lowerKeys(row));
        if (m) bilg.push(m);
      }
      console.log(`MySQL ${tableBilgi}: ${bilg.length} satır (id > ${fromBilgi})`);
    }

    if (dry) {
      console.log('[dry-run] PostgreSQL yazılmadı.');
      return;
    }

    if (kats.length) {
      const idSet = new Set(kats.map((k) => k.id));
      const missingUst = new Set();
      for (const r of kats) {
        if (r.ust != null && !idSet.has(r.ust)) missingUst.add(r.ust);
      }
      let have = new Set();
      if (missingUst.size) {
        const existingParents = await pg.query('SELECT id FROM kategoriler WHERE id = ANY($1::int[])', [
          Array.from(missingUst),
        ]);
        have = new Set(existingParents.rows.map((x) => x.id));
      }
      for (const mid of missingUst) {
        if (!have.has(mid)) {
          await pg.query(
            `INSERT INTO kategoriler (id,kategori_adi,ust_kategori_id,aciklama,resim,sira,durum,legacy_altkat,legacy_alkat2)
             VALUES ($1,$2,NULL,$3,NULL,0,'internal_stub',$4,$5)
             ON CONFLICT (id) DO NOTHING`,
            [
              mid,
              '(MySQL sync) Üst kategori PG’de yoktu',
              'Otomatik: MySQL alt kayıtları bu ust idye bağlı; senkron sırasında üst satır bulunamadı.',
              '0',
              '0',
            ],
          );
        }
      }

      kats.sort((a, b) => a.id - b.id);
      let pending = kats.slice();
      for (let round = 0; round < 200 && pending.length; round++) {
        const next = [];
        for (const r of pending) {
          try {
            await pg.query(
              `INSERT INTO kategoriler (
                id, kategori_adi, ust_kategori_id, aciklama, resim, sira, durum,
                eklenme_tarihi, legacy_altkat, legacy_alkat2, slug
              ) VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8::timestamptz, NOW()), $9, $10, $11)
              ON CONFLICT (id) DO UPDATE SET
                kategori_adi = EXCLUDED.kategori_adi,
                ust_kategori_id = EXCLUDED.ust_kategori_id,
                aciklama = EXCLUDED.aciklama,
                resim = EXCLUDED.resim,
                sira = EXCLUDED.sira,
                durum = EXCLUDED.durum,
                legacy_altkat = EXCLUDED.legacy_altkat,
                legacy_alkat2 = EXCLUDED.legacy_alkat2,
                slug = COALESCE(EXCLUDED.slug, kategoriler.slug)`,
              [
                r.id,
                r.kategori_adi,
                r.ust,
                r.aciklama,
                r.resim,
                r.sira,
                r.durum,
                r.eklenme_tarihi,
                r.legacy_altkat,
                r.legacy_alkat2,
                r.slug,
              ],
            );
          } catch (e) {
            if (e.code === '23503' || /foreign key|yabancı anahtar/i.test(String(e.message || ''))) {
              next.push(r);
            } else {
              throw e;
            }
          }
        }
        if (next.length === pending.length) {
          throw new Error(`Kategoriler FK: ${next.length} satır eklenemedi (üst id eksik).`);
        }
        pending = next;
      }
      await pg.query(
        "SELECT setval(pg_get_serial_sequence('kategoriler','id'), (SELECT COALESCE(MAX(id),1) FROM kategoriler), true)",
      );
      console.log(`✅ kategoriler: ${kats.length} satır işlendi (insert/update).`);
    }

    if (bilg.length) {
      const B = 150;
      await pg.query('BEGIN');
      try {
        for (let i = 0; i < bilg.length; i += B) {
          const chunk = bilg.slice(i, i + B);
          const ph = [];
          const params = [];
          let p = 1;
          for (const r of chunk) {
            ph.push(`(${new Array(14).fill(0).map(() => '$' + p++).join(',')})`);
            params.push(
              r.id,
              r.katid,
              r.altkat,
              r.adi,
              r.boyut,
              r.link,
              r.link2,
              r.link3,
              r.tarih,
              r.hit,
              r.down,
              r.asama,
              r.bildiri,
              r.renkodu,
            );
          }
          const sql =
            'INSERT INTO bilgi (id,katid,altkat,adi,boyut,link,link2,link3,tarih,hit,down,asama,bildiri,renkodu) VALUES ' +
            ph.join(',') +
            ' ON CONFLICT (id) DO UPDATE SET katid=EXCLUDED.katid,altkat=EXCLUDED.altkat,adi=EXCLUDED.adi,boyut=EXCLUDED.boyut' +
            ',link=EXCLUDED.link,link2=EXCLUDED.link2,link3=EXCLUDED.link3,tarih=EXCLUDED.tarih,hit=EXCLUDED.hit' +
            ',down=EXCLUDED.down,asama=EXCLUDED.asama,bildiri=EXCLUDED.bildiri,renkodu=EXCLUDED.renkodu';
          await pg.query(sql, params);
        }
        await pg.query('COMMIT');
      } catch (e) {
        await pg.query('ROLLBACK').catch(() => {});
        throw e;
      }
      await pg.query(
        "SELECT setval(pg_get_serial_sequence('bilgi','id'), (SELECT COALESCE(MAX(id),1) FROM bilgi), true)",
      );
      console.log(`✅ bilgi: ${bilg.length} satır upsert.`);
    }

    if (!kats.length && !bilg.length) {
      console.log('Yeni kayıt yok (eşik değerlerinin üzerinde satır bulunamadı).');
    }
  } finally {
    await mysqlConn.end().catch(() => {});
    await pg.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
