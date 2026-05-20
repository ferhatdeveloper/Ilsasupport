/**
 * Yalnızca localhost — tarayıcı API isteklerine cihaz imzası ekler (anahtar dışarı çıkmaz).
 */
const http = require('http');
const { URL } = require('url');
const { signApiRequest } = require('./device_keys');

function startSignProxy({ privateKey, allowedOrigin, allowedApiHost }) {
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || '';
    const corsOrigin = allowedOrigin.replace(/\/$/, '');

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': origin === corsOrigin ? corsOrigin : '',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Hardware-ID',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

    if (req.method !== 'POST' || req.url !== '/forward') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    if (origin && origin !== corsOrigin) {
      res.writeHead(403);
      res.end('Forbidden origin');
      return;
    }

    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const targetUrl = String(payload.targetUrl || '');
        const method = String(payload.method || 'GET').toUpperCase();
        const headers = payload.headers && typeof payload.headers === 'object' ? payload.headers : {};
        const reqBody = payload.body;

        const target = new URL(targetUrl);
        if (target.hostname !== allowedApiHost && !target.host.endsWith(allowedApiHost)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Hedef API izinli değil' }));
          return;
        }

        const auth = String(headers.Authorization || headers.authorization || '');
        const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
        if (!bearer) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bearer token gerekli' }));
          return;
        }

        const pathForSig = target.pathname;
        const signHeaders = signApiRequest(privateKey, method, pathForSig, bearer);
        const forwardHeaders = {
          ...headers,
          ...signHeaders,
        };

        const fetchOpts = { method, headers: forwardHeaders };
        if (reqBody != null && method !== 'GET' && method !== 'HEAD') {
          forwardHeaders['Content-Type'] = forwardHeaders['Content-Type'] || 'application/json';
          fetchOpts.body = typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody);
        }

        const upstream = await fetch(targetUrl, fetchOpts);
        const text = await upstream.text();
        const outHeaders = {
          'Content-Type': upstream.headers.get('content-type') || 'application/json',
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Expose-Headers':
            'X-New-Token, X-New-Access-Token, Content-Disposition, Content-Length, X-Download-Token, X-Download-Prepare-Mode',
        };
        const newTok = upstream.headers.get('X-New-Token');
        const newJwt = upstream.headers.get('X-New-Access-Token');
        if (newTok) outHeaders['X-New-Token'] = newTok;
        if (newJwt) outHeaders['X-New-Access-Token'] = newJwt;

        res.writeHead(upstream.status, outHeaders);
        res.end(text);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin });
        res.end(JSON.stringify({ error: e.message || 'Proxy hatası' }));
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        port: addr.port,
        close: () =>
          new Promise((r) => {
            server.close(() => r());
          }),
      });
    });
    server.on('error', reject);
  });
}

module.exports = { startSignProxy };
