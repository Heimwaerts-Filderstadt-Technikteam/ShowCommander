// Erzeugt die Tastenbilder als SVG (144x144) – ohne Abhängigkeiten, auch in Node testbar
(function (root) {
  const COL = {
    green: '#1e8c50', red: '#c81e28', yellow: '#e6a014', grey: '#2d323a', dark: '#14161a',
    darkred: '#6e191e', purple: '#3c2d78', offline: '#202226',
  };

  function xml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  }

  // einfacher Zeilenumbruch nach Wörtern
  function wrap(text, maxChars, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length <= maxChars) cur = (cur + ' ' + w).trim();
      else { if (cur) lines.push(cur); cur = w.length > maxChars ? w.slice(0, maxChars - 1) + '…' : w; }
      if (lines.length === maxLines) break;
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
      const last = lines[maxLines - 1];
      lines[maxLines - 1] = (last.length >= maxChars ? last.slice(0, maxChars - 1) : last) + '…';
    }
    return lines;
  }

  /**
   * opts: { bg, top, big, bigColor, lines[], bottom, progress (0-100), progressColor }
   */
  function svg(opts) {
    const bg = opts.bg || COL.dark;
    let body = '';
    if (opts.top) body += `<text x="72" y="30" font-size="20" font-weight="700" fill="#ffffffb0" text-anchor="middle" letter-spacing="1">${xml(opts.top)}</text>`;
    if (opts.big) {
      const len = String(opts.big).length;
      const size = len <= 5 ? 46 : len <= 6 ? 40 : len <= 8 ? 30 : 24;
      body += `<text x="72" y="${opts.lines?.length ? 78 : 92}" font-size="${size}" font-weight="800" fill="${opts.bigColor || '#fff'}" text-anchor="middle" font-family="Menlo,Consolas,monospace">${xml(opts.big)}</text>`;
    }
    if (opts.lines?.length) {
      const start = opts.big ? 106 : (opts.top ? 62 : 52);
      const step = 24;
      opts.lines.forEach((l, i) => {
        body += `<text x="72" y="${start + i * step}" font-size="${opts.big ? 17 : 21}" font-weight="700" fill="#fff" text-anchor="middle">${xml(l)}</text>`;
      });
    }
    if (opts.bottom) body += `<text x="72" y="130" font-size="16" font-weight="600" fill="#ffffffa0" text-anchor="middle">${xml(opts.bottom)}</text>`;
    if (opts.progress != null) {
      body += `<rect x="0" y="138" width="144" height="6" fill="#ffffff22"/><rect x="0" y="138" width="${Math.round(1.44 * Math.max(0, Math.min(100, opts.progress)))}" height="6" fill="${opts.progressColor || '#30a46c'}"/>`;
    }
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144" font-family="Helvetica,Arial,sans-serif"><rect width="144" height="144" fill="${bg}"/>${body}</svg>`;
    return 'data:image/svg+xml;charset=utf8,' + encodeURIComponent(s);
  }

  function timerColors(state) {
    const r = state?.remainingSec;
    if (state?.status === 'paused') return { bg: COL.yellow, fg: '#000', bar: '#000' };
    if (typeof r !== 'number') return { bg: COL.dark, fg: '#fff' };
    if (r < 0) return { bg: COL.red, fg: '#fff', bar: '#fff' };
    if (r <= 60) return { bg: COL.yellow, fg: '#000', bar: '#000' };
    return { bg: null, fg: '#fff', bar: '#30a46c' };
  }

  /** Liefert das Tastenbild für eine Aktion – oder null für das statische Bild aus dem Manifest */
  function render(action, settings, state, extra = {}) {
    const a = action.split('.').pop();
    if (!state) {
      if (['go', 'goto', 'display', 'pause'].includes(a)) return svg({ bg: COL.offline, top: 'OFFLINE', lines: wrap(extra.error || 'Server prüfen', 11, 3) });
      return null;
    }
    const running = state.status !== 'stopped';
    const tc = timerColors(state);
    switch (a) {
      case 'go':
        if (!running) return svg({ bg: COL.green, top: 'START', lines: wrap(state.next?.title || '', 11, 3) });
        return svg({ bg: tc.bg || COL.green, top: state.next ? 'WEITER' : 'ENDE', big: state.remaining, bigColor: tc.fg,
          lines: wrap(state.next ? '→ ' + state.next.title : '', 12, 1), progress: state.progress, progressColor: tc.bar });
      case 'pause':
        return svg({ bg: state.status === 'paused' ? COL.yellow : COL.grey, top: state.status === 'paused' ? 'PAUSIERT' : 'PAUSE',
          big: state.status === 'paused' ? '▶' : '❚❚', bigColor: state.status === 'paused' ? '#000' : '#fff' });
      case 'adjust': {
        const s = Number(settings.seconds ?? 60);
        const m = Math.floor(Math.abs(s) / 60), sec = Math.abs(s) % 60;
        return svg({ bg: COL.grey, top: s >= 0 ? 'LÄNGER' : 'KÜRZER', big: `${s >= 0 ? '+' : '−'}${m}:${String(sec).padStart(2, '0')}` });
      }
      case 'goto': {
        const n = Number(settings.cue || 1);
        const cue = state.cues?.find(c => c.n === n);
        const isCur = running && state.current?.index === n;
        const isNext = state.next?.index === n;
        return svg({ bg: isCur ? COL.red : isNext ? '#3a3f48' : COL.dark, top: `#${n}${isCur ? ' ● JETZT' : isNext ? ' DANACH' : ''}`,
          lines: wrap(cue ? cue.title : '—', 11, 3), bottom: cue?.duration, progress: isCur ? state.progress : null, progressColor: '#fff' });
      }
      case 'display': {
        const mode = settings.mode || 'remaining';
        if (mode === 'remaining') return svg({ bg: tc.bg || COL.dark, top: state.statusText?.toUpperCase(), big: state.remaining || '--:--', bigColor: tc.fg, progress: running ? state.progress : null, progressColor: tc.bar });
        if (mode === 'current') return svg({ bg: running ? '#5a0f14' : COL.dark, top: 'JETZT', lines: wrap(state.current?.title || '–', 11, 4) });
        if (mode === 'next') return svg({ bg: COL.dark, top: 'DANACH', lines: wrap(state.next?.title || 'Ende', 11, 4) });
        if (mode === 'overunder') {
          const ou = state.overUnderSec;
          return svg({ bg: COL.dark, top: 'ÜBER/UNTER', big: state.overUnder || '--:--', bigColor: ou == null ? '#fff' : ou > 30 ? '#ff5a5a' : ou < -30 ? '#5adc8c' : '#fff' });
        }
        if (mode === 'end') return svg({ bg: COL.dark, top: running ? 'ENDE ERW.' : 'ENDE GEPL.', big: (running ? state.projectedEnd : state.plannedEnd) || '--:--' });
        if (mode === 'clock') {
          const d = new Date(); const p = x => String(x).padStart(2, '0');
          return svg({ bg: COL.dark, top: 'UHRZEIT', big: `${p(d.getHours())}:${p(d.getMinutes())}`, bottom: `:${p(d.getSeconds())}` });
        }
        return null;
      }
      default:
        return null; // prev, end: statische Bilder
    }
  }

  const api = { render, svg, wrap };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Keys = api;
})(this);
