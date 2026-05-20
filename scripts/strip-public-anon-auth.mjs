import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'src');

const lineRes = [
  /^\s*['"]Authorization['"]:\s*`Bearer \$\{publicAnonKey\}`,?\s*\r?\n/gm,
  /^\s*Authorization:\s*`Bearer \$\{publicAnonKey\}`,?\s*\r?\n/gm,
];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(p);
    } else if (/\.(tsx|ts)$/.test(name)) {
      if (name === 'RemoteSupportPanel.tsx') continue;
      let c = fs.readFileSync(p, 'utf8');
      let n = c;
      for (const re of lineRes) n = n.replace(re, '');
      if (n !== c) {
        fs.writeFileSync(p, n);
        console.log('stripped', p);
      }
    }
  }
}

walk(root);
console.log('done');
