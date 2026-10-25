// Einfacher JSON-Dateispeicher (ein File pro Rundown + settings.json)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const RD_DIR = path.join(DATA_DIR, 'rundowns');
fs.mkdirSync(RD_DIR, { recursive: true });

const cache = new Map();
const timers = new Map();

function uid(prefix = '') {
  return prefix + crypto.randomBytes(6).toString('base64url');
}

function file(id) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Ungültige ID');
  return path.join(RD_DIR, id + '.json');
}

function load(id) {
  if (cache.has(id)) return cache.get(id);
  const f = file(id);
  if (!fs.existsSync(f)) return null;
  const rd = JSON.parse(fs.readFileSync(f, 'utf8'));
  cache.set(id, rd);
  return rd;
}

function writeNow(id) {
  const rd = cache.get(id);
  if (!rd) return;
  const f = file(id);
  fs.writeFileSync(f + '.tmp', JSON.stringify(rd, null, 2));
  fs.renameSync(f + '.tmp', f);
}

function save(rd) {
  rd.updatedAt = new Date().toISOString();
  cache.set(rd.id, rd);
  clearTimeout(timers.get(rd.id));
  timers.set(rd.id, setTimeout(() => writeNow(rd.id), 300));
  return rd;
}

function flushAll() {
  for (const id of timers.keys()) { clearTimeout(timers.get(id)); writeNow(id); }
}

function list() {
  return fs.readdirSync(RD_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => load(f.slice(0, -5)))
    .filter(Boolean)
    .map(rd => ({
      id: rd.id, name: rd.name, startTime: rd.startTime, updatedAt: rd.updatedAt,
      ct: rd.ct ? { eventId: rd.ct.eventId, lastSync: rd.ct.lastSync } : null,
      itemCount: rd.items.length,
      isTemplate: !!rd.isTemplate,
      keep: !!rd.keep,
      description: rd.description || '',
      deleteAt: deleteAt(rd),
      todos: (rd.todos || []).length ? (() => {
        const r = require('../public/js/timing').computeTodos(rd);
        return { total: r.total, done: r.done, overdue: r.overdue, pre: r.pre, post: r.post, prepStart: r.prepStart };
      })() : null,
      live: rd.live && rd.live.status !== 'stopped',
    }))
    .sort((a, b) => (b.startTime || b.updatedAt || '').localeCompare(a.startTime || a.updatedAt || ''));
}

// ---------- Aufbewahrung ----------
// Ein Ablauf wird X Tage nach dem Gottesdienst bzw. nach der letzten Änderung gelöscht (je nachdem, was später ist).
// Vorlagen und als „Behalten“ markierte Abläufe sind ausgenommen.
function retentionDays() {
  const env = process.env.RETENTION_DAYS;
  if (env !== undefined && env !== '') return Math.max(0, Number(env) || 0);
  const s = readSettingsFile();
  return s.retentionDays === undefined ? 14 : Math.max(0, Number(s.retentionDays) || 0);
}
function deleteAt(rd) {
  const days = retentionDays();
  if (!days || rd.isTemplate || rd.keep) return null;
  const base = Math.max(Date.parse(rd.startTime || 0) || 0, Date.parse(rd.updatedAt || 0) || 0, Date.parse(rd.createdAt || 0) || 0);
  return new Date(base + days * 864e5).toISOString();
}

function remove(id) {
  cache.delete(id);
  const f = file(id);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

function create(data = {}) {
  const rd = {
    id: uid(),
    name: data.name || 'Neuer Ablauf',
    startTime: data.startTime || null,
    ct: data.ct || null,
    columns: data.columns || [{ id: uid('c'), name: 'Technik' }],
    items: data.items || [],
    todos: (data.todos || []).map(t => newTodo(t)),
    todoBuffer: Number(data.todoBuffer) || 0,
    todoPostBuffer: Number(data.todoPostBuffer) || 0,
    isTemplate: !!data.isTemplate,
    keep: !!data.keep,
    description: data.description || '',
    templateId: data.templateId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return save(rd);
}

function newTodo(data = {}) {
  return {
    id: data.id && /^t[\w-]+$/.test(data.id) ? data.id : uid('t'),
    title: String(data.title ?? '').slice(0, 200),
    duration: Math.max(0, Math.round(Number(data.duration) || 0)), // Sekunden
    who: String(data.who ?? '').slice(0, 120),
    notes: String(data.notes ?? '').slice(0, 2000),
    parallel: !!data.parallel,
    phase: data.phase === 'post' ? 'post' : 'pre',          // vor oder nach dem Event
    fixedDue: data.fixedDue == null || data.fixedDue === '' || isNaN(Number(data.fixedDue)) ? null : Math.round(Number(data.fixedDue)), // fest „Fertig bis“, Sekunden relativ zum Start
    done: !!data.done,
    doneBy: data.done ? (data.doneBy || null) : null,
    doneAt: data.done ? (data.doneAt || null) : null,
  };
}

function newItem(data = {}) {
  return {
    id: uid('i'),
    source: data.source || 'custom',
    ctId: data.ctId ?? null,
    kind: data.kind || 'cue',          // 'cue' | 'header'
    title: data.title ?? '',
    who: data.who ?? '',               // Verantwortlich
    info: data.info ?? '',             // z.B. Lied / Arrangement
    duration: Number(data.duration) || 0, // Sekunden
    notes: data.notes ?? '',
    ctNote: data.ctNote ?? '',
    script: data.script ?? '',         // Prompter-Text
    color: data.color ?? '',
    skip: !!data.skip,
    hardStart: data.hardStart ?? null, // 'HH:MM' oder null
    autoNext: !!data.autoNext,
    preShow: !!data.preShow,
    cells: data.cells || {},
    overrides: data.overrides || [],   // lokal überschriebene CT-Felder
    tplRef: data.tplRef || null,       // Herkunft aus Vorlage ("<vorlagenId>:<itemId>")
  };
}

// ---------- Einstellungen ----------
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
function readSettingsFile() {
  try { return fs.existsSync(SETTINGS_FILE) ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) : {}; } catch { return {}; }
}
// ProPresenter-Werte aus der Umgebung (.env) überschreiben die Einstellungen in der App
function ppEnv() {
  const e = process.env, o = {};
  const b = v => ['1', 'true', 'yes', 'ja', 'on'].includes(String(v).toLowerCase());
  if (e.PP_HOST) { o.host = e.PP_HOST.replace(/^https?:\/\//, '').replace(/\/+$/, ''); if (!e.PP_ENABLED) o.enabled = true; }
  if (e.PP_PORT) o.port = Number(e.PP_PORT) || 1025;
  if (e.PP_ENABLED) o.enabled = b(e.PP_ENABLED);
  if (e.PP_TIMER_NAME) o.timerName = e.PP_TIMER_NAME;
  if (e.PP_STAGE_MESSAGE) o.stageMessage = b(e.PP_STAGE_MESSAGE);
  if (e.PP_TEMPLATE) o.template = e.PP_TEMPLATE;
  return o;
}
function getSettings() {
  const s = readSettingsFile();
  return {
    retentionDays: retentionDays(),
    retentionFromEnv: process.env.RETENTION_DAYS !== undefined && process.env.RETENTION_DAYS !== '',
    ctUrl: process.env.CT_URL || s.ctUrl || '',
    ctToken: process.env.CT_TOKEN || s.ctToken || '',
    ctFromEnv: !!process.env.CT_URL,
    pp: {
      enabled: false,
      host: '',
      port: 1025,
      timerName: 'ShowCommander',
      stageMessage: true,
      template: '▶ {current}   ·   Danach: {next}',
      clearOnEnd: true,
      ...(s.pp || {}),
      ...ppEnv(),
    },
    ppFromEnv: Object.keys(ppEnv()),
  };
}
function setSettings(patch) {
  let s = {};
  if (fs.existsSync(SETTINGS_FILE)) s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  if (patch.ctUrl !== undefined) s.ctUrl = String(patch.ctUrl).trim().replace(/\/+$/, '');
  if (patch.ctToken) s.ctToken = String(patch.ctToken).trim();
  if (patch.retentionDays !== undefined) s.retentionDays = Math.max(0, Math.round(Number(patch.retentionDays) || 0));
  if (patch.pp && typeof patch.pp === 'object') {
    const p = patch.pp, cur = s.pp || {};
    s.pp = {
      ...cur,
      ...(p.enabled !== undefined && { enabled: !!p.enabled }),
      ...(p.host !== undefined && { host: String(p.host).trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') }),
      ...(p.port !== undefined && { port: Number(p.port) || 1025 }),
      ...(p.timerName !== undefined && { timerName: String(p.timerName).trim() || 'ShowCommander' }),
      ...(p.stageMessage !== undefined && { stageMessage: !!p.stageMessage }),
      ...(p.template !== undefined && { template: String(p.template) }),
      ...(p.clearOnEnd !== undefined && { clearOnEnd: !!p.clearOnEnd }),
    };
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
}

module.exports = { load, save, list, remove, create, newItem, newTodo, uid, flushAll, getSettings, setSettings, deleteAt, retentionDays };
