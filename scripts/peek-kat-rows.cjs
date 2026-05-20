const fs = require('fs');
const path = require('path');
const readline = require('readline');

(async () => {
  const rl = readline.createInterface({
    input: fs.createReadStream(path.join(__dirname, '..', 'ilsasup_ilsasupp_ort.json'), {
      encoding: 'utf8',
    }),
    crlfDelay: Infinity,
  });
  let n = 0;
  let inKat = false;
  let shown = 0;
  for await (const line of rl) {
    n++;
    if (line.includes('"name":"kategoriler"')) {
      inKat = true;
      continue;
    }
    if (!inKat) continue;
    const t = line.trim();
    if (t.startsWith('{')) {
      shown++;
      console.log('row', shown, line.slice(0, 500));
      if (line.includes('2026')) console.log('  ^ has 2026');
    }
    if (shown >= 8) break;
  }
})();
