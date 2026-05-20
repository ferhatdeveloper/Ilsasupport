const fs = require('fs');
const readline = require('readline');

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream(require('path').join(__dirname, '..', 'ilsasup_ilsasupp_ort.json'), {
      encoding: 'utf8',
    }),
    crlfDelay: Infinity,
  });
  let n = 0;
  let table = null;
  for await (const line of rl) {
    n++;
    if (line.includes('"type":"table"')) {
      const m = /"name":"([^"]+)"/.exec(line);
      table = m ? m[1] : '?';
      console.log('TABLE', n, table, line.slice(0, 120));
    }
    if (n > 5 && table === 'bilgi' && line.trim().startsWith('{')) {
      if (line.includes('2026-04-25') || line.includes('2026-04-26')) {
        console.log('SAMPLE bilgi 2026:', line.slice(0, 300));
        break;
      }
    }
    if (n > 500000) break;
  }
}

main().catch(console.error);
