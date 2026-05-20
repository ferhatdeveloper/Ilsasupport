const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Client } = require('pg');
const { parseMySQLDataLine } = require('./parse-mysql-tuple.cjs');

const ROOT = path.join(__dirname, '..');
const DUMP = process.env.ORT_SQL_PATH
  ? path.resolve(process.env.ORT_SQL_PATH)
  : path.join(ROOT, 'Ilsasupport-php', 'ilsasup_ilsasupp_ort.sql');
const BILGI_LO = 52;
const BILGI_HI = 53745;
const KAT_LO = 2444025;
const KAT_HI = 2452102;

function loadDbUrl() {
  const p = path.join(ROOT, '.env.local');
  const line = fs.readFileSync(p, 'utf8').split(/\r?\n/).find((l) => /^\s*DATABASE_URL=/.test(l));
  if (!line) throw new Error('DATABASE_URL yok');
  return line.replace(/^\s*DATABASE_URL=/, '').trim();
}

function mapKat(v) {
  const id = v[0];
  const altkat = v[1];
  const adi = v[2];
  const etiketler = v[4];
  const aciklama = v[5];
  const resim = v[7];
  const sira = v[8];
  const alkat2Raw = v[9];
  // Eski MySQL: altkat genelde marka / üst id; alkat2>0 ise gerçek üst kategori o id (ör. ALCATEL REPAIR altındaki REPAIR ÇÖZÜMLERİ).
  const altStr = altkat == null ? '0' : String(altkat).trim();
  const alkat2Num = Number(alkat2Raw);
  let ust = null;
  if (Number.isFinite(alkat2Num) && alkat2Num > 0) {
    ust = alkat2Num;
  } else if (altStr !== '0' && altStr !== '') {
    const p = parseInt(altStr, 10);
    ust = Number.isFinite(p) ? p : null;
  }
  const ac = [aciklama, etiketler].filter(Boolean).join(' | ').trim();
  return {
    id: Number(id),
    kategori_adi: String(adi || ''),
    ust,
    aciklama: ac,
    resim: resim ? String(resim) : null,
    sira: sira != null && sira !== '' ? Number(sira) : 0,
  };
}

function mapBilgi(v) {
  return {
    id: Number(v[0]),
    katid: v[1] == null ? null : String(v[1]),
    altkat: v[2] == null ? null : String(v[2]),
    adi: v[3] == null || v[3] === '' ? 'Bilinmeyen Dosya' : String(v[3]),
    boyut: v[4] == null ? '' : String(v[4]),
    link: v[5] == null ? '' : String(v[5]),
    tarih: v[6] || new Date().toISOString(),
    link2: v[7] == null ? null : String(v[7]),
    link3: v[8] == null ? null : String(v[8]),
    hit: Number(v[9]) || 0,
    down: Number(v[10]) || 0,
    asama: v[11] == null ? '' : String(v[11]),
    bildiri: v[12] == null ? '' : String(v[12]),
    renkodu: v[13] == null ? '#008000' : String(v[13]),
  };
}

async function main() {
  if (!fs.existsSync(DUMP)) throw new Error('Dump yok: ' + DUMP);
  const kats = [];
  const bilg = [];
  let lineNum = 0;
  const rl = readline.createInterface({
    input: fs.createReadStream(DUMP, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    lineNum++;
    if (lineNum < BILGI_LO) continue;
    if (lineNum > KAT_HI) break;
    if (lineNum > BILGI_HI && lineNum < KAT_LO) continue;
    if (!line.trim().startsWith('(')) continue;
    let vals;
    try {
      vals = parseMySQLDataLine(line);
    } catch {
      continue;
    }
    if (!vals) continue;
    if (lineNum >= BILGI_LO && lineNum <= BILGI_HI) {
      if (vals.length === 14) bilg.push(mapBilgi(vals));
    }
    if (lineNum >= KAT_LO && lineNum <= KAT_HI) {
      if (vals.length === 10) kats.push(mapKat(vals));
    }
  }
  console.log('kategoriler=' + kats.length + ' bilgi=' + bilg.length);

  const idSet = new Set(kats.map((k) => k.id));
  const missingUst = new Set();
  for (const r of kats) {
    if (r.ust != null && !idSet.has(r.ust)) missingUst.add(r.ust);
  }
  if (missingUst.size) {
    console.log('kategoriler: ' + missingUst.size + ' adet eksik ebeveyn id (dump araliginda yok) — gecici satir eklenecek.');
  }

  const client = new Client({ connectionString: loadDbUrl() });
  await client.connect();
  try {
    await client.query('TRUNCATE indirme_gecmisi RESTART IDENTITY CASCADE');
    await client.query('TRUNCATE bilgi RESTART IDENTITY CASCADE');
    await client.query('TRUNCATE kategoriler RESTART IDENTITY CASCADE');
    kats.sort((a, b) => a.id - b.id);
    for (const mid of Array.from(missingUst).sort((a, b) => a - b)) {
      await client.query(
        "INSERT INTO kategoriler (id,kategori_adi,ust_kategori_id,aciklama,resim,sira,durum) VALUES ($1,$2,NULL,$3,NULL,0,'internal_stub')",
        [
          mid,
          '(ORT) Ust kategori dump araliginda yok',
          'Otomatik: alt kategoriler bu ust idye bagli; kaynak sqlde bu id icin satir yok veya aralik disi.',
        ]
      );
    }
    let pending = kats.slice();
    for (let round = 0; round < 200 && pending.length; round++) {
      const next = [];
      for (const r of pending) {
        try {
          await client.query(
            "INSERT INTO kategoriler (id,kategori_adi,ust_kategori_id,aciklama,resim,sira,durum) VALUES ($1,$2,$3,$4,$5,$6,'active')",
            [r.id, r.kategori_adi, r.ust, r.aciklama, r.resim, r.sira]
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
        throw new Error('kategoriler FK: ' + next.length + ' satir eklenemedi (ust_kategori_id ebeveyni yok).');
      }
      pending = next;
    }
    if (kats.length) {
      await client.query(
        "SELECT setval(pg_get_serial_sequence('kategoriler','id'), (SELECT COALESCE(MAX(id),1) FROM kategoriler), true)"
      );
    }
    await client.query('BEGIN');
    const B = 150;
    for (let i = 0; i < bilg.length; i += B) {
      const chunk = bilg.slice(i, i + B);
      const ph = [];
      const params = [];
      let p = 1;
      for (const r of chunk) {
        ph.push('(' + new Array(14).fill(0).map(() => '$' + p++).join(',') + ')');
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
          r.renkodu
        );
      }
      const sql =
        'INSERT INTO bilgi (id,katid,altkat,adi,boyut,link,link2,link3,tarih,hit,down,asama,bildiri,renkodu) VALUES ' +
        ph.join(',') +
        ' ON CONFLICT (id) DO UPDATE SET katid=EXCLUDED.katid,altkat=EXCLUDED.altkat,adi=EXCLUDED.adi,boyut=EXCLUDED.boyut' +
        ',link=EXCLUDED.link,link2=EXCLUDED.link2,link3=EXCLUDED.link3,tarih=EXCLUDED.tarih,hit=EXCLUDED.hit' +
        ',down=EXCLUDED.down,asama=EXCLUDED.asama,bildiri=EXCLUDED.bildiri,renkodu=EXCLUDED.renkodu';
      await client.query(sql, params);
    }
    if (bilg.length) {
      await client.query("SELECT setval(pg_get_serial_sequence('bilgi','id'), (SELECT COALESCE(MAX(id),1) FROM bilgi), true)");
    }
    await client.query('COMMIT');
    console.log('ORT import bitti.');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
