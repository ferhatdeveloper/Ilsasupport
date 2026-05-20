/**
 * phpMyAdmin JSON export → PostgreSQL (bilgi + kategoriler)
 * Varsayılan: 25.04.2026 09:11:33 sonrası bilgi kayıtları + bağlı kategoriler.
 *
 *   node scripts/import-ort-json-incremental.cjs
 *   node scripts/import-ort-json-incremental.cjs --dry-run
 *   node scripts/import-ort-json-incremental.cjs --since "2026-04-25 09:11:33"
 *   node scripts/import-ort-json-incremental.cjs --json path/to/file.json
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const DEFAULT_JSON = path.join(ROOT, 'ilsasup_ilsasupp_ort.json');
const DEFAULT_SINCE = '2026-04-25 09:11:33';

function loadDbUrl() {
  const p = path.join(ROOT, '.env.local');
  const line = fs.readFileSync(p, 'utf8').split(/\r?\n/).find((l) => /^\s*DATABASE_URL=/.test(l));
  if (!line) throw new Error('DATABASE_URL yok (.env.local)');
  return line.replace(/^\s*DATABASE_URL=/, '').trim().replace(/^["']|["']$/g, '');
}

function parseArgs() {
  const opts = { dry: false, since: DEFAULT_SINCE, json: DEFAULT_JSON };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') opts.dry = true;
    else if (argv[i] === '--since') opts.since = argv[++i];
    else if (argv[i] === '--json') opts.json = path.resolve(argv[++i]);
  }
  return opts;
}

function parseTarih(s) {
  if (!s) return null;
  const t = String(s).trim().replace(' ', 'T');
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mapKat(row) {
  const id = Number(row.id);
  if (!Number.isFinite(id)) return null;
  const altkatRaw = row.altkat == null ? '0' : String(row.altkat).trim();
  const altkat = altkatRaw === '' ? '0' : altkatRaw;
  const adi = String(row.adi ?? '').trim() || 'Adsız kategori';
  const etiketler = row.etiketler != null ? String(row.etiketler) : '';
  const aciklama = row.aciklama != null ? String(row.aciklama) : '';
  const resim = row.resim != null && row.resim !== '' ? String(row.resim) : null;
  const sira = row.sira != null && row.sira !== '' ? Number(row.sira) : 0;
  const alkat2Raw = row.alkat2;
  const alkat2Num = Number(alkat2Raw);
  let ust = null;
  if (Number.isFinite(alkat2Num) && alkat2Num > 0) {
    ust = alkat2Num;
  } else if (altkat !== '0' && altkat !== '') {
    const p = parseInt(altkat, 10);
    ust = Number.isFinite(p) ? p : null;
  }
  const ac = [aciklama, etiketler].filter(Boolean).join(' | ').trim();
  const slug = row.slug != null && String(row.slug).trim() ? String(row.slug).trim() : null;
  return {
    id,
    kategori_adi: adi,
    ust,
    aciklama: ac,
    resim,
    sira: Number.isFinite(sira) ? sira : 0,
    durum: 'active',
    slug,
    legacy_altkat: altkat,
    legacy_alkat2: alkat2Raw == null || alkat2Raw === '' ? null : String(alkat2Raw).trim(),
  };
}

function mapBilgi(row) {
  const id = Number(row.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    katid: row.katid == null ? null : String(row.katid),
    altkat: row.altkat == null ? null : String(row.altkat),
    adi: row.adi == null || row.adi === '' ? 'Bilinmeyen Dosya' : String(row.adi),
    boyut: row.boyut == null ? '' : String(row.boyut),
    link: row.link == null ? '' : String(row.link),
    link2: row.link2 == null ? null : String(row.link2),
    link3: row.link3 == null ? null : String(row.link3),
    tarih: row.tarih || new Date().toISOString(),
    hit: Number(row.hit) || 0,
    down: Number(row.down) || 0,
    asama: row.asama == null ? '' : String(row.asama),
    bildiri: row.bildiri == null ? '' : String(row.bildiri),
    renkodu: row.renkodu == null ? '#008000' : String(row.renkodu),
  };
}

function parseDataLine(line) {
  const t = line.trim();
  if (!t.startsWith('{')) return null;
  const cleaned = t.replace(/,\s*$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

async function streamBilgiAfter(jsonPath, cutoff) {
  const bilg = [];
  const needKat = new Set();
  const rl = readline.createInterface({
    input: fs.createReadStream(jsonPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let table = null;
  for await (const line of rl) {
    if (line.includes('"type":"table"')) {
      const m = /"name":"([^"]+)"/.exec(line);
      table = m ? m[1] : null;
      if (table === 'kategoriler') break;
      continue;
    }
    if (table !== 'bilgi') continue;
    const row = parseDataLine(line);
    if (!row || row.id == null) continue;
    const d = parseTarih(row.tarih);
    if (!d || d <= cutoff) continue;
    const m = mapBilgi(row);
    if (!m) continue;
    bilg.push(m);
    if (m.katid) needKat.add(String(m.katid));
    if (m.altkat) needKat.add(String(m.altkat));
  }
  return { bilg, needKat };
}

async function loadAllKategorilerMap(jsonPath) {
  const all = new Map();
  const rl = readline.createInterface({
    input: fs.createReadStream(jsonPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let inKat = false;
  for await (const line of rl) {
    if (line.includes('"name":"kategoriler"')) {
      inKat = true;
      continue;
    }
    if (!inKat) continue;
    const t = line.trim();
    if (t === ']' || t.startsWith(']}')) break;
    const row = parseDataLine(line);
    if (!row || row.id == null) continue;
    const m = mapKat(row);
    if (m) all.set(m.id, m);
  }
  return all;
}

function pickKategorilerWithParents(allKat, needKat) {
  const picked = new Map();
  const queue = [...needKat];
  const seen = new Set();
  while (queue.length) {
    const sid = queue.pop();
    if (seen.has(sid)) continue;
    seen.add(sid);
    const id = parseInt(sid, 10);
    if (!Number.isFinite(id)) continue;
    const m = allKat.get(id);
    if (!m) continue;
    picked.set(id, m);
    if (m.ust != null) queue.push(String(m.ust));
  }
  return Array.from(picked.values());
}

async function upsertKategoriler(pg, kats) {
  if (!kats.length) return;
  const idSet = new Set(kats.map((k) => k.id));
  const missingUst = new Set();
  for (const r of kats) {
    if (r.ust != null && !idSet.has(r.ust)) missingUst.add(r.ust);
  }
  if (missingUst.size) {
    const existing = await pg.query('SELECT id FROM kategoriler WHERE id = ANY($1::int[])', [
      Array.from(missingUst),
    ]);
    const have = new Set(existing.rows.map((x) => x.id));
    for (const mid of missingUst) {
      if (have.has(mid)) continue;
      await pg.query(
        `INSERT INTO kategoriler (id,kategori_adi,ust_kategori_id,aciklama,resim,sira,durum,legacy_altkat,legacy_alkat2)
         VALUES ($1,$2,NULL,$3,NULL,0,'internal_stub',$4,$5)
         ON CONFLICT (id) DO NOTHING`,
        [mid, '(ORT JSON) Üst kategori eksik', 'JSON import: üst id dump içinde yok', '0', '0'],
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
            legacy_altkat, legacy_alkat2, slug
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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
      throw new Error(`kategoriler FK: ${next.length} satır eklenemedi`);
    }
    pending = next;
  }
  await pg.query(
    "SELECT setval(pg_get_serial_sequence('kategoriler','id'), (SELECT COALESCE(MAX(id),1) FROM kategoriler), true)",
  );
}

async function upsertBilgi(pg, bilg) {
  if (!bilg.length) return;
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
}

async function main() {
  const opts = parseArgs();
  if (!fs.existsSync(opts.json)) throw new Error('JSON yok: ' + opts.json);
  const cutoff = parseTarih(opts.since);
  if (!cutoff) throw new Error('Geçersiz --since: ' + opts.since);

  console.log('JSON:', opts.json);
  console.log('Tarih eşiği (sonrası):', opts.since, '→', cutoff.toISOString());

  console.log('1/3 bilgi taranıyor…');
  const { bilg, needKat } = await streamBilgiAfter(opts.json, cutoff);
  console.log(`   ${bilg.length} bilgi, ${needKat.size} kategori referansı`);

  console.log('2/3 kategoriler indeksleniyor…');
  const allKat = await loadAllKategorilerMap(opts.json);
  const kats = pickKategorilerWithParents(allKat, needKat);
  console.log(`   dump: ${allKat.size} kategori, import: ${kats.length} (üst zincir dahil)`);

  if (opts.dry) {
    console.log('[dry-run] PostgreSQL yazılmadı.');
    return;
  }

  const pg = new Client({ connectionString: loadDbUrl() });
  await pg.connect();
  try {
    console.log('3/3 PostgreSQL yazılıyor…');
    await upsertKategoriler(pg, kats);
    console.log(`✅ kategoriler: ${kats.length}`);
    await upsertBilgi(pg, bilg);
    console.log(`✅ bilgi: ${bilg.length}`);
    console.log('ORT JSON artımlı import tamamlandı.');
  } finally {
    await pg.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
