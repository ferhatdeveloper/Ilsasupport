/** Masaüstü uygulamasının tarayıcıya aktardığı oturum parametreleri (hash veya query). */
/** Masaüstünden tarayıcıya tek kullanımlık oturum aktarımı (#browserHandoff=…) */
export function readBrowserHandoffFromLocation(loc: Location = window.location): string | null {
  const fromQuery = new URLSearchParams(loc.search).get('browserHandoff');
  const rawHash = loc.hash.replace(/^#/, '').trim();
  const hashParams = rawHash
    ? new URLSearchParams(rawHash.startsWith('?') ? rawHash.slice(1) : rawHash)
    : null;
  const fromHash = hashParams?.get('browserHandoff');
  const id = (fromHash ?? fromQuery)?.trim();
  return id || null;
}

export function readDesktopAuthFromLocation(loc: Location = window.location): {
  secureToken: string | null;
  hwId: string | null;
  signPort: number | null;
  electronShell: boolean;
} {
  const fromQuery = new URLSearchParams(loc.search);
  let secureToken = fromQuery.get('secureToken');
  let hwId = fromQuery.get('hwId');
  let signPortRaw = fromQuery.get('signPort');

  const rawHash = loc.hash.replace(/^#/, '').trim();
  const hashParams = rawHash
    ? new URLSearchParams(rawHash.startsWith('?') ? rawHash.slice(1) : rawHash)
    : null;

  if (hashParams) {
    secureToken = hashParams.get('secureToken') ?? secureToken;
    hwId = hashParams.get('hwId') ?? hwId;
    signPortRaw = hashParams.get('signPort') ?? signPortRaw;
  }

  const signPort = signPortRaw ? parseInt(signPortRaw, 10) : null;
  const electronShell =
    fromQuery.get('electronShell') === '1' ||
    hashParams?.get('electronShell') === '1';

  return {
    secureToken: secureToken?.trim() || null,
    hwId: hwId?.trim() || null,
    signPort: signPort != null && Number.isFinite(signPort) ? signPort : null,
    electronShell,
  };
}

export function stripDesktopAuthFromLocation(loc: Location = window.location): string {
  const path = loc.pathname || '/';
  const search = new URLSearchParams(loc.search);
  search.delete('secureToken');
  search.delete('hwId');
  search.delete('signPort');
  search.delete('electronShell');
  search.delete('browserHandoff');
  search.delete('token');
  const view = search.get('view');
  const q =
    view === 'admin'
      ? '?view=admin'
      : [...search.entries()].length
        ? `?${search.toString()}`
        : '';
  return `${path}${q}`;
}
