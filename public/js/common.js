// Gemeinsame Helfer für alle Seiten
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function toast(msg, type = 'info') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3500);
  setTimeout(() => t.remove(), 4000);
}

function rundownIdFromPath() {
  const parts = location.pathname.split('/').filter(Boolean);
  return decodeURIComponent(parts[1] || '');
}

/**
 * Live-Verbindung mit automatischem Reconnect und Uhrabgleich.
 * onRundown(rd) bei jeder Änderung, onLive(live) bei Steuerbefehlen.
 */
function connectLive(id, { onRundown, onLive, onStatus }) {
  const conn = { offset: 0, rd: null };
  conn.now = () => Date.now() + conn.offset;

  // Uhrabgleich mit dem Server (wichtig, damit alle Displays dieselbe Restzeit zeigen)
  async function syncClock() {
    try {
      let best = null;
      for (let i = 0; i < 3; i++) {
        const t0 = Date.now();
        const { serverTime } = await (await fetch('/api/time', { cache: 'no-store' })).json();
        const rtt = Date.now() - t0;
        if (!best || rtt < best.rtt) best = { rtt, offset: serverTime + rtt / 2 - Date.now() };
      }
      conn.offset = best.offset;
    } catch { /* später erneut */ }
  }
  syncClock(); setInterval(syncClock, 60000);

  const es = new EventSource(`/api/rundowns/${encodeURIComponent(id)}/events`);
  es.onopen = () => onStatus && onStatus(true);
  es.onerror = () => onStatus && onStatus(false);
  es.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.type === 'rundown') { conn.rd = m.data; onRundown && onRundown(m.data); }
    if (m.type === 'live' && conn.rd) { conn.rd.live = m.data; onLive && onLive(m.data); }
  };
  return conn;
}

function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
