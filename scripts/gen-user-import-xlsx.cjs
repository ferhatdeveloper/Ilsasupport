/**
 * Örnek kullanıcı içe aktarma şablonu (.xlsx) üretir (Node).
 * Kullanım: npm install && npm run gen:user-import-xlsx
 * xlsx paketi yoksa scripts/xlsx.full.min.js (SheetJS) kullanılır.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let XLSX;
try {
  XLSX = require('xlsx');
} catch {
  const bundlePath = path.join(__dirname, 'xlsx.full.min.js');
  const ctx = { console, Buffer, process, global: {} };
  ctx.global = ctx;
  vm.runInNewContext(fs.readFileSync(bundlePath, 'utf8'), ctx);
  XLSX = ctx.XLSX;
  if (!XLSX) throw new Error('xlsx yüklenemedi: npm install veya scripts/xlsx.full.min.js');
}

const outDir = path.join(__dirname, '..', 'public', 'templates');
const outPath = path.join(outDir, 'kullanici-ice-aktarma-ornek.xlsx');

function excelSerialUTC(d) {
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((d.getTime() - epoch) / 86400000);
}

const sampleStart = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));

const header = [
  'Kullanıcı adı',
  'Ad Soyad',
  'Plan',
  'Maks cihaz (oturum)',
  'Kayıt tarihi',
  'Üyelik süresi (gün)',
  'Bitiş tarihi (otomatik)',
  'Kalan gün (otomatik)',
];

const rowExample = [
  'ornek_kullanici_1',
  'Örnek Kullanıcı',
  'premium',
  3,
  excelSerialUTC(sampleStart),
  365,
  '',
  '',
];

const rowExample2 = [
  'ornek_kullanici_2',
  'Örnek İki',
  'free',
  1,
  excelSerialUTC(new Date(Date.UTC(2026, 4, 1, 12, 0, 0))),
  30,
  '',
  '',
];

const aoa = [header, rowExample, rowExample2, ['', '', '', '', '', '', '', '']];
const ws = XLSX.utils.aoa_to_sheet(aoa);

const lastDataRow = 25;
for (let excelRow = 2; excelRow <= lastDataRow; excelRow++) {
  const g = XLSX.utils.encode_cell({ r: excelRow - 1, c: 6 });
  const h = XLSX.utils.encode_cell({ r: excelRow - 1, c: 7 });
  ws[g] = {
    f: `IF(AND(E${excelRow}<>"",F${excelRow}<>"",F${excelRow}>0),E${excelRow}+F${excelRow},"")`,
    t: 'n',
  };
  ws[h] = {
    f: `IF(G${excelRow}="","",INT(G${excelRow}-TODAY()))`,
    t: 'n',
  };
}

/** Excel’de 10.02.2026 biçimi (gün.ay.yıl) */
const dateFmt = 'dd.mm.yyyy';
for (let excelRow = 2; excelRow <= lastDataRow; excelRow++) {
  const r = excelRow - 1;
  const eAddr = XLSX.utils.encode_cell({ r, c: 4 });
  const gAddr = XLSX.utils.encode_cell({ r, c: 6 });
  const eCell = ws[eAddr];
  if (eCell && eCell.t === 'n' && typeof eCell.v === 'number') {
    eCell.z = dateFmt;
  }
  if (ws[gAddr]) ws[gAddr].z = dateFmt;
}

ws['!ref'] = `A1:H${lastDataRow}`;
ws['!cols'] = [
  { wch: 28 },
  { wch: 22 },
  { wch: 10 },
  { wch: 20 },
  { wch: 14 },
  { wch: 18 },
  { wch: 22 },
  { wch: 18 },
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Kullanicilar');

fs.mkdirSync(outDir, { recursive: true });
const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', cellStyles: true });
fs.writeFileSync(outPath, buf);
console.log('Yazildi:', outPath);
