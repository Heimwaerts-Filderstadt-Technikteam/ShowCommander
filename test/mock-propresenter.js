// Minimaler ProPresenter-7.9-API-Mock (Port 1025) – protokolliert alle Aufrufe
const http = require('http');
const crypto = require('crypto');
const PORT = Number(process.env.PP_PORT) || 1025;
const timers = [{ id: { uuid: 'AAAA-1111', name: 'Gottesdienst-Countdown', index: 0 }, allows_overrun: false, countdown: { duration: 600 } }];
let stage = '';
const state = {}; // uuid -> {running, duration}

http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const json = (code, data) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(data === undefined ? '' : JSON.stringify(data)); };
    const data = body ? JSON.parse(body) : undefined;
    console.log(req.method, p, body ? body.slice(0, 140) : '');
    const find = ref => timers.find(t => t.id.uuid === ref || t.id.name === ref || String(t.id.index) === ref);
    let m;
    if (p === '/version') return json(200, { name: 'Testrechner', platform: 'mac', os_version: '14.0', host_description: 'ProPresenter 7.16', api_version: 'v1' });
    if (p === '/v1/timers' && req.method === 'GET') return json(200, timers);
    if (p === '/v1/timers' && req.method === 'POST') {
      const t = { id: { uuid: crypto.randomUUID().toUpperCase(), name: data.name, index: timers.length }, allows_overrun: data.allows_overrun, countdown: data.countdown };
      timers.push(t); return json(200, t);
    }
    if ((m = /^\/v1\/timer\/([^/]+)$/.exec(p)) && req.method === 'PUT') {
      const t = find(decodeURIComponent(m[1])); if (!t) return json(404);
      Object.assign(t, data); return json(200, t);
    }
    if ((m = /^\/v1\/timer\/([^/]+)\/(start|stop|reset)$/.exec(p))) {
      const t = find(decodeURIComponent(m[1])); if (!t) return json(404);
      state[t.id.uuid] = { ...(state[t.id.uuid] || {}), running: m[2] === 'start', duration: t.countdown?.duration };
      return json(204);
    }
    if (p === '/v1/stage/message' && req.method === 'PUT') { stage = data; return json(204); }
    if (p === '/v1/stage/message' && req.method === 'DELETE') { stage = ''; return json(204); }
    if (p === '/__state') return json(200, { timers, state, stage });
    json(404, { error: 'not found' });
  });
}).listen(PORT, () => console.log('ProPresenter-Mock auf Port ' + PORT));
