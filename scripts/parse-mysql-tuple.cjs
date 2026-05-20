function parseMySQLDataLine(line) {
  const t = line.trim();
  if (!t.startsWith('(')) return null;
  const end = t.endsWith('),') || t.endsWith(');') ? t.length - 2 : t.lastIndexOf(')');
  if (end < 1) return null;
  return parseValueList(t.slice(1, end));
}

function parseValueList(s) {
  const out = [];
  let i = 0;
  const len = s.length;
  while (i < len) {
    while (i < len && /\s/.test(s[i])) i++;
    if (i >= len) break;
    if (s[i] === 'N' && s.slice(i, i + 4) === 'NULL') {
      out.push(null);
      i += 4;
      while (i < len && (s[i] === ',' || /\s/.test(s[i]))) i++;
      continue;
    }
    if (s[i] === "'") {
      i++;
      let str = '';
      while (i < len) {
        if (s[i] === "'" && s[i + 1] === "'") {
          str += "'";
          i += 2;
          continue;
        }
        if (s[i] === "'") {
          i++;
          break;
        }
        str += s[i++];
      }
      out.push(str);
      while (i < len && (s[i] === ',' || /\s/.test(s[i]))) i++;
      continue;
    }
    if (/[0-9-]/.test(s[i])) {
      let j = i;
      if (s[i] === '-') j++;
      while (j < len && /[0-9]/.test(s[j])) j++;
      if (j < len && s[j] === '.') {
        j++;
        while (j < len && /[0-9]/.test(s[j])) j++;
        out.push(parseFloat(s.slice(i, j)));
      } else {
        out.push(parseInt(s.slice(i, j), 10));
      }
      i = j;
      while (i < len && (s[i] === ',' || /\s/.test(s[i]))) i++;
      continue;
    }
    throw new Error('parse ' + s[i] + ' @' + i);
  }
  return out;
}

module.exports = { parseMySQLDataLine, parseValueList };
