/**
 * Cihaza özel Ed25519 anahtarı — özel anahtar machineId ile şifrelenir.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { machineIdSync } = require('node-machine-id');

function getMachineSecret() {
  try {
    return machineIdSync({ original: true });
  } catch {
    return 'ilsa-fallback-machine';
  }
}

function deriveAesKey(machineSecret) {
  return crypto.scryptSync(machineSecret, 'ilsa-device-key-v1', 32);
}

function encryptPem(pem, machineSecret) {
  const iv = crypto.randomBytes(12);
  const key = deriveAesKey(machineSecret);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(pem, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptPem(payloadB64, machineSecret) {
  const buf = Buffer.from(payloadB64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const key = deriveAesKey(machineSecret);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function createKeyPairPem() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicSpki: publicKey.export({ type: 'spki', format: 'der' }),
  };
}

function loadOrCreateDeviceKeys(userDataDir) {
  const keyPath = path.join(userDataDir, 'device_ed25519.enc');
  const machineSecret = getMachineSecret();

  if (fs.existsSync(keyPath)) {
    try {
      const enc = fs.readFileSync(keyPath, 'utf8');
      const privatePem = decryptPem(enc, machineSecret);
      const privateKey = crypto.createPrivateKey(privatePem);
      const publicKey = crypto.createPublicKey(privateKey);
      const publicSpki = publicKey.export({ type: 'spki', format: 'der' });
      return { privateKey, publicSpki };
    } catch {
      fs.unlinkSync(keyPath);
    }
  }

  const { privatePem, publicSpki } = createKeyPairPem();
  const enc = encryptPem(privatePem, machineSecret);
  fs.writeFileSync(keyPath, enc, { mode: 0o600 });
  return {
    privateKey: crypto.createPrivateKey(privatePem),
    publicSpki,
  };
}

function toBase64Url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function getPublicKeySpkiBase64Url(publicSpkiDer) {
  return toBase64Url(publicSpkiDer);
}

function signUtf8(privateKey, message) {
  const sig = crypto.sign(null, Buffer.from(message, 'utf8'), privateKey);
  return toBase64Url(sig);
}

function buildLoginMessage(username, hardwareId, timestampMs) {
  return ['ILSA-v1', 'LOGIN', username, hardwareId, String(timestampMs)].join('\n');
}

function buildApiMessage(method, path, timestampMs, tokenSha256) {
  return ['ILSA-v1', 'API', method.toUpperCase(), path, String(timestampMs), tokenSha256].join('\n');
}

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function signLogin(privateKey, username, hardwareId) {
  const ts = Date.now();
  const msg = buildLoginMessage(username, hardwareId, ts);
  return {
    deviceSignature: signUtf8(privateKey, msg),
    deviceSignatureTimestamp: ts,
  };
}

function signApiRequest(privateKey, method, urlPath, bearerToken) {
  const ts = Date.now();
  const tokenSha = sha256Hex(bearerToken);
  const msg = buildApiMessage(method, urlPath, ts, tokenSha);
  return {
    'X-Device-Signature': signUtf8(privateKey, msg),
    'X-Device-Timestamp': String(ts),
    'X-Device-Purpose': 'API',
  };
}

module.exports = {
  loadOrCreateDeviceKeys,
  getPublicKeySpkiBase64Url,
  signLogin,
  signApiRequest,
  sha256Hex,
};
