// Vorlagen: Abläufe als wiederverwendbare Struktur speichern und anwenden
//
// Eine Vorlage ist ein normaler Rundown mit isTemplate = true. Jeder Punkt merkt sich:
//   tplCt      – stammte ursprünglich aus ChurchTools (kommt beim CT-Import von dort)
//   (Einsortieren erfolgt hinter dem Punkt, der in der Vorlage direkt davor steht – per Titel)
//
// Anwenden auf einen ChurchTools-Ablauf:
//   - eigene Vorlagen-Punkte werden hinter dem CT-Punkt mit passendem Titel eingefügt
//     (ohne Treffer: am Anfang bzw. am Ende)
//   - für CT-Punkte mit gleichem Titel werden Notizen, eigene Spalten, Farbe, Prompter-Text,
//     Auto-Weiter und feste Startzeit aus der Vorlage übernommen (nur wenn dort noch leer)
//   - Spalten der Vorlage werden ergänzt
const store = require('./store');

const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const LOCAL_FIELDS = ['notes', 'color', 'script', 'hardStart'];

function cloneItem(it, extra = {}) {
  const c = JSON.parse(JSON.stringify(it));
  delete c.id;
  return store.newItem({ ...c, ...extra });
}

/** Aus einem Ablauf eine Vorlage machen */
function makeTemplate(rd, { name, description } = {}) {
  const items = rd.items.map(it => {
    const t = cloneItem(it, { source: 'custom', ctId: null, overrides: [], tplRef: null });
    t.tplCt = it.source === 'ct' || !!it.tplCt;
    return t;
  });
  return store.create({
    name: name || `${rd.name} (Vorlage)`,
    description: description || '',
    isTemplate: true,
    columns: JSON.parse(JSON.stringify(rd.columns || [])),
    items,
    todos: (rd.todos || []).map(t => ({ ...t, id: undefined, done: false })),
    todoBuffer: rd.todoBuffer || 0,
    todoPostBuffer: rd.todoPostBuffer || 0,
  });
}

/** Spalten der Vorlage übernehmen; liefert Map Vorlagen-Spalten-ID -> Ziel-Spalten-ID */
function mergeColumns(rd, tpl) {
  const map = {};
  for (const c of tpl.columns || []) {
    let target = rd.columns.find(x => x.id === c.id) || rd.columns.find(x => norm(x.name) === norm(c.name));
    if (!target) { target = { id: c.id, name: c.name }; rd.columns.push(target); }
    map[c.id] = target.id;
  }
  return map;
}

function mapCells(cells, colMap) {
  const out = {};
  for (const [k, v] of Object.entries(cells || {})) if (v) out[colMap[k] || k] = v;
  return out;
}

/**
 * Vorlage auf bestehenden Ablauf anwenden.
 * full = true: alle Vorlagen-Punkte übernehmen (leerer Ablauf / "Neu aus Vorlage")
 * full = false: nur eigene Punkte einsortieren + Details auf passende Punkte übertragen (CT-Ablauf)
 */
function mergeTodos(rd, tpl) {
  rd.todos = rd.todos || [];
  const have = new Set(rd.todos.map(t => norm(t.title)));
  let n = 0;
  for (const t of tpl.todos || []) {
    if (have.has(norm(t.title))) continue;
    rd.todos.push(store.newTodo({ ...t, id: undefined, done: false }));
    n++;
  }
  if (!rd.todoBuffer && tpl.todoBuffer) rd.todoBuffer = tpl.todoBuffer;
  if (!rd.todoPostBuffer && tpl.todoPostBuffer) rd.todoPostBuffer = tpl.todoPostBuffer;
  return n;
}

function applyTemplate(rd, tpl, { full = false } = {}) {
  const colMap = mergeColumns(rd, tpl);
  const stats = { inserted: 0, enriched: 0, skipped: 0, todos: mergeTodos(rd, tpl) };
  const existingRefs = new Set(rd.items.map(i => i.tplRef).filter(Boolean));

  if (full) {
    for (const it of tpl.items) {
      const ref = `${tpl.id}:${it.id}`;
      if (existingRefs.has(ref)) { stats.skipped++; continue; }
      const n = cloneItem(it, { source: 'custom', tplRef: ref });
      n.cells = mapCells(it.cells, colMap);
      delete n.tplCt;
      rd.items.push(n);
      stats.inserted++;
    }
    rd.templateId = tpl.id;
    return stats;
  }

  // 1) Details auf passende Punkte übertragen (gleicher Titel, gleiche Art)
  const used = new Set();
  for (const t of tpl.items.filter(i => i.tplCt)) {
    const target = rd.items.find(i => !used.has(i.id) && i.kind === t.kind && norm(i.title) === norm(t.title) && !i.tplRef);
    if (!target) continue;
    used.add(target.id);
    let changed = false;
    for (const f of LOCAL_FIELDS) if (!target[f] && t[f]) { target[f] = t[f]; changed = true; }
    if (t.autoNext && !target.autoNext) { target.autoNext = true; changed = true; }
    const cells = mapCells(t.cells, colMap);
    for (const [k, v] of Object.entries(cells)) if (!target.cells?.[k]) { target.cells = { ...target.cells, [k]: v }; changed = true; }
    if (changed) stats.enriched++;
  }

  // 2) Eigene Vorlagen-Punkte einsortieren
  const lastInsertedAfter = new Map(); // Anker-Item-ID -> zuletzt dahinter eingefügtes Item (Reihenfolge erhalten)
  let topInsertIdx = 0;
  let prevTitle = null;
  const withAnchor = tpl.items.map(i => { const a = { item: i, anchor: prevTitle }; if (i.title) prevTitle = i.title; return a; });
  for (const { item: t, anchor } of withAnchor.filter(x => !x.item.tplCt)) {
    const ref = `${tpl.id}:${t.id}`;
    if (existingRefs.has(ref)) { stats.skipped++; continue; }
    const n = cloneItem(t, { source: 'custom', tplRef: ref });
    n.cells = mapCells(t.cells, colMap);
    delete n.tplCt;

    if (!anchor) {
      rd.items.splice(topInsertIdx++, 0, n);
    } else {
      // zuerst Punkt mit gleichem Titel (bevorzugt aus CT), sonst ans Ende
      const anchorItem = rd.items.find(i => i.source === 'ct' && norm(i.title) === norm(anchor))
        || rd.items.find(i => i.id !== n.id && norm(i.title) === norm(anchor));
      if (anchorItem) {
        const after = lastInsertedAfter.get(anchorItem.id) || anchorItem;
        rd.items.splice(rd.items.indexOf(after) + 1, 0, n);
        lastInsertedAfter.set(anchorItem.id, n);
      } else {
        rd.items.push(n);
      }
      // Folgepunkte, die hinter diesem eigenen Punkt standen, sollen auch dahinter landen
      lastInsertedAfter.set(n.id, n);
    }
    stats.inserted++;
  }
  rd.templateId = tpl.id;
  return stats;
}

function instantiate(tpl, { name, startTime } = {}) {
  const rd = store.create({ name: name || tpl.name.replace(/\s*\(Vorlage\)$/, ''), startTime: startTime || null, columns: [], templateId: tpl.id });
  applyTemplate(rd, tpl, { full: true });
  store.save(rd);
  return rd;
}

/** Beispielvorlage beim allerersten Start anlegen */
function seedDefaults() {
  if (store.list().some(r => r.isTemplate)) return;
  const col = { id: store.uid('c'), name: 'Technik' };
  const I = (title, d, extra = {}) => store.newItem({ title, duration: d, ...extra });
  const items = [
    I('Stream-Countdown', 300, { color: '#3d8bfd', notes: 'Countdown-Video starten, Stream live', cells: { [col.id]: 'OBS: Szene Countdown' } }),
    Object.assign(I('Begrüßung', 180, { cells: { [col.id]: 'Kamera 1 Halbtotale' } }), { tplCt: true }),
    I('Video: Ankündigungen', 120, { color: '#7c5cff', cells: { [col.id]: 'Video einspielen' } }),
    Object.assign(I('Predigt', 1800, { cells: { [col.id]: 'Kamera 2 Nah, Bauchbinde Prediger' } }), { tplCt: true }),
    I('Abmoderation & Stream-Ende', 120, { color: '#3d8bfd', cells: { [col.id]: 'OBS: Endszene, Stream beenden' } }),
  ];
  store.create({
    name: 'Gottesdienst mit Livestream (Beispiel)',
    description: 'Beispiel: Stream-Countdown vor dem Gottesdienst, Ankündigungsvideo nach der Begrüßung, Stream-Ende nach der Predigt. Beim ChurchTools-Import werden diese eigenen Punkte passend einsortiert.',
    isTemplate: true,
    columns: [col],
    items,
  });
}

module.exports = { makeTemplate, applyTemplate, instantiate, seedDefaults };
