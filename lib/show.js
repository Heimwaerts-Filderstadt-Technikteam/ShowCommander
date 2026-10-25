// Live-Steuerung (Showcalling): Start, Next, Prev, Pause, Adjust, Goto, Arm
const Timing = require('../public/js/timing');

function emptyLive() {
  return { status: 'stopped', currentId: null, nextId: null, cueStart: null, pausedAt: null, showStart: null, log: [] };
}

function live(rd) {
  if (!rd.live) rd.live = emptyLive();
  return rd.live;
}

function playable(rd) { return rd.items.filter(Timing.isPlayable); }

function after(rd, id) {
  const items = rd.items;
  const idx = items.findIndex(i => i.id === id);
  for (let k = idx + 1; k < items.length; k++) if (Timing.isPlayable(items[k])) return items[k].id;
  return null;
}
function before(rd, id) {
  const items = rd.items;
  const idx = items.findIndex(i => i.id === id);
  for (let k = idx - 1; k >= 0; k--) if (Timing.isPlayable(items[k])) return items[k].id;
  return null;
}

// Erlaubt Item-ID oder Cue-Nummer ("3" / "#3") wie im Editor angezeigt
function resolve(rd, arg) {
  if (arg == null || arg === '') return null;
  const s = String(arg).trim();
  const m = /^#?(\d+)$/.exec(s);
  if (m && !rd.items.some(i => i.id === s)) return (playable(rd)[Number(m[1]) - 1] || {}).id || null;
  const it = rd.items.find(i => i.id === s && i.kind !== 'header');
  return it ? it.id : null;
}

function closeLog(rd, now) {
  const L = live(rd);
  if (!L.currentId) return;
  const last = L.log[L.log.length - 1];
  if (last && last.id === L.currentId && last.end == null) last.end = now;
}

function setCurrent(rd, id, now) {
  const L = live(rd);
  closeLog(rd, now);
  L.currentId = id;
  L.cueStart = now;
  L.pausedAt = null;
  if (L.status !== 'paused') L.status = 'running';
  else L.pausedAt = now;
  const item = rd.items.find(i => i.id === id);
  L.log.push({ id, start: now, end: null, planned: item ? item.duration : 0 });
  if (L.log.length > 500) L.log.splice(0, L.log.length - 500);
  if (L.nextId === id) L.nextId = null;
}

function command(rd, cmd, arg) {
  const now = Date.now();
  const L = live(rd);
  switch (cmd) {
    case 'start':
    case 'play':
      if (L.status === 'paused') return command(rd, 'resume');
      if (L.status === 'running') return true;
      {
        const id = L.nextId || (playable(rd)[0] || {}).id;
        if (!id) return false;
        L.status = 'running';
        L.showStart = now;
        L.log = [];
        setCurrent(rd, id, now);
      }
      return true;
    case 'next': {
      if (L.status === 'stopped') return command(rd, 'start');
      const id = L.nextId || after(rd, L.currentId);
      if (!id) return command(rd, 'end');
      setCurrent(rd, id, now);
      return true;
    }
    case 'prev': {
      if (L.status === 'stopped') return false;
      const id = before(rd, L.currentId);
      if (!id) { L.cueStart = now; if (L.status === 'paused') L.pausedAt = now; return true; }
      setCurrent(rd, id, now);
      return true;
    }
    case 'goto': {
      const id = resolve(rd, arg);
      if (!id) return false;
      if (L.status === 'stopped') { L.status = 'running'; L.showStart = now; L.log = []; }
      setCurrent(rd, id, now);
      return true;
    }
    case 'arm': {
      if (arg == null || arg === '') { L.nextId = null; return true; }
      const id = resolve(rd, arg);
      if (!id) return false;
      L.nextId = L.nextId === id ? null : id;
      return true;
    }
    case 'pause':
      if (L.status !== 'running') return false;
      L.status = 'paused'; L.pausedAt = now;
      return true;
    case 'resume':
      if (L.status !== 'paused') return false;
      L.cueStart += now - L.pausedAt; L.pausedAt = null; L.status = 'running';
      return true;
    case 'toggle':
      return command(rd, L.status === 'running' ? 'pause' : (L.status === 'paused' ? 'resume' : 'start'));
    case 'adjust': {
      const sec = Number(arg);
      if (!sec || L.status === 'stopped') return false;
      L.cueStart += sec * 1000;
      return true;
    }
    case 'end':
      closeLog(rd, now);
      L.status = 'stopped'; L.currentId = null; L.cueStart = null; L.pausedAt = null; L.nextId = null;
      return true;
    case 'reset':
      rd.live = emptyLive();
      return true;
    default:
      return false;
  }
}

// Kompakter Status für Companion / externe Tools
function summary(rd) {
  const now = Date.now();
  const L = live(rd);
  const t = Timing.compute(rd, L, now);
  const cur = rd.items.find(i => i.id === L.currentId) || null;
  const nextId = L.status === 'stopped' ? (L.nextId || (playable(rd)[0] || {}).id) : (L.nextId || after(rd, L.currentId));
  const next = rd.items.find(i => i.id === nextId) || null;
  const rem = cur ? Timing.remainingMs(cur, L, now) : null;
  const pl = playable(rd);
  const STATUS = { running: 'Läuft', paused: 'Pausiert', stopped: 'Bereit' };
  const num = it => it ? pl.findIndex(i => i.id === it.id) + 1 : null;
  return {
    rundown: { id: rd.id, name: rd.name },
    status: L.status,
    statusText: STATUS[L.status] || L.status,
    serverTime: now,
    current: cur ? { id: cur.id, title: cur.title, who: cur.who, info: cur.info, duration: cur.duration, durationText: Timing.fmtDur(cur.duration * 1000), index: num(cur), autoNext: cur.autoNext } : null,
    next: next ? { id: next.id, title: next.title, who: next.who, duration: next.duration, index: num(next), armed: next.id === L.nextId } : null,
    remainingMs: rem,
    remainingSec: rem == null ? null : Math.ceil(rem / 1000),
    remaining: rem == null ? '' : Timing.fmtDur(rem, { ceil: true }),
    progress: cur && cur.duration ? Math.max(0, Math.min(100, Math.round(100 - (rem / (cur.duration * 10))))) : 0,
    overUnderSec: t.overUnder == null ? null : Math.round(t.overUnder / 1000),
    elapsed: cur ? Timing.fmtDur((L.status === 'paused' ? L.pausedAt : now) - L.cueStart) : '',
    overUnderMs: t.overUnder,
    overUnder: t.overUnder == null ? '' : Timing.fmtDur(t.overUnder, { plus: true }),
    projectedEnd: t.projectedEnd && !t.relative ? Timing.fmtClock(t.projectedEnd) : '',
    plannedEnd: !t.relative ? Timing.fmtClock(t.plannedEnd) : '',
    totalDuration: Timing.fmtDur(t.total * 1000),
    cueCount: pl.length,
    cues: pl.slice(0, 64).map((i, k) => ({ n: k + 1, id: i.id, title: i.title, duration: Timing.fmtDur(i.duration * 1000) })),
  };
}

// Auto-Next: Cues mit autoNext springen nach Ablauf automatisch weiter
function tick(rd) {
  const L = rd.live;
  if (!L || L.status !== 'running' || !L.currentId) return false;
  const cur = rd.items.find(i => i.id === L.currentId);
  if (!cur || !cur.autoNext || !cur.duration) return false;
  if (Timing.remainingMs(cur, L, Date.now()) <= 0) return command(rd, 'next');
  return false;
}

module.exports = { command, summary, tick, live };
