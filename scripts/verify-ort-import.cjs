const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const p = path.join(__dirname, '..', '.env.local');
const line = fs.readFileSync(p, 'utf8').split(/\r?\n/).find((l) => /^\s*DATABASE_URL=/.test(l));
const url = line.replace(/^\s*DATABASE_URL=/, '').trim();

(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();
  const b = await c.query(
    `SELECT COUNT(*)::int AS c, MIN(tarih) AS min_t, MAX(tarih) AS max_t FROM bilgi WHERE tarih > $1`,
    ['2026-04-25 09:11:33'],
  );
  const k = await c.query('SELECT COUNT(*)::int AS c FROM kategoriler');
  const sample = await c.query(
    `SELECT id, adi, tarih FROM bilgi WHERE tarih > $1 ORDER BY tarih DESC LIMIT 3`,
    ['2026-04-25 09:11:33'],
  );
  console.log('bilgi (tarih > eşik):', b.rows[0]);
  console.log('kategoriler toplam:', k.rows[0].c);
  console.log('son 3 kayıt:', sample.rows);
  await c.end();
})();
