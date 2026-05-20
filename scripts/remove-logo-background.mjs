/**
 * Açık/gri arka planı şeffaflaştırır (ILSA SUPPORT logosu).
 * Kullanım: node scripts/remove-logo-background.mjs <girdi.png> <cikti.png>
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const __dirname = dirname(fileURLToPath(import.meta.url));
const input = resolve(process.argv[2] || '../assets/source-logo.png');
const output = resolve(process.argv[3] || '../public/logo2026.png');

mkdirSync(dirname(output), { recursive: true });

const { data, info } = await sharp(input)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;

for (let i = 0; i < data.length; i += channels) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const sat = max === 0 ? 0 : (max - min) / max;

  // Beyaz / açık gri zemin ve yumuşak gölge
  if (lum >= 246 && sat <= 0.09) {
    data[i + 3] = 0;
  } else if (lum >= 232 && sat <= 0.11) {
    data[i + 3] = Math.min(data[i + 3], Math.max(0, Math.round((246 - lum) * 16)));
  } else if (lum >= 218 && sat <= 0.09) {
    data[i + 3] = Math.min(data[i + 3], Math.max(0, Math.round((232 - lum) * 6)));
  }
}

await sharp(data, { raw: { width, height, channels: 4 } })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(output);

console.log(`OK: ${output} (${width}x${height})`);
