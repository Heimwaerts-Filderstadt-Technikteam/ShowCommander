// ChurchTools REST-Anbindung: Events auflisten, Ablauf (Agenda) holen, mit eigenen Punkten mergen
const store = require('./store');

async function ctFetch(pathname, params = {}) {
  const { ctUrl, ctToken } = store.getSettings();
  if (!ctUrl) throw new Error('ChurchTools-URL ist nicht eingerichtet (Einstellungen).');
  const url = new URL(ctUrl.replace(/\/+$/, '') + pathname);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  const headers = { accept: 'application/json' };
  if (ctToken) headers.authorization = 'Login ' + ctToken;
  const res = await fetch(url, { headers });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const msg = body?.message || body?.errors?.[0]?.message || res.statusText;
    const err = new Error(`ChurchTools ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

async function listEvents({ from, to } = {}) {
  const day = 86400000;
  const f = from || new Date(Date.now() - 7 * day).toISOString().slice(0, 10);
  const t = to || new Date(Date.now() + 60 * day).toISOString().slice(0, 10);
  // Pagination durchlaufen
  let page = 1; const out = [];
  for (;;) {
    const body = await ctFetch('/api/events', { from: f, to: t, page, limit: 100 });
    const data = body.data || [];
    out.push(...data);
    const last = body.meta?.pagination?.lastPage || 1;
    if (page >= last || data.length === 0) break;
    page++;
  }
  return out.map(e => ({
    id: e.id,
    name: e.name,
    startDate: e.startDate,
    endDate: e.endDate,
    calendar: e.calendar?.title || e.calendar?.name || '',
    isCanceled: !!e.isCanceled,
  }));
}

async function getEvent(eventId) {
  const body = await ctFetch(`/api/events/${eventId}`);
  return body.data;
}

async function getAgenda(eventId) {
  const body = await ctFetch(`/api/events/${eventId}/agenda`);
  return body.data;
}

function responsibleText(r) {
  if (!r) return '';
  const parts = [];
  for (const p of r.persons || []) {
    const name = p.person?.title || p.person?.domainAttributes?.firstName || '?';
    parts.push(p.service ? `${name} (${String(p.service).replace(/^\[|\]$/g, '')})` : name);
  }
  if (!parts.length && r.text) parts.push(r.text);
  return parts.join(', ');
}

function songInfo(s) {
  if (!s) return '';
  const bits = [s.title];
  const extra = [s.arrangement, s.key ? `Tonart ${s.key}` : null].filter(Boolean);
  if (extra.length) bits.push(`– ${extra.join(', ')}`);
  return bits.filter(Boolean).join(' ');
}

function stripHtml(s) {
  return String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

// Wandelt CT-Agendaeintrag in unsere Feldstruktur
function mapItem(ci) {
  const isHeader = ci.type === 'header';
  let duration = Number(ci.duration) || 0;
  return {
    ctId: ci.id,
    kind: isHeader ? 'header' : 'cue',
    title: ci.title || (ci.song?.title ?? ''),
    who: responsibleText(ci.responsible),
    info: ci.type === 'song' ? songInfo(ci.song) : '',
    duration: isHeader ? 0 : duration,
    ctNote: stripHtml(ci.note),
    preShow: !!ci.isBeforeEvent,
    ctStart: ci.start || null,
  };
}

const CT_FIELDS = ['kind', 'title', 'who', 'info', 'duration', 'ctNote', 'preShow'];

/**
 * Mergt einen frisch geholten CT-Ablauf in einen bestehenden Rundown.
 * - CT-Punkte werden aktualisiert (außer lokal überschriebene Felder)
 * - eigene Punkte bleiben hinter dem CT-Punkt, hinter dem sie standen
 * - in CT gelöschte Punkte verschwinden; eigene Punkte rutschen zum vorherigen Anker
 * - neue CT-Punkte werden in CT-Reihenfolge eingefügt
 */
function mergeAgenda(rd, agenda) {
  const ignored = new Set(rd.ct?.ignored || []);
  const ctItems = (agenda.items || []).map(mapItem).filter(i => !ignored.has(i.ctId));
  const ctIds = new Set(ctItems.map(i => i.ctId));
  const existingByCt = new Map(rd.items.filter(i => i.source === 'ct').map(i => [i.ctId, i]));

  // Eigene Punkte ihrem Anker zuordnen
  const anchored = new Map(); // ctId|'__top' -> [items]
  let anchor = '__top';
  for (const it of rd.items) {
    if (it.source === 'ct') { if (ctIds.has(it.ctId)) anchor = it.ctId; continue; }
    if (!anchored.has(anchor)) anchored.set(anchor, []);
    anchored.get(anchor).push(it);
  }

  const stats = { added: 0, updated: 0, removed: 0 };
  for (const it of existingByCt.values()) if (!ctIds.has(it.ctId)) stats.removed++;

  const out = [...(anchored.get('__top') || [])];
  for (const ci of ctItems) {
    let it = existingByCt.get(ci.ctId);
    if (!it) {
      it = store.newItem({ ...ci, source: 'ct' });
      stats.added++;
    } else {
      let changed = false;
      for (const f of CT_FIELDS) {
        if (it.overrides.includes(f)) continue;
        if (it[f] !== ci[f]) { it[f] = ci[f]; changed = true; }
      }
      if (changed) stats.updated++;
    }
    out.push(it);
    out.push(...(anchored.get(ci.ctId) || []));
  }
  rd.items = out;

  const first = ctItems.find(i => i.ctStart);
  rd.ct = {
    ...(rd.ct || {}),
    eventId: rd.ct?.eventId ?? agenda.eventId,
    agendaId: agenda.id,
    agendaName: agenda.name,
    isFinal: !!agenda.isFinal,
    modifiedDate: agenda.meta?.modifiedDate || null,
    lastSync: new Date().toISOString(),
  };
  if (first && !rd.startTimeOverride) rd.startTime = first.ctStart;
  return stats;
}

async function importEvent(eventId) {
  const [event, agenda] = await Promise.all([getEvent(eventId), getAgenda(eventId)]);
  const rd = store.create({
    name: event?.name ? `${event.name} – ${new Date(event.startDate).toLocaleDateString('de-DE', { timeZone: process.env.TZ || 'Europe/Berlin' })}` : 'ChurchTools-Ablauf',
    startTime: event?.startDate || null,
    ct: { eventId: Number(eventId) },
  });
  mergeAgenda(rd, agenda);
  store.save(rd);
  return rd;
}

async function syncRundown(rd) {
  if (!rd.ct?.eventId) throw new Error('Dieser Ablauf ist nicht mit ChurchTools verknüpft.');
  const agenda = await getAgenda(rd.ct.eventId);
  const stats = mergeAgenda(rd, agenda);
  store.save(rd);
  return stats;
}

async function testConnection() {
  const body = await ctFetch('/api/whoami');
  const p = body.data || {};
  return { ok: true, name: [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Anonym' };
}

module.exports = { listEvents, importEvent, syncRundown, testConnection, mergeAgenda, CT_FIELDS };
