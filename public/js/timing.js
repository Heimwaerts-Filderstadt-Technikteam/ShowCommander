// Gemeinsame Zeitberechnung (Browser + Node)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Timing = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  function isPlayable(it) { return it.kind !== 'header' && !it.skip; }

  function hardStartMs(baseMs, hhmm) {
    if (baseMs == null || !hhmm) return null;
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(hhmm);
    if (!m) return null;
    const d = new Date(baseMs);
    d.setHours(+m[1], +m[2], +(m[3] || 0), 0);
    return d.getTime();
  }

  function remainingMs(item, live, now) {
    if (!item || !live || live.cueStart == null) return 0;
    const ref = live.status === 'paused' && live.pausedAt ? live.pausedAt : now;
    return item.duration * 1000 - (ref - live.cueStart);
  }

  /**
   * Liefert pro Item: plannedStart, projectedStart (ms oder null),
   * dazu plannedEnd, projectedEnd, overUnder (ms, + = überzogen), total (s)
   */
  function compute(rd, live, now) {
    now = now ?? Date.now();
    const items = rd.items || [];
    const base = rd.startTime ? Date.parse(rd.startTime)
      : (live && live.showStart ? live.showStart : null);
    const rel = base == null; // ohne Startzeit: relative Zeiten ab 0
    const out = {};
    let t = rel ? 0 : base;
    let total = 0;
    for (const it of items) {
      const r = { plannedStart: null, projectedStart: null };
      if (it.kind === 'header') { r.plannedStart = t; out[it.id] = r; continue; }
      if (it.skip) { out[it.id] = r; continue; }
      const h = rel ? null : hardStartMs(base, it.hardStart);
      if (h != null) t = h;
      r.plannedStart = t;
      t += (it.duration || 0) * 1000;
      total += it.duration || 0;
      out[it.id] = r;
    }
    const plannedEnd = t;

    let projectedEnd = null, overUnder = null, remaining = null;
    const running = live && live.currentId && live.status !== 'stopped';
    if (running) {
      const idx = items.findIndex(i => i.id === live.currentId);
      if (idx >= 0) {
        const cur = items[idx];
        remaining = remainingMs(cur, live, now);
        out[cur.id].projectedStart = live.cueStart;
        let p = now + Math.max(remaining, 0);
        for (let k = idx + 1; k < items.length; k++) {
          const it = items[k];
          if (it.kind === 'header') { out[it.id].projectedStart = p; continue; }
          if (it.skip) continue;
          const h = rel ? null : hardStartMs(base, it.hardStart);
          if (h != null && h > p) p = h;
          out[it.id].projectedStart = p;
          p += (it.duration || 0) * 1000;
        }
        projectedEnd = p;
        if (!rel) overUnder = projectedEnd - plannedEnd;
      }
    }
    return { items: out, plannedEnd, projectedEnd, overUnder, total, remaining, relative: rel, base };
  }

  function fmtDur(ms, opts = {}) {
    const neg = ms < 0;
    let s = Math.floor(Math.abs(ms) / 1000);
    if (opts.ceil && !neg) s = Math.ceil(Math.abs(ms) / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const pad = n => String(n).padStart(2, '0');
    const str = h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
    return (neg ? '-' : (opts.plus ? '+' : '')) + str;
  }

  function fmtClock(ms, sec) {
    const d = new Date(ms);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}` + (sec ? `:${pad(d.getSeconds())}` : '');
  }

  // "5", "5:30", "1:05:00", "90s", "2m" -> Sekunden
  function parseDur(str) {
    str = String(str || '').trim().toLowerCase();
    if (!str) return 0;
    let m;
    if ((m = /^(\d+(?:[.,]\d+)?)\s*s$/.exec(str))) return Math.round(parseFloat(m[1].replace(',', '.')));
    if ((m = /^(\d+(?:[.,]\d+)?)\s*(m|min)?$/.exec(str))) return Math.round(parseFloat(m[1].replace(',', '.')) * 60);
    if ((m = /^(\d+(?:[.,]\d+)?)\s*h$/.exec(str))) return Math.round(parseFloat(m[1].replace(',', '.')) * 3600);
    const parts = str.split(':').map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }

  /**
   * Vorbereitungs-Todos rückwärts vom Show-Start planen.
   * Reihenfolge = Arbeitsreihenfolge; das letzte Todo muss (abzüglich Puffer) zum Start fertig sein.
   * Todos mit parallel=true laufen gleichzeitig mit dem vorherigen und enden zur selben Zeit.
   * Liefert pro Todo: latestStart, due (Fertig-bis) als ms (oder relativ zu 0 = Start, wenn keine Startzeit),
   * state: 'done' | 'overdue' (Beginn verpasst) | 'soon' (≤ 10 min bis spätestem Beginn) | 'ok'
   */
  function computeTodos(rd, now) {
    now = now ?? Date.now();
    const todos = rd.todos || [];
    const base = rd.startTime ? Date.parse(rd.startTime) : null;
    const rel = base == null;
    const end0 = (rel ? 0 : base) - (Number(rd.todoBuffer) || 0) * 1000;
    // Gruppen bilden (parallel hängt an der vorherigen Gruppe)
    const groups = [];
    for (const t of todos) {
      if (t.parallel && groups.length) groups[groups.length - 1].push(t); else groups.push([t]);
    }
    const out = {};
    let cursor = end0;
    for (let g = groups.length - 1; g >= 0; g--) {
      const grp = groups[g];
      const maxDur = Math.max(0, ...grp.map(t => (t.duration || 0) * 1000));
      for (const t of grp) out[t.id] = { due: cursor, latestStart: cursor - (t.duration || 0) * 1000 };
      cursor -= maxDur;
    }
    let open = 0, overdue = 0, firstOpen = null;
    for (const t of todos) {
      const r = out[t.id];
      if (t.done) r.state = 'done';
      else {
        open++;
        if (!rel && now > r.latestStart) { r.state = 'overdue'; overdue++; }
        else if (!rel && now > r.latestStart - 10 * 60e3) r.state = 'soon';
        else r.state = 'ok';
        if (firstOpen == null || r.latestStart < firstOpen) firstOpen = r.latestStart;
      }
    }
    return {
      items: out, relative: rel, prepStart: todos.length ? cursor : null, prepEnd: end0,
      total: todos.length, open, overdue, done: todos.length - open, firstOpenStart: firstOpen,
    };
  }

  return { compute, computeTodos, remainingMs, fmtDur, fmtClock, parseDur, isPlayable, hardStartMs };
});
