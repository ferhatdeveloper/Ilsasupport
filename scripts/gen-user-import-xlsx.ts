/**
 * Örnek kullanıcı içe aktarma şablonu (.xlsx) üretir.
 * Proje kökünde: deno run -A scripts/gen-user-import-xlsx.ts
 * veya: npm run gen:user-import-xlsx
 */
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const sep = Deno.build.os === "windows" ? "\\" : "/";
const outPath = `${Deno.cwd()}${sep}public${sep}templates${sep}kullanici-ice-aktarma-ornek.xlsx`;

function excelSerialUTC(d: Date): number {
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((d.getTime() - epoch) / 86400000);
}

const sampleStart = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));

const wb = XLSX.utils.book_new();
const header = [
  "Kullanıcı adı",
  "Ad Soyad",
  "Plan",
  "Maks cihaz (oturum)",
  "Kayıt tarihi",
  "Üyelik süresi (gün)",
  "Bitiş tarihi (otomatik)",
  "Kalan gün (otomatik)",
];

const rowExample = [
  "ornek_kullanici_1",
  "Örnek Kullanıcı",
  "premium",
  3,
  excelSerialUTC(sampleStart),
  365,
  "",
  "",
];

const rowExample2 = [
  "ornek_kullanici_2",
  "Örnek İki",
  "free",
  1,
  excelSerialUTC(new Date(Date.UTC(2026, 4, 1, 12, 0, 0))),
  30,
  "",
  "",
];

const aoa = [header, rowExample, rowExample2, ["", "", "", "", "", "", "", ""]];
const ws = XLSX.utils.aoa_to_sheet(aoa);

const lastDataRow = 25;
for (let excelRow = 2; excelRow <= lastDataRow; excelRow++) {
  const g = XLSX.utils.encode_cell({ r: excelRow - 1, c: 6 });
  const h = XLSX.utils.encode_cell({ r: excelRow - 1, c: 7 });
  (ws as Record<string, unknown>)[g] = {
    f: `IF(AND(E${excelRow}<>"",F${excelRow}<>"",F${excelRow}>0),E${excelRow}+F${excelRow},"")`,
    t: "n",
  };
  (ws as Record<string, unknown>)[h] = {
    f: `IF(G${excelRow}="","",INT(G${excelRow}-TODAY()))`,
    t: "n",
  };
}

const dateFmt = "dd.mm.yyyy";
for (let excelRow = 2; excelRow <= lastDataRow; excelRow++) {
  const r = excelRow - 1;
  const eAddr = XLSX.utils.encode_cell({ r, c: 4 });
  const gAddr = XLSX.utils.encode_cell({ r, c: 6 });
  const eCell = (ws as Record<string, { t?: string; v?: unknown; z?: string }>)[eAddr];
  if (eCell && eCell.t === "n" && typeof eCell.v === "number") {
    eCell.z = dateFmt;
  }
  const gCell = (ws as Record<string, { z?: string }>)[gAddr];
  if (gCell) gCell.z = dateFmt;
}

if (!(ws as { "!ref"?: string })["!ref"]) {
  (ws as { "!ref"?: string })["!ref"] = `A1:H${lastDataRow}`;
} else {
  (ws as { "!ref"?: string })["!ref"] = `A1:H${lastDataRow}`;
}

(ws as { "!cols"?: { wch: number }[] })["!cols"] = [
  { wch: 28 },
  { wch: 22 },
  { wch: 10 },
  { wch: 20 },
  { wch: 14 },
  { wch: 18 },
  { wch: 22 },
  { wch: 18 },
];

XLSX.utils.book_append_sheet(wb, ws, "Kullanicilar");

const bin = XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true }) as number[];
await Deno.mkdir(`${Deno.cwd()}${sep}public${sep}templates`, { recursive: true });
await Deno.writeFile(outPath, new Uint8Array(bin));
console.log("Yazildi:", outPath);
