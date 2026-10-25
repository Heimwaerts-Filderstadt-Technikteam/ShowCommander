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
   * Späteste Uhrzeit im Ablauf: das Ende des Programmpunkts, der am spätesten aufhört
   * (übersprungene Punkte zählen nicht). Läuft die Show, zählen die erwarteten Zeiten –
   * wird der Ablauf vor- oder zurückgeschoben, wandert dieser Wert mit.
   */
  function latestEnd(rd, t) {
    t = t || compute(rd, rd.live);
    let max = null;
    for (const it of rd.items || []) {
      if (!isPlayable(it)) continue;
      const r = t.items[it.id];
      if (!r) continue;
      const start = r.projectedStart != null ? r.projectedStart : r.plannedStart;
      if (start == null) continue;
      const end = start + (it.duration || 0) * 1000;
      if (max == null || end > max) max = end;
    }
    return max != null ? max : (t.projectedEnd != null ? t.projectedEnd : t.plannedEnd);
  }

  /**
   * Todos vor und nach dem Event planen.
   *
   * Vor dem Event (phase 'pre'): rückwärts vom Show-Start (minus Puffer). Reihenfolge = Arbeitsreihenfolge,
   *   die letzte Aufgabe muss zum Start fertig sein. Ergebnis je Todo: start = spätester Beginn, due = fertig bis.
   * Nach dem Event (phase 'post'): vorwärts ab Show-Ende (plus Puffer). Ergebnis: start = Beginn ab, due = fertig bis.
   *
   * parallel = läuft gleichzeitig mit der vorherigen Aufgabe.
   * fixedDue = fest eingetragenes „Fertig bis“ (Sekunden relativ zum Show-Start). Die Aufgabe richtet sich danach,
   *   die anderen Aufgaben rechnen von dort weiter. Passt der Termin nicht zur Kette, gibt es conflict = true.
   *
   * state: 'done' | 'overdue' | 'soon' | 'running' | 'ok'
   */
  function computeTodos(rd, now) {
    now = now ?? Date.now();
    const all = rd.todos || [];
    const base = rd.startTime ? Date.parse(rd.startTime) : null;
    const rel = base == null;
    const S = rel ? 0 : base;
    const t = compute(rd, rd.live, now);
    const showEnd = latestEnd(rd, t);
    const fixedMs = td => (td.fixedDue == null || td.fixedDue === '' || rel ? null : S + Number(td.fixedDue) * 1000);
    const dur = td => (td.duration || 0) * 1000;
    const groupsOf = list => {
      const g = [];
      for (const td of list) { if (td.parallel && g.length) g[g.length - 1].push(td); else g.push([td]); }
      return g;
    };
    const out = {};

    // --- vor dem Event: rückwärts ---
    const pre = all.filter(x => x.phase !== 'post');
    const preEnd = S - (Number(rd.todoBuffer) || 0) * 1000;
    let cursor = preEnd;
    const preGroups = groupsOf(pre);
    for (let g = preGroups.length - 1; g >= 0; g--) {
      const grp = preGroups[g];
      const fixedInGroup = grp.map(fixedMs).filter(v => v != null);
      const groupEnd = fixedInGroup.length ? Math.min(...fixedInGroup) : cursor;
      let next = Infinity;
      for (const td of grp) {
        const f = fixedMs(td);
        const due = f != null ? f : groupEnd;
        out[td.id] = { phase: 'pre', start: due - dur(td), due, fixed: f != null, conflict: f != null && f > cursor };
        next = Math.min(next, due - dur(td));
      }
      cursor = next;
    }
    const preStart = pre.length ? cursor : null;

    // --- nach dem Event: vorwärts ---
    const post = all.filter(x => x.phase === 'post');
    const postBegin = showEnd + (Number(rd.todoPostBuffer) || 0) * 1000;
    cursor = postBegin;
    for (const grp of groupsOf(post)) {
      const groupStart = cursor;
      let end = groupStart;
      for (const td of grp) {
        const f = fixedMs(td);
        const due = f != null ? f : groupStart + dur(td);
        const start = due - dur(td);
        out[td.id] = { phase: 'post', start, due, fixed: f != null, conflict: f != null && start < groupStart };
        end = Math.max(end, due);
      }
      cursor = end;
    }
    const postEnd = post.length ? cursor : null;

    // --- Status ---
    const sum = { pre: { total: 0, done: 0, open: 0, overdue: 0 }, post: { total: 0, done: 0, open: 0, overdue: 0 } };
    for (const td of all) {
      const r = out[td.id], s = sum[r.phase];
      s.total++;
      if (td.done) { r.state = 'done'; s.done++; continue; }
      s.open++;
      if (rel) { r.state = 'ok'; continue; }
      if (r.phase === 'pre') {
        if (now > r.start) { r.state = 'overdue'; s.overdue++; } else if (now > r.start - 10 * 60e3) r.state = 'soon'; else r.state = 'ok';
      } else {
        if (now > r.due) { r.state = 'overdue'; s.overdue++; } else if (now >= r.start) r.state = 'running'; else r.state = 'ok';
      }
    }
    return {
      items: out, relative: rel, showStart: S, showEnd,
      prepStart: preStart, prepEnd: preEnd, postStart: postBegin, postEnd,
      pre: sum.pre, post: sum.post,
      // Kompatibilität (Dashboard)
      total: all.length, open: sum.pre.open + sum.post.open, overdue: sum.pre.overdue + sum.post.overdue,
      done: sum.pre.done + sum.post.done,
    };
  }

  return { compute, computeTodos, latestEnd, remainingMs, fmtDur, fmtClock, parseDur, isPlayable, hardStartMs };
});
