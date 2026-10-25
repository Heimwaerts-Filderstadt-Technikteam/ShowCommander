// Erkennt in importierten Zeilen (aus PDF/DOCX/XLSX/CSV/TXT) Ablaufpunkte.
// Läuft im Browser und in Node (für Tests).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ImportMap = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const FIELDS = [
    { id: 'ignore', label: '– ignorieren –' },
    { id: 'time', label: 'Uhrzeit (Start)' },
    { id: 'end', label: 'Uhrzeit (Ende)' },
    { id: 'duration', label: 'Dauer' },
    { id: 'title', label: 'Titel' },
    { id: 'who', label: 'Verantwortlich' },
    { id: 'info', label: 'Info (Lied, Tonart …)' },
    { id: 'notes', label: 'Notizen' },
  ];

  const HEADER_RX = [
    ['end', /^(ende|bis|end|uhrzeit ende|endzeit)\b/i],
    ['time', /^(uhr)?zeit\b|^start|^beginn|^uhrzeit|^von\b|^time\b|^wann/i],
    ['duration', /dauer|länge|laenge|^min\b|minuten|duration|length|^zeitbedarf/i],
    ['who', /^wer\b|verantw|person|mitwirk|leitung|sprecher|moderat|^who\b|zuständig|zustaendig|^name/i],
    ['info', /^lied|^song|tonart|medien|^info|material|^musik/i],
    ['notes', /bemerk|notiz|hinweis|kommentar|^notes?\b|technik|anmerk|regie|^licht|^ton\b|^kamera|^video|^beamer/i],
    ['title', /programm|punkt|titel|ablauf|inhalt|^was\b|thema|^item|^title|beschreib|element|^teil|^bezeichnung|^aktion/i],
  ];

  const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();
  const RX_TIME = /^(\d{1,2})[:.](\d{2})(?:\s*uhr)?$|^(\d{1,2})\s*uhr$/i;

  function parseTime(s) {
    const m = RX_TIME.exec(norm(s));
    if (!m) return null;
    const h = Number(m[1] ?? m[3]), min = Number(m[2] ?? 0);
    return h < 24 && min < 60 ? h * 60 + min : null;
  }

  // Dauer → Sekunden. "30 min", "3", "0:03" (h:mm), "5:00" (m:ss), "1:02:00", "90 s", "1 Std", "15'"
  function parseDuration(s) {
    let v = norm(s).toLowerCase().replace(',', '.');
    if (!v) return null;
    let m;
    if ((m = /^(\d+(?:\.\d+)?)\s*(s|sek|sek\.|sekunden|sec)$/.exec(v))) return Math.round(+m[1]);
    if ((m = /^(\d+(?:\.\d+)?)\s*(h|std|std\.|stunden?)$/.exec(v))) return Math.round(+m[1] * 3600);
    if ((m = /^(\d+(?:\.\d+)?)\s*(m|min|min\.|minuten|'|′|’)?$/.exec(v))) return Math.round(+m[1] * 60);
    if ((m = /^(\d+):(\d{2}):(\d{2})$/.exec(v))) return +m[1] * 3600 + +m[2] * 60 + +m[3];
    if ((m = /^(\d+):(\d{2})\s*(min|h|std)?$/.exec(v))) {
      if (m[3] === 'h' || m[3] === 'std' || +m[1] === 0) return +m[1] * 3600 + +m[2] * 60; // 0:03 = 3 min
      return +m[1] * 60 + +m[2]; // 5:00 = 5 min
    }
    return null;
  }

  function cellsOf(row) { return (row.cells || []).map(norm); }
  const nonEmpty = cells => cells.filter(Boolean).length;
  const isJunk = line => /^(seite|page)\s*\d+(\s*(von|of|\/)\s*\d+)?$/i.test(line) || /^\d{1,3}$/.test(line) || /^[-–—_=.\s]+$/.test(line);

  function detectDate(rows) {
    for (const r of rows.slice(0, 15)) {
      const m = /(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2,4})/.exec(cellsOf(r).join(' '));
      if (m) {
        const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
        const d = new Date(y, +m[2] - 1, +m[1]);
        if (!isNaN(d)) return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
      }
    }
    return null;
  }

  function headerScore(cells) {
    const fields = cells.map(c => { for (const [f, rx] of HEADER_RX) if (rx.test(c)) return f; return null; });
    return { fields, score: fields.filter(Boolean).length };
  }

  // PDF-Zeilen: Zellen anhand der x-Positionen den Kopfzeilen-Spalten zuordnen
  function alignByX(row, headerXs) {
    if (!row.xs || !headerXs) return cellsOf(row);
    const out = headerXs.map(() => '');
    row.cells.forEach((c, i) => {
      const x = row.xs[i];
      let col = 0;
      for (let k = 0; k < headerXs.length; k++) if (x >= headerXs[k] - 8) col = k;
      out[col] = norm(out[col] ? out[col] + ' ' + c : c);
    });
    return out;
  }

  /** Analyse: Tabellen- oder Zeilenmodus, Kopfzeile, Spaltenzuordnung, Name, Datum */
  function analyze(rows) {
    rows = rows.filter(r => nonEmpty(cellsOf(r)));
    const date = detectDate(rows);
    // Kopfzeile suchen
    let headerIndex = -1, best = 0, fields = null;
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const h = headerScore(cellsOf(rows[i]));
      if (h.score >= 2 && h.score > best && nonEmpty(cellsOf(rows[i])) >= 2) { best = h.score; headerIndex = i; fields = h.fields; }
    }
    const multi = rows.filter(r => nonEmpty(cellsOf(r)) >= 2).length;
    const mode = headerIndex >= 0 || (multi >= 3 && multi >= rows.length * 0.5) ? 'table' : 'lines';

    // Name: erste Überschrift / erste Zeile vor dem eigentlichen Ablauf
    let name = '';
    const pre = rows.slice(0, headerIndex >= 0 ? headerIndex : 3);
    const h = pre.find(r => r.heading) || (mode === 'table' ? pre[0] : rows.find(r => r.heading));
    if (h) name = cellsOf(h).filter(Boolean).join(' ');

    let mapping = [];
    if (mode === 'table') {
      const width = Math.max(...rows.map(r => (r.cells || []).length), headerIndex >= 0 ? rows[headerIndex].cells.length : 0);
      if (fields) {
        mapping = Array.from({ length: width }, (_, i) => fields[i] || 'ignore');
      } else {
        mapping = guessColumns(rows, width);
      }
      // jede Feldart nur einmal, Titel muss existieren
      const seen = new Set();
      mapping = mapping.map(f => (f !== 'ignore' && f !== 'notes' && seen.has(f) ? 'notes' : (seen.add(f), f)));
      if (!mapping.includes('title')) {
        const i = mapping.findIndex(f => f === 'ignore' || f === 'notes');
        if (i >= 0) mapping[i] = 'title';
      }
    }
    return { mode, headerIndex, mapping, name, date, headerXs: headerIndex >= 0 ? rows[headerIndex].xs || null : null };
  }

  function guessColumns(rows, width) {
    const stats = Array.from({ length: width }, () => ({ time: 0, dur: 0, len: 0, n: 0 }));
    for (const r of rows) cellsOf(r).forEach((c, i) => {
      if (!c || i >= width) return;
      const s = stats[i]; s.n++; s.len += c.length;
      if (parseTime(c) != null) s.time++;
      else if (parseDuration(c) != null) s.dur++;
    });
    const map = stats.map(() => 'ignore');
    const by = (fn) => stats.map((s, i) => [i, fn(s)]).filter(([i]) => map[i] === 'ignore').sort((a, b) => b[1] - a[1])[0];
    let t = by(s => s.n ? s.time / s.n : 0); if (t && t[1] > 0.5) map[t[0]] = 'time';
    let d = by(s => s.n ? s.dur / s.n : 0); if (d && d[1] > 0.5) map[d[0]] = 'duration';
    let ti = by(s => s.n ? s.len / s.n : 0); if (ti) map[ti[0]] = 'title';
    // übrige Textspalten: erste = Verantwortlich, Rest = Notizen
    stats.forEach((s, i) => { if (map[i] === 'ignore' && s.n) map[i] = map.includes('who') ? 'notes' : 'who'; });
    // "Wer" sollte rechts vom Titel stehen – sonst tauschen
    const wi = map.indexOf('who'), tiI = map.indexOf('title');
    if (wi >= 0 && tiI >= 0 && wi < tiI && stats[wi].len / (stats[wi].n || 1) > stats[tiI].len / (stats[tiI].n || 1) * 0.8) { map[wi] = 'title'; map[tiI] = 'who'; }
    return map;
  }

  // Einzelne Textzeile zerlegen: "10:15 Begrüßung (5 min) – Anna"
  function parseLine(line) {
    let s = norm(line).replace(/^([•·\-–*]|\d{1,2}[.)])\s+/, '');
    const out = { title: '', who: '', start: null, end: null, duration: null };
    let m = /^(\d{1,2}[:.]\d{2}(?:\s*uhr)?|\d{1,2}\s*uhr)(?:\s*[-–]\s*(\d{1,2}[:.]\d{2}(?:\s*uhr)?))?\s*[|:–-]?\s+/i.exec(s);
    if (m) { out.start = parseTime(m[1]); if (m[2]) out.end = parseTime(m[2]); s = s.slice(m[0].length); }
    m = /\s*[([]?\s*(?:ca\.?\s*)?(\d{1,3})\s*(min\.?|minuten|'|′|’)\s*[)\]]?/i.exec(s);
    if (m) { out.duration = Number(m[1]) * 60; s = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).trim(); }
    const parts = s.split(/\s+[–—|]\s+|\s+-\s+|\t/);
    if (parts.length >= 2 && parts[parts.length - 1].length <= 40) { out.who = parts.pop().trim(); s = parts.join(' – '); }
    out.title = norm(s).replace(/[,;:–-]\s*$/, '');
    return out;
  }

  function looksLikeSection(text, row) {
    if (row.heading) return true;
    const t = norm(text);
    if (!t || t.length > 50 || /\d{1,2}[:.]\d{2}/.test(t)) return false;
    const letters = t.replace(/[^A-Za-zÄÖÜäöüß]/g, '');
    if (letters.length >= 3 && letters === letters.toUpperCase()) return true;
    return /:$/.test(t) && t.split(' ').length <= 5;
  }

  /** Erzeugt die Punkte. mapping/headerIndex aus analyze (ggf. vom Nutzer angepasst). */
  function convert(rows, a) {
    rows = rows.filter(r => nonEmpty(cellsOf(r)));
    const items = [];
    let skippedName = false;
    const header = a.headerIndex >= 0 ? cellsOf(rows[a.headerIndex]).join('|').toLowerCase() : null;

    rows.forEach((row, idx) => {
      if (a.mode === 'table' && a.headerIndex >= 0 && idx <= a.headerIndex) return;
      const cells = a.mode === 'table' ? alignByX(row, a.headerXs) : cellsOf(row);
      const joined = cells.filter(Boolean).join(' ');
      if (!joined || isJunk(joined)) return;
      if (header && cells.join('|').toLowerCase() === header) return; // wiederholte Kopfzeile (PDF-Seiten)
      if (!skippedName && a.name && norm(joined) === norm(a.name)) { skippedName = true; return; }

      if (a.mode === 'table') {
        const get = f => { const i = a.mapping.indexOf(f); return i >= 0 ? cells[i] || '' : ''; };
        const notes = a.mapping.map((f, i) => (f === 'notes' && cells[i] ? cells[i] : null)).filter(Boolean).join('\n');
        const it = {
          kind: 'cue', title: get('title'), who: get('who'), info: get('info'), notes,
          start: parseTime(get('time')), end: parseTime(get('end')), duration: parseDuration(get('duration')),
        };
        // nur ein Eintrag in der Zeile, keine Zeit/Dauer → Abschnitt
        if (nonEmpty(cells) === 1 && it.start == null && it.duration == null && looksLikeSection(joined, row)) {
          items.push({ kind: 'header', title: joined }); return;
        }
        if (!it.title) it.title = joined;
        items.push(it);
      } else {
        if (looksLikeSection(joined, row) && !/\d{1,2}[:.]\d{2}/.test(joined)) {
          if (!items.length && !a.name) { a.name = joined; return; }
          items.push({ kind: 'header', title: joined.replace(/:$/, '') }); return;
        }
        const p = parseLine(cells.length > 1 ? cells.join('\t') : joined);
        items.push({ kind: 'cue', title: p.title, who: p.who, info: '', notes: '', start: p.start, end: p.end, duration: p.duration });
      }
    });

    // Dauer aus Start/Ende bzw. Abstand zum nächsten Start ergänzen
    const cues = items.filter(i => i.kind === 'cue');
    cues.forEach((it, i) => {
      if (it.duration != null) return;
      if (it.start != null && it.end != null && it.end > it.start) { it.duration = (it.end - it.start) * 60; return; }
      const next = cues.slice(i + 1).find(n => n.start != null);
      if (it.start != null && next && next.start > it.start && next.start - it.start <= 360) it.duration = (next.start - it.start) * 60;
    });
    for (const it of cues) { it.include = true; if (it.duration == null) it.duration = 0; }
    items.filter(i => i.kind === 'header').forEach(i => { i.include = true; i.duration = 0; });

    const first = cues.find(i => i.start != null);
    return { items, firstStart: first ? first.start : null };
  }

  return { FIELDS, analyze, convert, parseTime, parseDuration, parseLine };
});
