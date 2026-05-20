const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CUTOFF = new Date('2026-04-25T09:11:33');

function parseTarih(s) {
  if (!s) return null;
  const t = String(s).trim().replace(' ', 'T');
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

(async () => {
  const rl = readline.createInterface({
    input: fs.createReadStream(path.join(__dirname, '..', 'ilsasup_ilsasupp_ort.json'), {
      encoding: 'utf8',
    }),
    crlfDelay: Infinity,
  });
  let table = null;
  let bilgi = 0;
  const katIds = new Set();
  for await (const line of rl) {
    if (line.includes('"type":"table"')) {
      const m = /"name":"([^"]+)"/.exec(line);
      table = m ? m[1] : null;
      continue;
    }
    if (table !== 'bilgi') continue;
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    if (t === ']' || t === ']},' || t === '}') continue;
    let row;
    try {
      row = JSON.parse(t.replace(/,\s*$/, ''));
    } catch {
      continue;
    }
    const d = parseTarih(row.tarih);
    if (!d || d <= CUTOFF) continue;
    bilgi++;
    if (row.katid) katIds.add(String(row.katid));
    if (row.altkat) katIds.add(String(row.altkat));
  }
  console.log('bilgi after cutoff:', bilgi);
  console.log('unique kat refs:', katIds.size);
})();
