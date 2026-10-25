// Winziger HTTP-Router ohne Abhängigkeiten (Express-ähnlich)
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function createApp() {
  const routes = [];
  const add = method => (pattern, ...handlers) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:([A-Za-z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    routes.push({ method, re, keys, handlers });
  };
  const app = {
    get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), delete: add('DELETE'), all: add('*'),
    static(prefix, dir) {
      app.get(prefix + '/(.*)', (req, res) => {
        const rel = decodeURIComponent(req.path.slice(prefix.length + 1));
        const file = path.normalize(path.join(dir, rel));
        if (!file.startsWith(dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.status(404).end('Not found');
        res.sendFile(file);
      });
    },
    async handle(req, res) {
      decorate(req, res);
      // CORS für die API (Stream-Deck-Plugin, eigene Tools im LAN)
      if (req.path.startsWith('/api/')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
        if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
      }
      try {
        for (const r of routes) {
          if (r.method !== '*' && r.method !== req.method && !(r.method === 'GET' && req.method === 'HEAD')) continue;
          const m = r.re.exec(req.path);
          if (!m) continue;
          req.params = {};
          r.keys.forEach((k, i) => { req.params[k] = decodeURIComponent(m[i + 1]); });
          if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) req.body = await readBody(req, req.path.startsWith('/api/import') ? 40e6 : 2e6);
          else req.body = {};
          let i = 0;
          const next = async () => { const h = r.handlers[i++]; if (h) await h(req, res, next); };
          await next();
          return;
        }
        res.status(404).json({ error: 'Nicht gefunden' });
      } catch (err) {
        console.error(err);
        if (!res.headersSent) res.status(err.statusCode || 500).json({ error: err.message });
      }
    },
  };
  return app;
}

function readBody(req, limit = 2e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Zu groß'), { statusCode: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(Object.assign(new Error('Ungültiges JSON'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

function decorate(req, res) {
  const u = new URL(req.url, 'http://localhost');
  req.path = u.pathname;
  req.query = Object.fromEntries(u.searchParams);
  req.get = h => req.headers[h.toLowerCase()];
  res.status = code => { res.statusCode = code; return res; };
  res.set = (k, v) => { res.setHeader(k, v); return res; };
  res.json = obj => { if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
  res.send = body => res.end(body);
  res.sendFile = file => {
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(file).pipe(res);
  };
}

module.exports = { createApp };
