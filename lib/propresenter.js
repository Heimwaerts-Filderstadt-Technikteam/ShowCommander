// ProPresenter 7.9+ Anbindung über die offizielle HTTP-API
// - Restzeit des aktuellen Punkts als ProPresenter-Countdown-Timer (für Stage-Layouts / Folien mit Timer-Token)
// - "Jetzt / Danach" als Stage-Message
const store = require('./store');
const Timing = require('../public/js/timing');

let queue = Promise.resolve();
let timerCache = { key: null, id: null };
let lastError = null;
let lastOk = null;

function cfg() { return store.getSettings().pp; }

async function pp(method, path, body, { timeout = 2500 } = {}) {
  const c = cfg();
  if (!c.host) throw new Error('ProPresenter-Host fehlt');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`http://${c.host}:${c.port}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`ProPresenter ${res.status} bei ${method} ${path}${text ? ': ' + text.slice(0, 120) : ''}`);
    try { return text ? JSON.parse(text) : null; } catch { return text; }
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`ProPresenter unter ${c.host}:${c.port} antwortet nicht (Netzwerk-API aktiviert?)`);
    if (err.cause?.code === 'ECONNREFUSED') throw new Error(`ProPresenter unter ${c.host}:${c.port} verweigert die Verbindung – Port in ProPresenter → Einstellungen → Netzwerk prüfen`);
    throw err;
  } finally { clearTimeout(t); }
}

// Timer per Name suchen oder anlegen; liefert das id-Objekt {uuid,name,index}
async function ensureTimer(seconds) {
  const c = cfg();
  const key = `${c.host}:${c.port}:${c.timerName}`;
  if (timerCache.key === key && timerCache.id) return timerCache.id;
  const timers = await pp('GET', '/v1/timers');
  let found = (Array.isArray(timers) ? timers : []).find(t => t.id?.name === c.timerName);
  if (!found) {
    found = await pp('POST', '/v1/timers', { name: c.timerName, allows_overrun: true, countdown: { duration: Math.max(0, seconds) } });
  }
  if (!found?.id?.uuid) throw new Error('ProPresenter-Timer konnte nicht angelegt werden');
  timerCache = { key, id: found.id };
  return found.id;
}

async function setTimer(seconds, run) {
  const id = await ensureTimer(seconds);
  const ref = encodeURIComponent(id.uuid);
  await pp('GET', `/v1/timer/${ref}/stop`).catch(() => {});
  await pp('PUT', `/v1/timer/${ref}`, { id, allows_overrun: true, countdown: { duration: Math.max(0, Math.round(seconds)) } });
  await pp('GET', `/v1/timer/${ref}/reset`);
  if (run) await pp('GET', `/v1/timer/${ref}/start`);
}

function fill(template, rd, summary) {
  const map = {
    current: summary.current?.title || '',
    who: summary.current?.who || '',
    info: summary.current?.info || '',
    next: summary.next?.title || 'Ende',
    nextWho: summary.next?.who || '',
    end: summary.projectedEnd || summary.plannedEnd || '',
    overUnder: summary.overUnder || '',
    number: summary.current?.index ?? '',
    rundown: rd.name,
  };
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in map ? String(map[k]) : `{${k}}`)).trim();
}

async function apply(rd, summary) {
  const c = cfg();
  const L = rd.live || {};
  if (L.status === 'stopped' || !summary.current) {
    if (timerCache.id || c.clearOnEnd) {
      await setTimer(0, false).catch(() => {});
      if (c.stageMessage) await pp('DELETE', '/v1/stage/message').catch(() => {});
    }
    return;
  }
  const remSec = Math.ceil((summary.remainingMs ?? 0) / 1000);
  // Überzogen: ProPresenter zählt mit allows_overrun selbst ins Minus weiter
  await setTimer(Math.max(0, remSec), L.status === 'running');
  if (c.stageMessage) await pp('PUT', '/v1/stage/message', fill(c.template, rd, summary));
}

/** Nach jedem Steuerbefehl aufrufen. Läuft entkoppelt und blockiert die Show nie. */
function onLive(rd, summary) {
  const c = cfg();
  if (!c.enabled || !c.host) return;
  queue = queue.then(() => apply(rd, summary))
    .then(() => { lastOk = new Date().toISOString(); lastError = null; })
    .catch(err => { lastError = err.message; timerCache = { key: null, id: null }; console.warn('[ProPresenter]', err.message); });
}

async function test() {
  const v = await pp('GET', '/version');
  const id = await ensureTimer(0);
  return {
    ok: true,
    name: v?.name || 'ProPresenter',
    version: v?.host_description || v?.api_version || '',
    timer: id.name,
  };
}

function status() { return { lastOk, lastError }; }

module.exports = { onLive, test, status, fill };
