import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '..', 'src');

const OLD = '`https://${projectId}.supabase.co/functions/v1/make-server-47081311';

function mergeInfoImport(content) {
  const re =
    /import\s+\{([^}]*)\}\s+from\s+(['"][^'"]*supabase\/info['"])\s*;/g;
  const matches = [...content.matchAll(re)];
  if (matches.length === 0) return content;

  const first = matches[0];
  const names = first[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const set = new Set(names);
  set.add('apiFunctionsBase');

  const merged = `import { ${[...set].sort().join(', ')} } from ${first[2]};`;

  let firstKept = false;
  return content.replace(re, () => {
    if (!firstKept) {
      firstKept = true;
      return merged;
    }
    return '';
  });
}

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(p);
    } else if (/\.(tsx|ts)$/.test(name)) {
      if (p.includes(`supabase${path.sep}functions`)) continue;
      let c = fs.readFileSync(p, 'utf8');
      if (!c.includes(OLD)) continue;
      let n = c.split(OLD).join('`${apiFunctionsBase}');
      n = mergeInfoImport(n);

      if (!/\bapiFunctionsBase\b/.test(n)) {
        const relToInfo = path
          .relative(path.dirname(p), path.join(srcRoot, 'utils', 'supabase', 'info'))
          .split(path.sep)
          .join('/');
        const importPath = relToInfo.startsWith('.') ? relToInfo : `./${relToInfo}`;
        const insert = `import { apiFunctionsBase } from '${importPath}';\n`;
        const firstImport = n.search(/^import\s/m);
        if (firstImport >= 0) {
          n = n.slice(0, firstImport) + insert + n.slice(firstImport);
        } else {
          n = insert + n;
        }
      }

      fs.writeFileSync(p, n);
      console.log('updated', p);
    }
  }
}

walk(srcRoot);
console.log('done');
