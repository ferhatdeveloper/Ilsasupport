const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream(path.join(__dirname, '..', 'ilsasup_ilsasupp_ort.json'), {
      encoding: 'utf8',
    }),
    crlfDelay: Infinity,
  });
  let table = null;
  let count = 0;
  for await (const line of rl) {
    if (line.includes('"type":"table"')) {
      const m = /"name":"([^"]+)"/.exec(line);
      table = m ? m[1] : null;
      if (table === 'kategoriler') console.log('FOUND kategoriler header:', line.slice(0, 250));
      continue;
    }
    if (table === 'kategoriler' && line.trim().startsWith('{')) {
      count++;
      if (count <= 3) console.log('kat row', count, line.slice(0, 400));
      if (line.includes('2026')) console.log('kat 2026:', line.slice(0, 400));
      if (count >= 5) break;
    }
    if (table === 'bilgi' && table !== 'kategoriler') {
      /* skip bilgi body until kategoriler - file order is bilgi first */
    }
  }
}

main().catch(console.error);
