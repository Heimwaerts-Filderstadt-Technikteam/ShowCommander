// Import-Dialog (Dashboard + Editor): Datei/Text → Vorschau → Ablauf
(function () {
  const PDFJS = '/static/vendor/pdfjs/'; // pdf.js 3.11 (Mozilla, Apache-2.0) – lokal mitgeliefert, kein Internet nötig
  let state = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('pdf.js konnte nicht geladen werden'));
      document.head.appendChild(s);
    });
  }

  // PDF → Zeilen mit Zellen (anhand von Abständen) und x-Positionen
  async function pdfRows(buf) {
    await loadScript(PDFJS + 'pdf.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.js';
    const doc = await window.pdfjsLib.getDocument({ data: buf, cMapUrl: PDFJS + 'cmaps/', cMapPacked: true }).promise;
    const rows = [];
    for (let p = 1; p <= Math.min(doc.numPages, 40); p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({
        x: i.transform[4], y: i.transform[5], h: Math.abs(i.transform[3]) || i.height || 10, w: i.width, s: i.str,
      }));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines = [];
      for (const it of items) {
        const line = lines.find(l => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.4));
        if (line) line.items.push(it); else lines.push({ y: it.y, items: [it] });
      }
      const allH = items.map(i => i.h).sort((a, b) => a - b);
      const medianH = allH[Math.floor(allH.length / 2)] || 10;
      lines.sort((a, b) => b.y - a.y);
      for (const l of lines) {
        l.items.sort((a, b) => a.x - b.x);
        const cells = [], xs = [];
        let cur = null, curEnd = 0;
        for (const it of l.items) {
          const gap = it.x - curEnd;
          if (!cur || gap > Math.max(it.h * 1.2, 8)) {
            if (cur) cells.push(cur.trim());
            cur = it.s; xs.push(it.x);
          } else cur += (gap > it.h * 0.15 && !cur.endsWith(' ') && !it.s.startsWith(' ') ? ' ' : '') + it.s;
          curEnd = it.x + it.w;
        }
        if (cur) cells.push(cur.trim());
        const maxH = Math.max(...l.items.map(i => i.h));
        rows.push({ cells, xs, heading: maxH > medianH * 1.3 });
      }
    }
    return rows;
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result); r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(file);
    });
  }
  function toBase64(buf) {
    const bytes = new Uint8Array(buf); let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function ensureDialog() {
    if (document.getElementById('dlgImportFile')) return;
    const d = document.createElement('dialog');
    d.id = 'dlgImportFile';
    d.style.width = 'min(1100px, 96vw)';
    d.innerHTML = `
      <div class="dlg-head"><h3 id="impTitle">Ablauf aus Datei importieren</h3><button class="btn icon" data-x>✕</button></div>
      <div class="dlg-body" id="impBody"></div>
      <div class="dlg-foot" id="impFoot"></div>`;
    document.body.appendChild(d);
    d.querySelector('[data-x]').onclick = () => d.close();
  }

  function step1() {
    const body = $('#impBody'), foot = $('#impFoot');
    body.innerHTML = `
      <label id="impDrop" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border:2px dashed var(--line);border-radius:10px;padding:34px;cursor:pointer;text-align:center">
        <strong>Datei hierher ziehen oder klicken</strong>
        <span class="muted">PDF, Word (.docx), LibreOffice (.odt), Excel (.xlsx), CSV oder Text</span>
        <input type="file" id="impFile" accept=".pdf,.docx,.odt,.xlsx,.xlsm,.csv,.txt,.md" style="display:none">
      </label>
      <p class="muted" style="margin:14px 0 6px">… oder Ablauf als Text einfügen (eine Zeile pro Punkt, z. B. „10:15 Begrüßung (5 min) – Anna“):</p>
      <textarea id="impText" style="min-height:140px" placeholder="10:00 Countdown (5 min)\n10:05 Begrüßung – Anna\nLOBPREIS\n10:08 Lieder (12 min) – Band\n10:20 Predigt (30 min) – Pastor Max"></textarea>
      <div id="impStatus" class="muted" style="margin-top:8px"></div>`;
    foot.innerHTML = `<button class="btn" data-cancel>Abbrechen</button><button class="btn primary" id="impNext">Weiter →</button>`;
    foot.querySelector('[data-cancel]').onclick = () => $('#dlgImportFile').close();
    const drop = $('#impDrop');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = 'var(--accent)'; });
    drop.addEventListener('dragleave', () => { drop.style.borderColor = ''; });
    drop.addEventListener('drop', e => { e.preventDefault(); drop.style.borderColor = ''; if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
    $('#impFile').onchange = e => e.target.files[0] && handleFile(e.target.files[0]);
    $('#impNext').onclick = async () => {
      const text = $('#impText').value.trim();
      if (!text) return toast('Bitte Datei wählen oder Text einfügen', 'error');
      try { const r = await api('POST', '/api/import/extract', { text }); prepare(r.rows, 'Text'); } catch (err) { toast(err.message, 'error'); }
    };
  }

  async function handleFile(file) {
    const st = $('#impStatus');
    st.textContent = `Lese „${file.name}“ …`;
    try {
      const buf = await readFile(file);
      const ext = file.name.split('.').pop().toLowerCase();
      let rows;
      if (ext === 'pdf') rows = await pdfRows(buf);
      else rows = (await api('POST', '/api/import/extract', { filename: file.name, data: toBase64(buf) })).rows;
      if (!rows.length) throw new Error('In der Datei wurde kein Text gefunden' + (ext === 'pdf' ? ' (eingescanntes PDF? Dann bitte als Text/Word exportieren)' : ''));
      prepare(rows, file.name);
    } catch (err) {
      st.innerHTML = `<span class="over">✖ ${esc(err.message)}</span>`;
    }
  }

  async function prepare(rows, sourceName) {
    const a = ImportMap.analyze(rows);
    state.rows = rows; state.analysis = a; state.source = sourceName;
    if (!state.templates) {
      try { state.templates = (await api('GET', '/api/rundowns')).filter(r => r.isTemplate); } catch { state.templates = []; }
    }
    recompute();
    step2();
  }

  function recompute() {
    const res = ImportMap.convert(state.rows, { ...state.analysis });
    state.items = res.items;
    state.firstStart = res.firstStart;
  }

  const pad = n => String(n).padStart(2, '0');
  function nextSunday() {
    const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function step2() {
    const a = state.analysis, body = $('#impBody'), foot = $('#impFoot');
    const target = state.opts.targetId;
    const tableRows = state.rows.filter(r => (r.cells || []).some(c => String(c).trim()));
    const headerCells = a.headerIndex >= 0 ? tableRows[a.headerIndex].cells : null;
    const sample = i => headerCells ? headerCells[i] : (tableRows.find(r => r.cells[i]) || { cells: [] }).cells[i];

    body.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        <span class="badge">${esc(state.source)}</span>
        <label class="muted" style="display:flex;gap:6px;align-items:center">Erkannt als
          <select id="impMode" style="width:auto">
            <option value="table" ${a.mode === 'table' ? 'selected' : ''}>Tabelle (Spalten)</option>
            <option value="lines" ${a.mode === 'lines' ? 'selected' : ''}>Text (eine Zeile pro Punkt)</option>
          </select></label>
        <span class="muted" id="impCount"></span>
      </div>
      ${a.mode === 'table' ? `<div style="margin-bottom:12px"><div class="muted" style="font-size:12px;margin-bottom:4px">Spalten zuordnen:</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${a.mapping.map((f, i) => `
          <label style="display:flex;flex-direction:column;gap:3px;min-width:130px"><span class="muted" style="font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(sample(i))}">Spalte ${i + 1}: ${esc(sample(i) || '–')}</span>
          <select data-col="${i}">${ImportMap.FIELDS.map(F => `<option value="${F.id}" ${F.id === f ? 'selected' : ''}>${F.label}</option>`).join('')}</select></label>`).join('')}
        </div></div>` : ''}
      ${target ? '' : `<div class="row2" style="grid-template-columns:2fr 1fr 1fr">
        <label class="field"><span>Name des Ablaufs</span><input type="text" id="impName" value="${esc(a.name || state.source.replace(/\.[^.]+$/, ''))}"></label>
        <label class="field"><span>Datum</span><input type="date" id="impDate" value="${a.date || nextSunday()}"></label>
        <label class="field"><span>Startzeit</span><input type="time" id="impTime" value="${state.firstStart != null ? pad(Math.floor(state.firstStart / 60)) + ':' + pad(state.firstStart % 60) : '10:00'}"></label>
      </div>`}
      <label class="field"><span>Vorlage anwenden (optional – fügt eigene Punkte und Technik-Infos ein)</span>
        <select id="impTpl"><option value="">– keine –</option>${(state.templates || []).map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>
      <div style="max-height:46vh;overflow:auto;border:1px solid var(--line);border-radius:8px">
        <table class="rd" style="min-width:0"><thead><tr>
          <th style="width:30px"><input type="checkbox" id="impAll" checked></th><th style="width:110px">Art</th><th>Titel</th><th style="width:160px">Verantwortlich</th><th style="width:80px">Dauer</th><th>Notizen</th>
        </tr></thead><tbody id="impRows"></tbody></table>
      </div>`;
    renderRows();
    foot.innerHTML = `<button class="btn" id="impBack">← Andere Datei</button><span class="spacer"></span>
      <button class="btn primary" id="impGo">${target ? 'An Ablauf anhängen' : 'Ablauf erstellen'}</button>`;
    $('#impBack').onclick = step1;
    $('#impGo').onclick = submit;
    $('#impMode').onchange = e => {
      state.analysis.mode = e.target.value;
      if (state.analysis.mode === 'table' && !state.analysis.mapping.length) state.analysis = { ...ImportMap.analyze(state.rows), mode: 'table' };
      recompute(); step2();
    };
    $$('#impBody [data-col]').forEach(s => s.onchange = () => {
      state.analysis.mapping[Number(s.dataset.col)] = s.value;
      recompute(); renderRows();
    });
    $('#impAll').onchange = e => { state.items.forEach(i => { i.include = e.target.checked; }); renderRows(); };
  }

  function renderRows() {
    const tb = $('#impRows');
    tb.innerHTML = state.items.map((it, i) => `
      <tr class="${it.kind === 'header' ? 'header' : 'cue'}" data-i="${i}" style="${it.include ? '' : 'opacity:.4'}">
        <td><input type="checkbox" data-f="include" ${it.include ? 'checked' : ''}></td>
        <td><select data-f="kind" style="padding:4px"><option value="cue" ${it.kind === 'cue' ? 'selected' : ''}>Punkt</option><option value="header" ${it.kind === 'header' ? 'selected' : ''}>Abschnitt</option></select></td>
        <td><input type="text" data-f="title" value="${esc(it.title)}" style="padding:4px 6px"></td>
        <td>${it.kind === 'header' ? '' : `<input type="text" data-f="who" value="${esc(it.who || '')}" style="padding:4px 6px">`}</td>
        <td>${it.kind === 'header' ? '' : `<input type="text" data-f="duration" class="mono" value="${Timing.fmtDur((it.duration || 0) * 1000)}" style="padding:4px 6px;width:70px">`}</td>
        <td>${it.kind === 'header' ? '' : `<input type="text" data-f="notes" value="${esc([it.info, it.notes].filter(Boolean).join(' · '))}" style="padding:4px 6px">`}</td>
      </tr>`).join('') || '<tr><td colspan="6" class="muted" style="padding:20px;text-align:center">Keine Punkte erkannt – Zuordnung oder Modus ändern.</td></tr>';
    const n = state.items.filter(i => i.include && i.kind === 'cue');
    $('#impCount').textContent = `${n.length} Punkte · ${Timing.fmtDur(n.reduce((s, i) => s + (i.duration || 0), 0) * 1000)}`;
    tb.oninput = tb.onchange = e => {
      const tr = e.target.closest('tr[data-i]'); if (!tr) return;
      const it = state.items[Number(tr.dataset.i)], f = e.target.dataset.f;
      if (f === 'include') { it.include = e.target.checked; tr.style.opacity = it.include ? '' : .4; }
      else if (f === 'kind') { it.kind = e.target.value; renderRows(); return; }
      else if (f === 'duration') { if (e.type === 'change') { const s = Timing.parseDur(e.target.value); if (s != null) it.duration = s; e.target.value = Timing.fmtDur(it.duration * 1000); } return; }
      else if (f === 'notes') { it.notes = e.target.value; it.info = ''; }
      else it[f] = e.target.value;
      if (e.type === 'change') { const n2 = state.items.filter(i => i.include && i.kind === 'cue'); $('#impCount').textContent = `${n2.length} Punkte · ${Timing.fmtDur(n2.reduce((s, i) => s + (i.duration || 0), 0) * 1000)}`; }
    };
  }

  async function submit() {
    const items = state.items.filter(i => i.include && (i.title || '').trim()).map(i => ({
      kind: i.kind, title: i.title.trim(), who: i.who || '', info: i.info || '', notes: i.notes || '', duration: i.kind === 'header' ? 0 : i.duration || 0,
    }));
    if (!items.length) return toast('Keine Punkte ausgewählt', 'error');
    const body = { items, templateId: $('#impTpl').value || null };
    if (state.opts.targetId) body.targetId = state.opts.targetId;
    else {
      body.name = $('#impName').value || 'Importierter Ablauf';
      const date = $('#impDate').value, time = $('#impTime').value;
      if (date && time) body.startTime = new Date(`${date}T${time}`).toISOString();
    }
    try {
      $('#impGo').disabled = true;
      const rd = await api('POST', '/api/import/create', body);
      $('#dlgImportFile').close();
      if (state.opts.targetId) toast(`${items.length} Punkte angehängt`, 'ok');
      else location.href = '/edit/' + rd.id;
    } catch (err) { toast(err.message, 'error'); $('#impGo').disabled = false; }
  }

  window.openImport = function (opts = {}) {
    ensureDialog();
    state = { opts };
    $('#impTitle').textContent = opts.targetId ? 'Punkte aus Datei anhängen' : 'Ablauf aus Datei importieren';
    step1();
    $('#dlgImportFile').showModal();
  };
})();
