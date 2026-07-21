const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const { machineIdSync } = require('node-machine-id');
const {
  loadOrCreateDeviceKeys,
  getPublicKeySpkiBase64Url,
  signLogin,
  signApiRequest,
} = require('./device_keys');
const { startSignProxy } = require('./sign_proxy');
const rememberAuth = require('./remember_auth');

function loadConfig() {
  const p = path.join(__dirname, 'config.json');
  const defaults = {
    webUrl: 'https://ilsasupport.com',
    apiBase: 'https://ilsasupport.com/make-server-47081311',
  };
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(p, 'utf8')) };
  } catch {
    return defaults;
  }
}

const config = loadConfig();

function getClientVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

async function reportElectronClientError(payload) {
  try {
    const apiBase = config.apiBase.replace(/\/$/, '');
    await fetch(`${apiBase}/electron-client-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        hardwareId: getHardwareId(),
        clientVersion: getClientVersion(),
      }),
    });
  } catch {
    /* ignore */
  }
}

/**
 * Electron 28+: shell.openExternal Promise<void> döner (eski boolean değil).
 * undefined kontrolü yanlışlıkla "açılamadı" hatası üretiyordu.
 */
async function openUrlInDefaultBrowser(url) {
  try {
    await shell.openExternal(url, { activate: true });
    return { success: true };
  } catch (e) {
    if (process.platform === 'win32') {
      try {
        spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
        return { success: true };
      } catch {
        /* fall through */
      }
    }
    return { success: false, error: e?.message || 'Tarayıcı açılamadı' };
  }
}

function getHardwareIdFile() {
  return path.join(app.getPath('userData'), 'hardware-id.txt');
}

function getHardwareId() {
  try {
    return machineIdSync({ original: true });
  } catch {
    const fp = getHardwareIdFile();
    try {
      const saved = fs.readFileSync(fp, 'utf8').trim();
      if (saved) return saved;
    } catch {
      /* ilk çalıştırma */
    }
    const fallback = `hw-fallback-${require('crypto').randomUUID()}`;
    try {
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, fallback, 'utf8');
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

function getDeviceInfo() {
  return {
    platform: process.platform,
    arch: process.arch,
    app: 'ilsa-support-desktop',
    channel: 'portable',
    version: app.getVersion(),
  };
}

let mainWindow = null;
let webWindow = null;
let splashWindow = null;
let pendingUpdateInfo = null;
let deviceKeys = null;
let signProxy = null;
/** Giriş sonrası «uygulama / tarayıcı» seçimi için bekleyen oturum */
let pendingLogin = null;

function compareSemver(a, b) {
  const pa = String(a || '0').trim().split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '0').trim().split('.').map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

function clearPendingLogin() {
  pendingLogin = null;
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message || `Zaman aşımı (${ms}ms)`)), ms);
    }),
  ]);
}

function focusLoginWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
}

function minimizeLoginWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
}

/** Giriş tamamlandıktan sonra giriş penceresini kapat (web penceresi açık kalabilir) */
function closeLoginWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
    mainWindow = null;
  }
}

function ensureDeviceKeys() {
  if (!deviceKeys) {
    deviceKeys = loadOrCreateDeviceKeys(app.getPath('userData'));
  }
  return deviceKeys;
}

async function ensureSignProxy() {
  if (signProxy) return signProxy;
  const keys = ensureDeviceKeys();
  const webUrl = config.webUrl.replace(/\/$/, '');
  const apiHost = new URL(config.apiBase).hostname;
  signProxy = await startSignProxy({
    privateKey: keys.privateKey,
    allowedOrigin: webUrl,
    allowedApiHost: apiHost,
  });
  return signProxy;
}

async function checkDesktopVersion() {
  const version = app.getVersion();
  const apiBase = config.apiBase.replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `${apiBase}/desktop-app-config?version=${encodeURIComponent(version)}`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) {
      return { ok: true, offline: true, clientVersion: version };
    }
    const data = await response.json();
    const updateRequired = !!data.updateRequired;
    const updateAvailable =
      !!data.updateAvailable ||
      (data.latestVersion && compareSemver(version, data.latestVersion) < 0);
    const base = {
      clientVersion: version,
      requiredVersion: data.requiredVersion,
      latestVersion: data.latestVersion,
      downloadUrl: data.downloadUrl,
      downloadPath: data.downloadPath,
      updateRequired,
      updateAvailable,
    };
    if (updateRequired) {
      return {
        ok: false,
        ...base,
        error: `Güncel sürüm gerekli (${data.requiredVersion}). Yeni portable indirin ve çalıştırın.`,
      };
    }
    return { ok: true, ...base };
  } catch {
    clearTimeout(timeout);
    return { ok: true, offline: true, clientVersion: version };
  }
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 320,
    height: 200,
    frame: false,
    transparent: false,
    backgroundColor: '#000000',
    resizable: false,
    center: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    show: false,
  });
  splashWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show();
  });
  splashWindow.loadFile(path.join(__dirname, 'renderer', 'splash.html')).catch((err) => {
    console.error('splash loadFile:', err);
    closeSplash();
  });
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

function followRedirectGet(url, maxRedirects, onProgress) {
  return new Promise((resolve, reject) => {
    const visit = (targetUrl, left) => {
      let parsed;
      try {
        parsed = new URL(targetUrl);
      } catch (e) {
        reject(e);
        return;
      }
      const mod = parsed.protocol === 'https:' ? https : http;
      mod
        .get(targetUrl, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location &&
            left > 0
          ) {
            const next = new URL(res.headers.location, targetUrl).href;
            res.resume();
            visit(next, left - 1);
            return;
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`İndirme hatası HTTP ${res.statusCode}`));
            res.resume();
            return;
          }
          resolve({ res, parsed });
        })
        .on('error', reject);
    };
    visit(url, maxRedirects);
  });
}

async function downloadPortableUpdate(downloadUrl, onProgress) {
  const url = String(downloadUrl || pendingUpdateInfo?.downloadUrl || '').trim();
  if (!url) throw new Error('İndirme adresi yok');

  const parsed = new URL(url);
  const filename =
    path.basename(parsed.pathname) ||
    `ILSA-Support-Portable-${pendingUpdateInfo?.latestVersion || app.getVersion()}.exe`;
  const dest = path.join(app.getPath('downloads'), filename);

  const { res } = await followRedirectGet(url, 5);
  const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
  let downloaded = 0;

  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    res.on('data', (chunk) => {
      downloaded += chunk.length;
      if (onProgress) onProgress({ downloaded, total, percent: total ? Math.round((downloaded / total) * 100) : null });
    });
    res.pipe(file);
    file.on('finish', () => file.close(resolve));
    file.on('error', (e) => {
      fs.unlink(dest, () => reject(e));
    });
    res.on('error', reject);
  });

  return { success: true, path: dest, filename };
}

function createLoginWindow() {
  closeSplash();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 420,
    height: 640,
    backgroundColor: '#000000',
    resizable: false,
    maximizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    title: 'ILSA Support',
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      closeSplash();
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'login.html')).catch((err) => {
    console.error('login loadFile:', err);
    closeSplash();
  });
  mainWindow.webContents.once('did-finish-load', () => {
    if (
      pendingUpdateInfo?.updateAvailable &&
      !pendingUpdateInfo?.updateRequired &&
      mainWindow &&
      !mainWindow.isDestroyed()
    ) {
      mainWindow.webContents.send('optional-update', pendingUpdateInfo);
    }
  });
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createUpdateWindow(info) {
  closeSplash();
  pendingUpdateInfo = info;
  mainWindow = new BrowserWindow({
    width: 420,
    height: 520,
    backgroundColor: '#000000',
    resizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    title: 'ILSA Support — Güncelleme',
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'update.html'));
}

ipcMain.handle('get-hardware-id', () => getHardwareId());

ipcMain.handle('get-config', () => ({
  webUrl: config.webUrl.replace(/\/$/, ''),
  apiBase: config.apiBase.replace(/\/$/, ''),
}));

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-update-info', () => pendingUpdateInfo);

ipcMain.handle('check-app-update', async () => {
  const info = await checkDesktopVersion();
  pendingUpdateInfo = info;
  return info;
});

ipcMain.handle('open-download-url', async () => {
  const url = pendingUpdateInfo?.downloadUrl;
  if (url) return await openUrlInDefaultBrowser(url);
  return { success: false, error: 'İndirme adresi yok' };
});

ipcMain.handle('download-update', async (event) => {
  const url = pendingUpdateInfo?.downloadUrl;
  if (!url) return { success: false, error: 'İndirme adresi yok' };
  const wc = event.sender;
  try {
    const result = await downloadPortableUpdate(url, (p) => {
      try {
        wc.send('download-progress', p);
      } catch {
        /* pencere kapanmış olabilir */
      }
    });
    await shell.showItemInFolder(result.path);
    return result;
  } catch (e) {
    return { success: false, error: e.message || 'İndirme başarısız' };
  }
});

ipcMain.handle('open-external-url', async (_event, rawUrl) => {
  const url = String(rawUrl || '').trim();
  if (!url) return { success: false, error: 'URL gerekli' };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { success: false, error: 'Geçersiz protokol' };
    }
    const webHost = new URL(config.webUrl.replace(/\/$/, '') + '/').hostname;
    const apiHost = new URL(config.apiBase.replace(/\/$/, '') + '/').hostname;
    const host = parsed.hostname.toLowerCase();
    if (host !== webHost.toLowerCase() && host !== apiHost.toLowerCase()) {
      return { success: false, error: 'Yalnızca ILSA Support adresleri açılabilir' };
    }
    return await openUrlInDefaultBrowser(url);
  } catch (e) {
    return { success: false, error: e.message || 'Tarayıcı açılamadı' };
  }
});

ipcMain.handle('signed-fetch', async (_event, payload) => {
  const keys = ensureDeviceKeys();
  const targetUrl = String(payload?.targetUrl || '');
  const method = String(payload?.method || 'GET').toUpperCase();
  const headers = payload?.headers && typeof payload.headers === 'object' ? payload.headers : {};
  const body = payload?.body;

  const target = new URL(targetUrl);
  const auth = String(headers.Authorization || headers.authorization || '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!bearer) {
    return { status: 400, headers: { 'Content-Type': 'application/json' }, body: '{"error":"Bearer gerekli"}' };
  }

  const signHeaders = signApiRequest(keys.privateKey, method, target.pathname, bearer);
  const forwardHeaders = { ...headers, ...signHeaders };
  const fetchOpts = { method, headers: forwardHeaders };
  if (body != null && method !== 'GET' && method !== 'HEAD') {
    fetchOpts.body = body;
  }

  const upstream = await fetch(targetUrl, fetchOpts);
  const text = await upstream.text();
  const outHeaders = {};
  upstream.headers.forEach((v, k) => {
    outHeaders[k] = v;
  });
  return { status: upstream.status, headers: outHeaders, body: text };
});

/** İmzalı API isteği (tarayıcı handoff vb.) */
async function signedApiRequest(method, pathSuffix, bearerToken, hardwareId, body) {
  const keys = ensureDeviceKeys();
  const apiBase = config.apiBase.replace(/\/$/, '');
  const path = pathSuffix.startsWith('/') ? pathSuffix : `/${pathSuffix}`;
  const url = `${apiBase}${path}`;
  const target = new URL(url);
  const signHeaders = signApiRequest(
    keys.privateKey,
    method.toUpperCase(),
    target.pathname,
    bearerToken,
  );
  const headers = {
    Authorization: `Bearer ${bearerToken}`,
    'X-Hardware-ID': hardwareId,
    ...signHeaders,
  };
  const methodUp = method.toUpperCase();
  const fetchOpts = { method: methodUp, headers };
  if (body != null && methodUp !== 'GET' && methodUp !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
    fetchOpts.body = JSON.stringify(body);
  }
  return fetch(url, fetchOpts);
}

async function readJsonResponse(res) {
  const text = await res.text();
  if (!text) return { data: {}, text: '' };
  try {
    return { data: JSON.parse(text), text };
  } catch {
    const snippet = text.slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(
      res.ok
        ? `Sunucu yanıtı okunamadı: ${snippet}`
        : `Sunucu hatası (${res.status}): ${snippet}`,
    );
  }
}

/** Oturumu main process'te doğrula (imza burada); tarayıcıda beyaz ekran / çift istek riski yok */
async function bootstrapSecureSession(oneTimeToken, hardwareId) {
  const keys = ensureDeviceKeys();
  const apiBase = config.apiBase.replace(/\/$/, '');
  const profileUrl = `${apiBase}/profile-secure`;
  const pathForSig = new URL(profileUrl).pathname;
  const signHeaders = signApiRequest(keys.privateKey, 'GET', pathForSig, oneTimeToken);

  const res = await fetch(profileUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${oneTimeToken}`,
      'X-Hardware-ID': hardwareId,
      ...signHeaders,
    },
  });

  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    const code = data.errorCode ? ` [${data.errorCode}]` : '';
    throw new Error((data.error || `profile-secure ${res.status}`) + code);
  }

  if (!data.user) {
    throw new Error('profile-secure: kullanıcı verisi yok');
  }

  const rotated = res.headers.get('x-new-token') || res.headers.get('X-New-Token') || oneTimeToken;
  return { secureToken: rotated, user: data.user };
}

function injectWebSession(webContents, { secureToken, hardwareId, user }) {
  const payload = JSON.stringify({
    secureToken,
    hardwareId,
    user,
  });
  return webContents.executeJavaScript(`
    (function () {
      const p = ${payload};
      localStorage.setItem('secureToken', p.secureToken);
      localStorage.setItem('hardwareId', p.hardwareId);
      localStorage.setItem('user', JSON.stringify(p.user));
      sessionStorage.setItem('ilsaElectronBoot', '1');
    })();
  `);
}

/** Giriş token'ı yalnızca bir kez profile-secure ile tüketilir */
async function ensurePendingBootstrapped() {
  if (!pendingLogin) {
    throw new Error('Oturum bulunamadı. Lütfen yeniden giriş yapın.');
  }
  if (pendingLogin.secureToken) {
    return {
      secureToken: pendingLogin.secureToken,
      user: pendingLogin.user,
      hardwareId: pendingLogin.hardwareId,
    };
  }
  const boot = await bootstrapSecureSession(
    pendingLogin.oneTimeToken,
    pendingLogin.hardwareId,
  );
  pendingLogin.secureToken = boot.secureToken;
  pendingLogin.user = boot.user || pendingLogin.user;
  pendingLogin.oneTimeToken = null;
  return {
    secureToken: boot.secureToken,
    user: pendingLogin.user,
    hardwareId: pendingLogin.hardwareId,
  };
}

async function openWebApp(secureToken, hardwareId, userFromSignin) {
  await ensureSignProxy();
  const webUrl = config.webUrl.replace(/\/$/, '');
  const user = userFromSignin;

  const openUrl = `${webUrl}/#electronShell=1`;

  const attachSession = (wc) => {
    wc.once('did-finish-load', async () => {
      try {
        await injectWebSession(wc, {
          secureToken,
          hardwareId,
          user,
        });
        wc.reload();
      } catch (e) {
        console.error('injectWebSession:', e);
      }
    });
  };

  if (webWindow && !webWindow.isDestroyed()) {
    attachSession(webWindow.webContents);
    webWindow.loadURL(openUrl);
    webWindow.show();
    webWindow.focus();
    closeLoginWindow();
    return;
  }

  webWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'web_preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    autoHideMenuBar: true,
    title: 'ILSA Support',
  });

  webWindow.on('closed', () => {
    webWindow = null;
  });

  attachSession(webWindow.webContents);
  webWindow.loadURL(openUrl);
  webWindow.once('ready-to-show', () => {
    webWindow.show();
    webWindow.focus();
    closeLoginWindow();
  });
  if (webWindow.isVisible()) {
    webWindow.focus();
    closeLoginWindow();
  }
}

async function performElectronSignin(username, password) {
  const hardwareId = getHardwareId();
  const apiBase = config.apiBase.replace(/\/$/, '');
  const user = String(username || '').trim().toLowerCase();

  try {
    const keys = ensureDeviceKeys();
    const loginSig = signLogin(keys.privateKey, user, hardwareId);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
      response = await fetch(`${apiBase}/electron-signin-secure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user,
          password,
          hardwareId,
          deviceInfo: getDeviceInfo(),
          devicePublicKey: getPublicKeySpkiBase64Url(keys.publicSpki),
          deviceSignature: loginSig.deviceSignature,
          deviceSignatureTimestamp: loginSig.deviceSignatureTimestamp,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json();
    if (!response.ok) {
      const errMsg = data.error || 'Giriş başarısız';
      void reportElectronClientError({
        username: user,
        errorCode: data.errorCode,
        message: errMsg,
        detail: { status: response.status },
      });
      return {
        success: false,
        error: errMsg,
        errorCode: data.errorCode,
        downloadUrl: data.downloadUrl,
        requiredVersion: data.requiredVersion,
      };
    }

    pendingLogin = {
      oneTimeToken: data.oneTimeToken,
      hardwareId,
      user: data.user,
    };

    return { success: true, needsContinueChoice: true, user: data.user };
  } catch (e) {
    const errMsg = e.message || 'Bağlantı hatası';
    void reportElectronClientError({ username: user, message: errMsg, errorCode: 'SIGNIN_EXCEPTION' });
    return { success: false, error: errMsg };
  }
}

async function performContinueInBrowser() {
  if (!pendingLogin) {
    return { success: false, error: 'Oturum bulunamadı. Lütfen yeniden giriş yapın.' };
  }
  try {
    const session = await withTimeout(
      ensurePendingBootstrapped(),
      30000,
      'Oturum hazırlanırken zaman aşımı.',
    );
    const res = await withTimeout(
      signedApiRequest(
        'POST',
        '/desktop-browser-handoff',
        session.secureToken,
        session.hardwareId,
        {},
      ),
      20000,
      'Tarayıcı bağlantısı oluşturulurken zaman aşımı.',
    );
    const { data } = await readJsonResponse(res);
    if (!res.ok) {
      return {
        success: false,
        error: data.error || 'Tarayıcı oturumu oluşturulamadı',
        errorCode: data.errorCode,
      };
    }
    if (!data.handoffId) {
      return { success: false, error: 'Sunucu handoff kodu döndürmedi' };
    }
    const webUrl = config.webUrl.replace(/\/$/, '');
    const id = encodeURIComponent(data.handoffId);
    const handoffUrl = `${webUrl}/?browserHandoff=${id}`;
    const opened = await openUrlInDefaultBrowser(handoffUrl);
    if (!opened.success) {
      try {
        clipboard.writeText(handoffUrl);
      } catch {
        /* ignore */
      }
      return {
        success: false,
        error: `Tarayıcı otomatik açılamadı. Bağlantı panoya kopyalandı:\n${handoffUrl}`,
        handoffUrl,
      };
    }
    clearPendingLogin();
    closeSplash();
    minimizeLoginWindow();
    return { success: true, handoffUrl };
  } catch (e) {
    console.error('performContinueInBrowser:', e);
    const msg = String(e.message || 'Tarayıcı açılamadı');
    if (msg.includes('TOKEN_INVALID') || msg.includes('zaten kullanıldı')) {
      clearPendingLogin();
      return {
        success: false,
        error: 'Oturum kodu kullanıldı. Lütfen tekrar giriş yapın.',
        errorCode: 'TOKEN_INVALID',
      };
    }
    return { success: false, error: msg, errorCode: e.errorCode };
  }
}

async function tryRememberedAutoLogin() {
  const creds = rememberAuth.loadRemembered();
  if (!creds?.username || !creds?.password) return false;
  const sign = await performElectronSignin(creds.username, creds.password);
  if (!sign.success) {
    rememberAuth.clearRemembered();
    return false;
  }
  const browser = await performContinueInBrowser();
  return !!browser.success;
}

ipcMain.handle('get-remember-prefill', async () => rememberAuth.getRememberPrefill());

ipcMain.handle('signin', async (_event, { username, password, rememberMe }) => {
  const result = await performElectronSignin(username, password);
  if (result.success) {
    if (rememberMe) {
      rememberAuth.saveRemembered(username, password);
    } else {
      rememberAuth.clearRemembered();
    }
  }
  return result;
});

ipcMain.handle('continue-in-app', async () => {
  if (!pendingLogin) {
    return { success: false, error: 'Oturum bulunamadı. Lütfen yeniden giriş yapın.' };
  }
  try {
    const session = await withTimeout(
      ensurePendingBootstrapped(),
      30000,
      'Oturum hazırlanırken zaman aşımı.',
    );
    await withTimeout(
      openWebApp(session.secureToken, session.hardwareId, session.user),
      45000,
      'Site penceresi açılırken zaman aşımı. İnternet bağlantınızı kontrol edin.',
    );
    clearPendingLogin();
    closeLoginWindow();
    return { success: true };
  } catch (e) {
    console.error('continue-in-app:', e);
    focusLoginWindow();
    const msg = String(e.message || 'Site açılamadı');
    if (msg.includes('TOKEN_INVALID') || msg.includes('zaten kullanıldı')) {
      clearPendingLogin();
      return {
        success: false,
        error: 'Oturum kodu kullanıldı. Lütfen giriş penceresinden tekrar giriş yapın.',
        errorCode: 'TOKEN_INVALID',
      };
    }
    return { success: false, error: msg, errorCode: e.errorCode };
  }
});

ipcMain.handle('continue-in-browser', async () => {
  const result = await performContinueInBrowser();
  if (!result.success) focusLoginWindow();
  return result;
});

ipcMain.handle('signup', async (_event, { username, password, name }) => {
  const hardwareId = getHardwareId();
  const apiBase = config.apiBase.replace(/\/$/, '');

  try {
    const response = await fetch(`${apiBase}/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hardware-ID': hardwareId,
      },
      body: JSON.stringify({
        username: String(username || '').trim().toLowerCase(),
        password,
        name: String(name || '').trim(),
        hardwareId,
        deviceInfo: getDeviceInfo(),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const errMsg = data.error || 'Kayıt başarısız';
      void reportElectronClientError({
        username: String(username || '').trim().toLowerCase(),
        errorCode: data.errorCode,
        message: errMsg,
        detail: { status: response.status },
      });
      return {
        success: false,
        error: errMsg,
        errorCode: data.errorCode,
        downloadUrl: data.downloadUrl,
      };
    }
    return {
      success: true,
      message:
        data.message ||
        'Kayıt alındı. Yönetici hesap ve cihaz onayından sonra giriş yapabilirsiniz.',
    };
  } catch (e) {
    const errMsg = e.message || 'Bağlantı hatası';
    void reportElectronClientError({
      username: String(username || '').trim().toLowerCase(),
      message: errMsg,
      errorCode: 'SIGNUP_EXCEPTION',
    });
    return { success: false, error: errMsg };
  }
});

const STARTUP_LOGIN_WATCHDOG_MS = 4000;

app.whenReady().then(() => {
  createSplash();

  let loginOpened = false;
  const openLoginOnce = () => {
    if (loginOpened) return;
    loginOpened = true;
    createLoginWindow();
  };

  const watchdog = setTimeout(() => {
    console.warn('[boot] login watchdog — sürüm kontrolü beklenmeden giriş açılıyor');
    openLoginOnce();
  }, STARTUP_LOGIN_WATCHDOG_MS);

  void (async () => {
    try {
      const ver = await checkDesktopVersion();
      pendingUpdateInfo = ver;
      clearTimeout(watchdog);
      if (!ver.ok && ver.updateRequired) {
        closeSplash();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.close();
          mainWindow = null;
        }
        createUpdateWindow(ver);
        return;
      }
      openLoginOnce();
      if (
        ver.updateAvailable &&
        !ver.updateRequired &&
        mainWindow &&
        !mainWindow.isDestroyed()
      ) {
        mainWindow.webContents.once('did-finish-load', () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('optional-update', ver);
          }
        });
      }
    } catch (e) {
      clearTimeout(watchdog);
      console.error('checkDesktopVersion:', e);
      openLoginOnce();
    }
  })();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  if (signProxy?.close) await signProxy.close();
});
