// ShowCommander – Rundown-Server mit ChurchTools-Integration
const path = require('path');
const http = require('http');
const { createApp } = require('./lib/mini');
const store = require('./lib/store');
const ct = require('./lib/churchtools');
const show = require('./lib/show');
const pp = require('./lib/propresenter');
const templates = require('./lib/templates');
const retention = require('./lib/retention');
const importer = require('./lib/importer');
const Timing = require('./public/js/timing');

const PORT = Number(process.env.PORT) || 8080;
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const API_KEY = process.env.API_KEY || '';
const PUB = path.join(__dirname, 'public');

const app = createApp();

// ---------- Auth (optional) ----------
function isAuthed(req) {
  if (!APP_PASSWORD && !API_KEY) return true;
  const key = req.get('x-api-key') || req.query.key;
  if (API_KEY && key === API_KEY) return true;
  if (APP_PASSWORD) {
    const h = req.get('authorization') || '';
    if (h.startsWith('Basic ')) {
      const [, pw] = Buffer.from(h.slice(6), 'base64').toString().split(/:(.*)/s);
      if (pw === APP_PASSWORD) return true;
    }
  }
  return false;
}
function auth(req, res, next) {
  if (isAuthed(req)) return next();
  if (APP_PASSWORD) res.set('WWW-Authenticate', 'Basic realm="ShowCommander", charset="UTF-8"');
  res.status(401).json({ error: 'Anmeldung erforderlich' });
}

// ---------- Live-Verteilung ----------
// Server-Sent Events: jeder Client hält eine offene Verbindung pro Ablauf
const clients = new Map(); // rundownId -> Set<res>
let activeId = null;

function send(res, msg) { res.write(`data: ${JSON.stringify({ ...msg, serverTime: Date.now() })}\n\n`); }
function broadcast(id, msg) {
  const set = clients.get(id);
  if (!set) return;
  const data = `data: ${JSON.stringify({ ...msg, serverTime: Date.now() })}\n\n`;
  for (const res of set) res.write(data);
}
function pushRundown(rd) {
  broadcast(rd.id, { type: 'rundown', data: publicRundown(rd) });
  // Änderungen am laufenden Ablauf (z. B. Dauer des aktuellen Punkts) auch an ProPresenter geben
  if (rd.id === activeId && rd.live && rd.live.status !== 'stopped') pp.onLive(rd, show.summary(rd));
}
function pushLive(rd) {
  broadcast(rd.id, { type: 'live', data: rd.live });
  pp.onLive(rd, show.summary(rd));
}

function publicRundown(rd) {
  show.live(rd);
  return { ...rd, deleteAt: store.deleteAt(rd) };
}

function getRd(req, res) {
  let id = req.params.id;
  if (id === 'active') {
    id = activeId || (store.list()[0] || {}).id;
  }
  const rd = id && store.load(id);
  if (!rd) { res.status(404).json({ error: 'Ablauf nicht gefunden' }); return null; }
  return rd;
}

const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(err => {
  console.error(err);
  res.status(err.status && err.status < 500 ? 400 : 500).json({ error: err.message });
});

// ---------- Seiten ----------
const page = f => (req, res) => res.sendFile(path.join(PUB, f));
app.get('/', auth, page('index.html'));
app.get('/edit/:id', auth, page('rundown.html'));
app.get('/view/:id', page('rundown.html'));
app.get('/output/:id', page('output.html'));
app.get('/prompter/:id', page('prompter.html'));
app.get('/overlay/:id', page('overlay.html'));
app.static('/static', PUB);

// ---------- API: Rundowns ----------
app.get('/api/rundowns', (req, res) => res.json(store.list()));

app.post('/api/rundowns', auth, (req, res) => {
  const rd = store.create({ name: req.body.name, startTime: req.body.startTime || null });
  res.json(rd);
});

app.get('/api/rundowns/:id', (req, res) => {
  const rd = getRd(req, res); if (!rd) return;
  res.json({ ...publicRundown(rd), serverTime: Date.now(), canEdit: isAuthed(req) });
});

app.patch('/api/rundowns/:id', auth, (req, res) => {
  const rd = getRd(req, res); if (!rd) return;
  const b = req.body;
  if (b.name !== undefined) rd.name = String(b.name);
  if (b.startTime !== undefined) { rd.startTime = b.startTime || null; rd.startTimeOverride = !!b.startTime; }
  if (Array.isArray(b.columns)) rd.columns = b.columns.map(c => ({ id: c.id || store.uid('c'), name: String(c.name || '') }));
  if (b.prompter && typeof b.prompter === 'object') rd.prompter = { ...(rd.prompter || {}), ...b.prompter };
  if (b.keep !== undefined) rd.keep = !!b.keep;
  if (b.description !== undefined) rd.description = String(b.description);
  store.save(rd); pushRundown(rd);
  res.json(rd);
});

app.delete('/api/rundowns/:id', auth, (req, res) => {
  const rd = getRd(req, res); if (!rd) return;
  store.remove(rd.id);
  res.json({ ok: true });
});

// ---------- Vorlagen ----------
app.post('/api/templates', auth, (req, res) => {
  res.json(store.create({ name: req.body.name || 'Neue Vorlage', isTemplate: true, description: req.body.description || '' }));
});
// Ablauf (oder Vorlage) als neue Vorlage speichern
app.post('/api/rundowns/:id/save-template', auth, (req, res) => {
  const rd = getRd(req, res); if (!rd) return;
  res.json(templates.makeTemplate(rd, { name: req.body.name, description: req.body.description }));
});
// Vorlage auf bestehenden Ablauf anwenden
app.post('/api/rundowns/:id/apply-template', auth, (req, res) => {
  const rd = getRd(req, res); if (!rd) return;
  const tpl = store.load(String(req.body.templateId || ''));
  if (!tpl || !tpl.isTemplate) return res.status(404).json({ error: 'Vorlage nicht gefunden' });
  const full = req.body.full ?? (!rd.ct && rd.items.length === 0);
  const stats = templates.applyTemplate(rd, tpl, { full });
  store.save(rd); pushRundown(rd);
  res.json(stats);
});
// Neuen Ablauf aus Vorlage erstellen
app.post('/api/templates/:id/instantiate', auth, (req, res) => {
  const tpl = store.load(req.params.id);
  if (!tpl || !tpl.isTemplate) return res.status(404).json({ error: 'Vorlage nicht gefunden' });
  res.json(templates.instantiate(tpl, { name: req.body.name, startTime: req.body.startTime }));
});

// ---------- Aufbewahrung ----------
app.post('/api/retention/run', auth, (req, res) => res.json({ deleted: retention.cleanup() }));

// ---------- Datei-Import (PDF/DOCX/XLSX/CSV/TXT) ----------
// Schritt 1: Datei in Zeilen/Zellen zerlegen (PDF wird schon im Browser in Zeilen umgewandelt)
app.post('/api/import/extract', auth, wrap(async (req, res) => {
  res.json(await importer.extract(req.body || {}));
}));
// Schritt 2: fertig zugeordnete Punkte als neuen Ablauf anlegen oder an bestehenden anhängen
app.post('/api/import/create', auth, (req, res) => {
  const b = req.body || {};
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 1000).map(it => store.newItem({
    kind: it.kind === 'header' ? 'header' : 'cue',
    title: String(it.title || '').slice(0, 300), who: String(it.who || '').slice(0, 200), info: String(it.info || '').slice(0, 300),
    notes: String(it.notes || '').slice(0, 5000), duration: Math.max(0, Math.round(Number(it.duration) || 0)), hardStart: it.hardStart || null,
  }));
  let rd;
  if (b.targetId) {
    rd = store.load(String(b.targetId));
    if (!rd) return res.status(404).json({ error: 'Ablauf nicht gefunden' });
    rd.items.push(...items);
  } else {
    rd = store.create({ name: b.name || 'Importierter Ablauf', startTime: b.startTime || null, items });
  }
  if (b.templateId) {
    const tpl = store.load(String(b.templateId));
    if (tpl && tpl.isTemplate) templates.applyTemplate(rd, tpl, { full: false });
  }
  store.save(rd); pushRundown(rd);
  res.json(rd);
});

app.post('/api/rundowns/:id/duplicate', auth, (req, res) => {
  const rd = getRd(req, res); if (!rd) return;
  const copy = JSON.parse(JSON.stringify(rd));
  delete copy.id; delete copy.live;
  copy.name = rd.name + ' (Kopie)';
  copy.items = copy.items.map(i => ({ ...i, id: store.uid('i') }));
  res.json(store.create(copy));
});

// Items
app.post('/api/rundowns/:id/items', auth, (req, res) => {
  const rd = getRd(req, res); if (!rd) return;
  const it = store.newItem({ ...(req.body.item || {}), source: 'custom' });
  const afterId = req.body.afterId;
  const idx = afterId ? rd.items.findIndex(i => i.id === afterId) : -1;
  if (afterId === '__top') rd.items.unshift(it);
  else if (idx >= 0) rd.items.splice(idx + 1, 0, it);
  else rd.items.push(it);
  store.save(rd); pushRundown(rd);
  res.json(it);
});

const EDITABLE = ['kind', 'title', 'who', 'info', 'duration', 'notes', 'script', 'color', 'skip', 'hardStart', 'autoNext', 'cells', 'ctNote', 'preShow', 'tplCt'];
app.patch('/api/rundowns/:id/items/:itemId', auth, (req, res) => {
  const rd = getRd(req, res); if (!rd) return;
  const it = rd.items.find(i => i.id === req.params.itemId);
  if (!it) return res.status(404).json({ error: 'Punkt nicht gefunden' });
  for (const [k, v] of Object.entries(req.body)) {
    if (!EDITABLE.includes(k)) continue;
    if (k === 'cells') { it.cells = { ...it.cells, ...v }; continue; }
    if (k === 'duration') it.duration = Math.max(0, Math.round(Number(v) || 0));
    else if (k === 'hardStart') it.hardStart = v ? String(v) : null;
    else if (k === 'skip' || k === 'autoNext' || k === 'preShow' || k === 'tplCt') it[k] = !!v;
    else it[k] = typeof v === 'string' ? v : String(v ?? '');
    if (it.source === 'ct' && ct.CT_FIELDS.includes(k) && !it.overrides.includes(k)) it.overrides.push(k);
  }
  store.save(rd); pushRundown(rd);
  res.json(it);
});

// Lokale Überschreibungen eines CT-Punkts verwerfen (nächster Sync holt CT-Werte)
app.post('/api/rundowns/:id/items/:itemId/reset', auth, wrap(async (req, res) => {
  const rd = getRd(req, res); if (!rd) return;
  const it = rd.items.find(i => i.id === req.params.itemId);
  if (!it) return res.status(404).json({ error: 'Punkt nicht gefunden' });
  it.overrides = [];
  try { await ct.syncRundown(rd); } catch (e) { store.save(rd); }
  pushRundown(rd);
  res.json(rd.items.find(i => i.id === it.id));
}));

app.delete('/api/rundowns/:id/items/:itemId', auth, (req, res) => {
  const rd = getRd(req, res); if (!rd) return;
  const it = rd.items.find(i => i.id === req.params.itemId);
  if (!it) return res.status(404).json({ error: 'Punkt nicht gefunden' });
  if (it.source === 'ct' && rd.ct) {
    rd.ct.ignored = [...new Set([...(rd.ct.ignored || []), it.ctId])];
  }
  rd.items = rd.items.filter(i => i.id !== it.id);
  if (rd.live?.currentId === it.id) show.command(rd, 'end');
  if (rd.live?.nextId === it.id) rd.live.nextId = null;
  store.save(rd); pushRundown(rd);
  res.json({ ok: true });
});

// Ausgeblendete CT-Punkte wiederherstellen
app.post('/api/rundowns/:id/restore-ignored', auth, wrap(async (req, res) => {
  const rd = getRd(req, res); if (!rd) return;
  if (rd.ct) rd.ct.ignored = [];
  const stats = await ct.syncRundown(rd);
  pushRundown(rd);
  res.json(stats);
}));

app.post('/api/rundowns/:id/move', auth, (req, res) => {
  const rd = getRd(req, res); if (!rd) return;
  const { itemId, beforeId } = req.body;
  const idx = rd.items.findIndex(i => i.id === itemId);
  if (idx < 0) return res.status(404).json({ error: 'Punkt nicht gefunden' });
  const [it] = rd.items.splice(idx, 1);
  const bIdx = beforeId ? rd.items.findIndex(i => i.id === beforeId) : -1;
  if (bIdx >= 0) rd.items.splice(bIdx, 0, it); else rd.items.push(it);
  store.save(rd); pushRundown(rd);
  res.json({ ok: true });
});

// ChurchTools-Sync
app.post('/api/rundowns/:id/sync', auth, wrap(async (req, res) => {
  const rd = getRd(req, res); if (!rd) return;
  const stats = await ct.syncRundown(rd);
  pushRundown(rd);
  res.json({ ...stats, lastSync: rd.ct.lastSync });
}));

app.post('/api/rundowns/:id/link', auth, wrap(async (req, res) => {
  const rd = getRd(req, res); if (!rd) return;
  rd.ct = { eventId: Number(req.body.eventId) };
  const stats = await ct.syncRundown(rd);
  pushRundown(rd);
  res.json(stats);
}));

// Show-Steuerung (Companion: POST oder GET /api/rundowns/<id|active>/control/next)
app.all('/api/rundowns/:id/control/:cmd', auth, (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).end();
  const rd = getRd(req, res); if (!rd) return;
  const arg = req.body?.arg ?? req.query.arg ?? req.query.sec ?? req.query.id;
  const ok = show.command(rd, req.params.cmd, arg);
  activeId = rd.id;
  store.save(rd); pushLive(rd);
  res.json({ ok, ...show.summary(rd) });
});

app.get('/api/rundowns/:id/state', (req, res) => {
  const rd = getRd(req, res); if (!rd) return;
  res.json(show.summary(rd));
});

// CSV-Export
app.get('/api/rundowns/:id/export.csv', (req, res) => {
  const rd = getRd(req, res); if (!rd) return;
  const t = Timing.compute(rd, null);
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Nr', 'Start', 'Dauer', 'Typ', 'Titel', 'Verantwortlich', 'Info', 'Notizen', 'ChurchTools-Notiz', ...rd.columns.map(c => c.name), 'Quelle', 'Übersprungen'];
  const rows = [head.map(esc).join(';')];
  let n = 0;
  for (const it of rd.items) {
    const ps = t.items[it.id]?.plannedStart;
    const start = ps == null ? '' : (t.relative ? Timing.fmtDur(ps) : Timing.fmtClock(ps));
    const nr = it.kind === 'header' ? '' : ++n;
    rows.push([nr, start, it.kind === 'header' ? '' : Timing.fmtDur(it.duration * 1000), it.kind === 'header' ? 'Abschnitt' : 'Punkt',
      it.title, it.who, it.info, it.notes, it.ctNote, ...rd.columns.map(c => it.cells?.[c.id] || ''),
      it.source === 'ct' ? 'ChurchTools' : 'Eigener Punkt', it.skip ? 'ja' : ''].map(esc).join(';'));
  }
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(rd.name)}.csv"`);
  res.send('﻿' + rows.join('\r\n'));
});

// ---------- API: Einstellungen & ChurchTools ----------
const settingsOut = () => {
  const s = store.getSettings();
  return { ctUrl: s.ctUrl, hasToken: !!s.ctToken, ctFromEnv: s.ctFromEnv, pp: s.pp, ppStatus: pp.status(),
    retentionDays: s.retentionDays, retentionFromEnv: s.retentionFromEnv };
};
app.get('/api/settings', auth, (req, res) => res.json(settingsOut()));
app.put('/api/settings', auth, (req, res) => {
  store.setSettings(req.body || {});
  res.json(settingsOut());
});
app.post('/api/settings/pp-test', auth, wrap(async (req, res) => res.json(await pp.test())));
// Aktuellen Stand sofort an ProPresenter schicken (z. B. nach Neustart von ProPresenter)
app.post('/api/rundowns/:id/pp-push', auth, (req, res) => {
  const rd = getRd(req, res); if (!rd) return;
  activeId = rd.id;
  pp.onLive(rd, show.summary(rd));
  res.json({ ok: true });
});
app.post('/api/settings/test', auth, wrap(async (req, res) => res.json(await ct.testConnection())));

app.get('/api/ct/events', auth, wrap(async (req, res) => {
  res.json(await ct.listEvents({ from: req.query.from, to: req.query.to }));
}));
app.post('/api/ct/import', auth, wrap(async (req, res) => {
  const rd = await ct.importEvent(req.body.eventId);
  if (req.body.templateId) {
    const tpl = store.load(String(req.body.templateId));
    if (tpl && tpl.isTemplate) { templates.applyTemplate(rd, tpl, { full: false }); store.save(rd); }
  }
  res.json(rd);
}));

app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---------- Live-Stream (SSE) ----------
app.get('/api/rundowns/:id/events', (req, res) => {
  const rd = getRd(req, res); if (!rd) return;
  const id = rd.id;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Nginx (Proxy Manager) nicht puffern lassen
  });
  res.write('retry: 2000\n\n');
  if (!clients.has(id)) clients.set(id, new Set());
  clients.get(id).add(res);
  send(res, { type: 'rundown', data: publicRundown(rd) });
  req.on('close', () => clients.get(id)?.delete(res));
});
app.get('/api/time', (req, res) => res.json({ serverTime: Date.now() }));

setInterval(() => { for (const set of clients.values()) for (const res of set) res.write(': ping\n\n'); }, 20000);

const server = http.createServer((req, res) => app.handle(req, res));
server.keepAliveTimeout = 65000;

// Auto-Next-Ticker
setInterval(() => {
  for (const id of new Set([...clients.keys(), activeId].filter(Boolean))) {
    const rd = store.load(id);
    if (rd && show.tick(rd)) { store.save(rd); pushLive(rd); }
  }
}, 250);

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { store.flushAll(); process.exit(0); });

templates.seedDefaults();
retention.start();

server.listen(PORT, () => {
  console.log(`ShowCommander läuft auf http://localhost:${PORT}`);
  if (!APP_PASSWORD) console.log('Hinweis: kein APP_PASSWORD gesetzt – Bearbeiten ist ohne Anmeldung möglich.');
});
