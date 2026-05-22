const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

function rememberFilePath() {
  return path.join(app.getPath('userData'), 'ilsa-remember.dat');
}

function encryptPayload(obj) {
  const raw = JSON.stringify(obj);
  if (safeStorage?.isEncryptionAvailable?.()) {
    return safeStorage.encryptString(raw);
  }
  return Buffer.from(raw, 'utf8');
}

function decryptPayload(buf) {
  if (!buf || !buf.length) return null;
  try {
    const raw = safeStorage?.isEncryptionAvailable?.()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveRemembered(username, password) {
  const data = encryptPayload({
    v: 1,
    username: String(username || '').trim().toLowerCase(),
    password: String(password || ''),
    savedAt: new Date().toISOString(),
  });
  fs.mkdirSync(path.dirname(rememberFilePath()), { recursive: true });
  fs.writeFileSync(rememberFilePath(), data);
}

function loadRemembered() {
  try {
    const buf = fs.readFileSync(rememberFilePath());
    const obj = decryptPayload(buf);
    if (!obj?.username || !obj?.password) return null;
    return { username: obj.username, password: obj.password };
  } catch {
    return null;
  }
}

function clearRemembered() {
  try {
    fs.unlinkSync(rememberFilePath());
  } catch {
    /* ignore */
  }
}

function getRememberPrefill() {
  try {
    const buf = fs.readFileSync(rememberFilePath());
    const obj = decryptPayload(buf);
    if (!obj?.username) return { hasRemember: false, username: '' };
    return { hasRemember: true, username: obj.username };
  } catch {
    return { hasRemember: false, username: '' };
  }
}

module.exports = {
  saveRemembered,
  loadRemembered,
  clearRemembered,
  getRememberPrefill,
};
