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
  for await (const line of rl) {
    n++;
    if (line.includes('"name":"kategoriler"')) {
      console.log('line', n, line.slice(0, 350));
      break;
    }
  }
})();
