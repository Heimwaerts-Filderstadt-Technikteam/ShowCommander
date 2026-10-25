// Editor + Showcaller-Ansicht
const RID = rundownIdFromPath();
const READONLY_ROUTE = location.pathname.startsWith('/view/');
let rd = null;
let canEdit = false, canControl = false;
let pendingRender = false;
let lastCurrent = null;
const COLORS = ['', '#e5484d', '#f76b15', '#f5a524', '#30a46c', '#12a594', '#3d8bfd', '#7c5cff', '#d6409f', '#8b93a1'];

const conn = connectLive(RID, {
  onRundown(data) { rd = data; scheduleRender(); },
  onLive() { updateLive(); },
  onStatus(on) { $('#conn').classList.toggle('on', on); },
});
const now = () => conn.now();

// Startinfo (u. a. Berechtigung)
api('GET', '/api/rundowns/' + encodeURIComponent(RID)).then(async d => {
  canEdit = d.canEdit && !READONLY_ROUTE;
  canControl = d.canControl && !READONLY_ROUTE;
  document.body.classList.toggle('readonly', !canEdit);
  $$('.edit-only').forEach(el => el.classList.toggle('hidden', !canEdit));
  $$('.control-only').forEach(el => el.classList.toggle('hidden', !canControl));
  if (!READONLY_ROUTE) { try { await loadMe(); mountUserMenu($('#userSlot')); } catch { /* öffentliche Ansicht */ } }
  else $('#bBack') && $('#bBack').classList.add('hidden');
  if (!rd) rd = d;
  scheduleRender();
}).catch(err => toast(err.message, 'error'));

$('#lnkOutput').href = '/output/' + RID;
$('#lnkPrompter').href = '/prompter/' + RID;
$('#lnkView').href = '/view/' + RID;
$('#lnkOverlay').href = '/overlay/' + RID;
$('#bCsv').href = `/api/rundowns/${RID}/export.csv`;

// ---------- API-Helfer ----------
const base = `/api/rundowns/${encodeURIComponent(RID)}`;
const patchItem = (id, data) => api('PATCH', `${base}/items/${id}`, data).catch(e => toast(e.message, 'error'));
const control = (cmd, arg) => api('POST', `${base}/control/${cmd}`, arg !== undefined ? { arg } : undefined).catch(e => toast(e.message, 'error'));
async function addItem(afterId, kind) {
  try {
    const it = await api('POST', `${base}/items`, { afterId, item: { kind, title: '', duration: kind === 'header' ? 0 : 300 } });
    setTimeout(() => { const el = $(`[data-id="${it.id}"] [data-field="title"]`); el && el.focus(); }, 120);
  } catch (e) { toast(e.message, 'error'); }
}

// ---------- Rendering ----------
function isEditing() {
  const a = document.activeElement;
  return a && (a.isContentEditable || (a.tagName === 'INPUT' && a.closest('#tbody')));
}
function scheduleRender() {
  if (isEditing()) { pendingRender = true; return; }
  render();
}
document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !isEditing()) { pendingRender = false; render(); } }, 50));

function sectionDurations() {
  const out = {}; let cur = null;
  for (const it of rd.items) {
    if (it.kind === 'header') { cur = it.id; out[cur] = 0; continue; }
    if (cur && !it.skip) out[cur] += it.duration;
  }
  return out;
}

function render() {
  if (!rd) return;
  document.title = rd.name + ' – ShowCommander';
  if (document.activeElement !== $('#rdName')) $('#rdName').value = rd.name;
  if (document.activeElement !== $('#rdStart')) $('#rdStart').value = rd.startTime ? toLocalInput(rd.startTime) : '';
  $('#rdName').readOnly = !canEdit; $('#rdStart').disabled = !canEdit;

  // Vorlagen-Modus
  const isTpl = !!rd.isTemplate;
  $('#tplBanner').classList.toggle('hidden', !isTpl);
  $('.transport').classList.toggle('hidden', isTpl);
  ['#lnkOutput', '#lnkPrompter', '#lnkOverlay', '#lnkView', '#bApplyTpl'].forEach(s => $(s) && $(s).classList.toggle('hidden', isTpl));
  ['#bPP', '#bDeck'].forEach(s => $(s) && $(s).classList.toggle('hidden', isTpl || !canControl));
  $('.transport .controls').classList.toggle('hidden', !canControl);
  $('#bSaveTpl').textContent = isTpl ? 'Vorlage kopieren' : 'Als Vorlage speichern';
  $('#rdStart').closest('label').classList.toggle('hidden', isTpl);

  // ChurchTools-Status
  const linked = !!rd.ct?.eventId;
  $('#bSync').classList.toggle('hidden', !linked || isTpl);
  $('#bLink').classList.toggle('hidden', linked || isTpl);
  $('#bRestore').classList.toggle('hidden', !(rd.ct?.ignored?.length));
  $('#syncInfo').innerHTML = linked
    ? `ChurchTools „${esc(rd.ct.agendaName || '#' + rd.ct.eventId)}“ ${rd.ct.isFinal ? '<span class="badge custom">final</span>' : '<span class="badge warn">Entwurf</span>'} · Sync ${rd.ct.lastSync ? new Date(rd.ct.lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–'}`
    : '';
  if (!isTpl && rd.deleteAt !== undefined) {
    $('#syncInfo').innerHTML += rd.keep
      ? ` <span class="badge custom" title="Wird nicht automatisch gelöscht">📌 behalten</span> <a href="#" id="keepToggle" style="font-size:12px">aufheben</a>`
      : rd.deleteAt ? ` <span title="Automatisches Löschen">· 🗑 löscht sich am ${new Date(rd.deleteAt).toLocaleDateString('de-DE')}</span> <a href="#" id="keepToggle" style="font-size:12px">📌 behalten</a>` : '';
    const kt = $('#keepToggle');
    if (kt) kt.onclick = e => { e.preventDefault(); api('PATCH', base, { keep: !rd.keep }).catch(err => toast(err.message, 'error')); };
  }

  // Kopfzeile
  const cols = rd.columns || [];
  $('#thead').innerHTML = `<th class="c-handle"></th><th class="c-num">#</th><th class="c-start">Start</th><th class="c-dur">Dauer</th>
    <th class="c-title">Titel / Verantwortlich</th><th class="c-notes">Notizen</th>
    ${cols.map(c => `<th class="c-col" data-col="${c.id}" title="${canEdit ? 'Klicken zum Umbenennen/Löschen' : ''}" style="${canEdit ? 'cursor:pointer' : ''}">${esc(c.name)}</th>`).join('')}
    <th class="c-act"></th>`;

  const secDur = sectionDurations();
  const nCols = 7 + cols.length;
  let n = 0;
  const rows = [];
  rows.push(`<tr class="addrow" data-after="__top"><td colspan="${nCols}"><div class="add-btns"><button data-add="cue">＋ Punkt</button><button data-add="header">＋ Abschnitt</button></div></td></tr>`);
  for (const it of rd.items) {
    const ce = canEdit ? 'contenteditable="plaintext-only"' : '';
    const srcBadge = rd.isTemplate
      ? (it.tplCt ? '<span class="src ct" title="Platzhalter: kommt beim Import aus ChurchTools/Datei">CT</span>' : '<span class="src custom" title="Wird beim Anwenden eingefügt">eigen</span>')
      : it.source === 'ct'
      ? `<span class="src ct" title="Aus ChurchTools">CT</span>${it.overrides?.length ? `<span class="src ov" title="Lokal geändert: ${esc(it.overrides.join(', '))}">geändert</span>` : ''}`
      : '<span class="src custom" title="Eigener Punkt">eigen</span>';
    const color = it.color ? `box-shadow: inset 4px 0 0 ${it.color};` : '';
    if (it.kind === 'header') {
      rows.push(`<tr class="header" data-id="${it.id}" style="${it.color ? `--hc:${it.color};` : ''}">
        <td class="c-handle" draggable="${canEdit}">⋮⋮</td>
        <td colspan="2" class="mono" style="font-size:12px" data-start="${it.id}"></td>
        <td class="mono muted" style="font-size:12px">${Timing.fmtDur((secDur[it.id] || 0) * 1000)}</td>
        <td colspan="${3 + cols.length - 1}" style="${it.color ? `color:${it.color}` : ''}"><div class="edit" ${ce} data-field="title" data-ph="Abschnitt">${esc(it.title)}</div></td>
        <td class="c-act">${srcBadge}<button class="btn icon small" data-detail="${it.id}" title="Details">⚙</button></td>
      </tr>`);
    } else {
      const num = it.skip ? '–' : ++n;
      rows.push(`<tr class="cue${it.skip ? ' skipped' : ''}" data-id="${it.id}" style="${color}">
        <td class="c-handle" draggable="${canEdit}">⋮⋮</td>
        <td class="c-num"><span class="num" data-arm="${it.id}" title="${canControl ? 'Klick: als nächsten Punkt vormerken · Doppelklick: sofort starten' : ''}">${num}</span></td>
        <td class="c-start" data-start="${it.id}"></td>
        <td class="c-dur">${canEdit ? `<input type="text" data-dur="${it.id}" value="${Timing.fmtDur(it.duration * 1000)}">` : `<span class="mono">${Timing.fmtDur(it.duration * 1000)}</span>`}
          ${it.autoNext ? '<div class="muted" style="font-size:10px">AUTO ▶</div>' : ''}</td>
        <td class="c-title">
          <div class="t-title"><div class="edit" ${ce} data-field="title" data-ph="Titel">${esc(it.title)}</div></div>
          <div class="t-sub"><span class="edit" ${ce} data-field="who" data-ph="Verantwortlich">${esc(it.who)}</span>${it.info || canEdit ? `<span class="sep${it.who && it.info ? '' : ' hov'}"> · </span><span class="edit" ${ce} data-field="info" data-ph="Info">${esc(it.info)}</span>` : ''}</div>
          ${it.ctNote ? `<div class="ctnote">${esc(it.ctNote)}</div>` : ''}
          ${it.preShow ? '<span class="badge" style="margin-top:4px">vor Beginn</span>' : ''}
        </td>
        <td class="c-notes"><div class="edit" ${ce} data-field="notes" data-ph="Notiz">${esc(it.notes)}</div>${it.script ? '<div class="muted" style="font-size:11px;margin-top:3px">📜 Prompter-Text</div>' : ''}</td>
        ${cols.map(c => `<td class="c-col"><div class="edit" ${ce} data-cell="${c.id}" data-ph="–">${esc(it.cells?.[c.id] || '')}</div></td>`).join('')}
        <td class="c-act">${srcBadge}<button class="btn icon small" data-detail="${it.id}" title="Details">⚙</button></td>
      </tr>`);
    }
    rows.push(`<tr class="addrow" data-after="${it.id}"><td colspan="${nCols}"><div class="add-btns"><button data-add="cue">＋ Punkt</button><button data-add="header">＋ Abschnitt</button></div></td></tr>`);
  }
  if (!rd.items.length) rows.push(`<tr><td colspan="${nCols}" class="muted" style="padding:30px;text-align:center">Noch leer. ${canEdit ? 'Füge Punkte hinzu oder verknüpfe ein ChurchTools-Event.' : ''}</td></tr>`);
  $('#tbody').innerHTML = rows.join('');
  if (window.renderTodos) renderTodos();
  updateLive(true);
}

// Zeiten, Hervorhebung, Transport – wird oft aufgerufen
function updateLive(force) {
  if (!rd) return;
  const t = now();
  const L = rd.live || { status: 'stopped' };
  const T = Timing.compute(rd, L, t);
  const items = rd.items;
  const curIdx = items.findIndex(i => i.id === L.currentId);
  const running = L.status !== 'stopped' && curIdx >= 0;

  for (const it of items) {
    const cell = $(`[data-start="${it.id}"]`);
    const r = T.items[it.id];
    if (cell && r) {
      const fmt = ms => ms == null ? '' : (T.relative ? Timing.fmtDur(ms) : Timing.fmtClock(ms));
      let html = `<span class="${it.hardStart ? 'hard' : ''}" title="${it.hardStart ? 'Feste Startzeit' : ''}">${fmt(r.plannedStart)}${it.hardStart ? ' ⚑' : ''}</span>`;
      if (running && r.projectedStart != null && r.plannedStart != null && !T.relative && Math.abs(r.projectedStart - r.plannedStart) >= 30000) {
        const late = r.projectedStart > r.plannedStart;
        html += `<div class="proj ${late ? 'over' : 'under'}">→ ${Timing.fmtClock(r.projectedStart)}</div>`;
      }
      if (cell.innerHTML !== html) cell.innerHTML = html;
    }
    const row = $(`tr[data-id="${it.id}"]`);
    if (row) {
      const idx = items.indexOf(it);
      row.classList.toggle('current', it.id === L.currentId && L.status !== 'stopped');
      row.classList.toggle('armed', it.id === L.nextId);
      row.classList.toggle('done', running && idx < curIdx && it.kind !== 'header');
    }
  }

  // Transport
  const cur = running ? items[curIdx] : null;
  const nextId = L.nextId || (cur ? items.slice(curIdx + 1).find(Timing.isPlayable)?.id : items.find(Timing.isPlayable)?.id);
  const next = items.find(i => i.id === nextId);
  $('#nowLabel').textContent = L.status === 'running' ? '● Live' : L.status === 'paused' ? '❚❚ Pausiert' : 'Bereit';
  $('#nowLabel').className = 'label ' + (L.status === 'running' ? 'over' : L.status === 'paused' ? 'warnc' : '');
  $('#nowTitle').textContent = cur ? cur.title || '(ohne Titel)' : (next ? 'Erster Punkt: ' + (next.title || '(ohne Titel)') : '–');
  $('#nextTitle').textContent = cur && next ? 'Als Nächstes: ' + (next.title || '(ohne Titel)') + (next.who ? ' – ' + next.who : '') : '';
  $('#bGo').textContent = L.status === 'stopped' ? '▶ Start' : (next ? '⏭ Weiter' : '■ Ende');
  $('#bPause').textContent = L.status === 'paused' ? '▶' : '⏸';

  const rem = cur ? Timing.remainingMs(cur, L, t) : null;
  const remEl = $('#tRemain');
  remEl.textContent = rem == null ? '--:--' : Timing.fmtDur(rem, { ceil: true });
  remEl.className = 'v ' + (rem == null ? '' : rem < 0 ? 'over' : rem < 60000 ? 'warnc' : '');
  const prog = $('#nowProgress');
  const pct = cur && cur.duration ? Math.min(100, Math.max(0, 100 - rem / (cur.duration * 10))) : 0;
  prog.firstElementChild.style.width = pct + '%';
  prog.className = 'progress ' + (rem != null && rem < 0 ? 'over' : rem != null && rem < 60000 ? 'warn' : '');

  const ou = T.overUnder;
  $('#tOver').textContent = ou == null ? '--:--' : Timing.fmtDur(ou, { plus: true });
  $('#tOver').className = 'v ' + (ou == null ? '' : ou > 0 ? 'over' : 'under');
  if (running && T.projectedEnd && !T.relative) { $('#tEnd').textContent = Timing.fmtClock(T.projectedEnd); $('#tEndL').textContent = 'Ende erwartet'; }
  else { $('#tEnd').textContent = T.relative ? Timing.fmtDur(T.plannedEnd) : Timing.fmtClock(T.plannedEnd); $('#tEndL').textContent = T.relative ? 'Gesamtdauer' : 'Ende geplant'; }
  $('#tClock').textContent = Timing.fmtClock(t, true);
  if (window.updateTodos) updateTodos(t);
  $('#totalInfo').textContent = `${items.filter(Timing.isPlayable).length} Punkte · ${Timing.fmtDur(T.total * 1000)}`;

  // Folgen
  if (L.currentId !== lastCurrent) {
    lastCurrent = L.currentId;
    if ($('#follow').checked && L.currentId) {
      const row = $(`tr[data-id="${L.currentId}"]`);
      row && row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}
setInterval(() => updateLive(), 250);

function toLocalInput(iso) {
  const d = new Date(iso); const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- Editieren in der Tabelle ----------
const tbody = $('#tbody');
let editOrig = '';
tbody.addEventListener('focusin', e => { if (e.target.isContentEditable || e.target.dataset.dur) editOrig = e.target.isContentEditable ? e.target.innerText : e.target.value; });
tbody.addEventListener('focusout', e => {
  const el = e.target; const row = el.closest('tr[data-id]'); if (!row || !canEdit) return;
  const id = row.dataset.id;
  if (el.isContentEditable) {
    const v = el.innerText.replace(/\n+$/, '');
    if (v === editOrig) return;
    const it = rd.items.find(i => i.id === id);
    if (el.dataset.field) { it[el.dataset.field] = v; patchItem(id, { [el.dataset.field]: v }); }
    if (el.dataset.cell) { it.cells = { ...it.cells, [el.dataset.cell]: v }; patchItem(id, { cells: { [el.dataset.cell]: v } }); }
  } else if (el.dataset.dur) {
    const sec = Timing.parseDur(el.value);
    if (sec == null) { toast('Dauer nicht erkannt – z. B. 5, 4:30 oder 1:02:00', 'error'); el.value = editOrig; return; }
    el.value = Timing.fmtDur(sec * 1000);
    if (el.value === editOrig) return;
    rd.items.find(i => i.id === id).duration = sec;
    patchItem(id, { duration: sec });
  }
});
tbody.addEventListener('keydown', e => {
  const el = e.target;
  if (e.key === 'Escape') { if (el.isContentEditable) el.innerText = editOrig; else el.value = editOrig; el.blur(); }
  if (e.key === 'Enter' && !e.shiftKey && (el.dataset.dur || ['title', 'who', 'info'].includes(el.dataset.field))) { e.preventDefault(); el.blur(); }
  if (e.key === 'Tab' && el.dataset.dur === undefined && el.isContentEditable) { /* Standard-Tab */ }
});

tbody.addEventListener('click', e => {
  const add = e.target.closest('[data-add]');
  if (add) return addItem(add.closest('[data-after]').dataset.after, add.dataset.add);
  const det = e.target.closest('[data-detail]');
  if (det) return openDetail(det.dataset.detail);
  const arm = e.target.closest('[data-arm]');
  if (arm && canControl) {
    clearTimeout(arm._t);
    arm._t = setTimeout(() => control('arm', arm.dataset.arm), 220);
  }
});
tbody.addEventListener('dblclick', e => {
  const arm = e.target.closest('[data-arm]');
  if (arm && canControl) { clearTimeout(arm._t); control('goto', arm.dataset.arm); }
});

// Drag & Drop
let dragId = null;
tbody.addEventListener('dragstart', e => {
  const row = e.target.closest('tr[data-id]'); if (!row || !canEdit) return;
  dragId = row.dataset.id; e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setDragImage(row, 20, 15);
});
tbody.addEventListener('dragover', e => {
  if (!dragId) return; e.preventDefault();
  $$('.dragover').forEach(r => r.classList.remove('dragover'));
  const row = e.target.closest('tr[data-id]'); row && row.classList.add('dragover');
});
tbody.addEventListener('drop', async e => {
  e.preventDefault(); $$('.dragover').forEach(r => r.classList.remove('dragover'));
  const row = e.target.closest('tr[data-id]'); if (!dragId || !row || row.dataset.id === dragId) { dragId = null; return; }
  const itemId = dragId; dragId = null;
  // lokal sofort umsortieren
  const from = rd.items.findIndex(i => i.id === itemId);
  const [it] = rd.items.splice(from, 1);
  rd.items.splice(rd.items.findIndex(i => i.id === row.dataset.id), 0, it);
  render();
  await api('POST', `${base}/move`, { itemId, beforeId: row.dataset.id }).catch(err => toast(err.message, 'error'));
});
tbody.addEventListener('dragend', () => { dragId = null; $$('.dragover').forEach(r => r.classList.remove('dragover')); });

// Spalten
$('#thead').addEventListener('click', async e => {
  const th = e.target.closest('[data-col]'); if (!th || !canEdit) return;
  const col = rd.columns.find(c => c.id === th.dataset.col);
  const name = prompt('Spaltenname (leer lassen = Spalte löschen)', col.name);
  if (name == null) return;
  const columns = name.trim() ? rd.columns.map(c => c.id === col.id ? { ...c, name: name.trim() } : c) : rd.columns.filter(c => c.id !== col.id);
  if (!name.trim() && !confirm(`Spalte „${col.name}“ löschen?`)) return;
  await api('PATCH', base, { columns }).catch(err => toast(err.message, 'error'));
});
$('#bAddCol').onclick = async () => {
  const name = prompt('Name der neuen Spalte', 'Kamera');
  if (!name) return;
  await api('PATCH', base, { columns: [...rd.columns, { name }] }).catch(err => toast(err.message, 'error'));
};

// Kopf
$('#rdName').addEventListener('change', e => api('PATCH', base, { name: e.target.value }).catch(err => toast(err.message, 'error')));
$('#rdName').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
$('#rdStart').addEventListener('change', e => api('PATCH', base, { startTime: e.target.value ? new Date(e.target.value).toISOString() : null }).catch(err => toast(err.message, 'error')));

$('#bAddCue').onclick = () => addItem(rd.items[rd.items.length - 1]?.id, 'cue');
$('#bAddHeader').onclick = () => addItem(rd.items[rd.items.length - 1]?.id, 'header');

// ChurchTools
$('#bSync').onclick = async () => {
  const b = $('#bSync'); b.disabled = true; b.textContent = '⟳ Synchronisiere …';
  try {
    const s = await api('POST', `${base}/sync`);
    toast(`ChurchTools: ${s.added} neu, ${s.updated} geändert, ${s.removed} entfernt`, 'ok');
  } catch (err) { toast(err.message, 'error'); }
  b.disabled = false; b.textContent = '⟳ Mit ChurchTools synchronisieren';
};
$('#bRestore').onclick = async () => {
  if (!confirm('Alle in diesem Ablauf gelöschten ChurchTools-Punkte wiederherstellen?')) return;
  await api('POST', `${base}/restore-ignored`).catch(err => toast(err.message, 'error'));
};
$('#bLink').onclick = async () => {
  $('#dlgLink').showModal();
  $('#linkList').innerHTML = '<div class="muted">Lade …</div>';
  try {
    const evs = await api('GET', '/api/ct/events');
    $('#linkList').innerHTML = evs.map(e => `<div class="event-row" data-ev="${e.id}"><div class="when">${esc(fmtDateTime(e.startDate))}</div><div style="flex:1"><strong>${esc(e.name)}</strong></div></div>`).join('') || '<div class="muted">Keine Events gefunden.</div>';
  } catch (err) { $('#linkList').innerHTML = `<div class="badge warn">${esc(err.message)}</div>`; }
};
$('#linkList').addEventListener('click', async e => {
  const row = e.target.closest('[data-ev]'); if (!row) return;
  try {
    const s = await api('POST', `${base}/link`, { eventId: row.dataset.ev });
    toast(`Verknüpft – ${s.added} Punkte aus ChurchTools übernommen`, 'ok');
    $('#dlgLink').close();
  } catch (err) { toast(err.message, 'error'); }
});
$$('dialog [data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());

// ---------- Detail-Dialog ----------
let detailId = null, detailColor = '';
function openDetail(id) {
  const it = rd.items.find(i => i.id === id); if (!it) return;
  detailId = id; detailColor = it.color || '';
  const header = it.kind === 'header';
  $('#diTitle').textContent = header ? 'Abschnitt bearbeiten' : 'Punkt bearbeiten';
  $$('.cue-only').forEach(el => el.classList.toggle('hidden', header));
  $('#diName').value = it.title; $('#diWho').value = it.who; $('#diInfo').value = it.info;
  $('#diDur').value = Timing.fmtDur(it.duration * 1000); $('#diHard').value = it.hardStart || '';
  $('#diAuto').checked = it.autoNext; $('#diSkip').checked = it.skip;
  $$('.tpl-only').forEach(el => el.classList.toggle('hidden', !rd.isTemplate));
  $('#diTplCt').checked = !!it.tplCt;
  $('#diNotes').value = it.notes; $('#diScript').value = it.script;
  $('#diColors').innerHTML = COLORS.map(c => `<div class="swatch ${c === detailColor ? 'sel' : ''}" data-c="${c}" style="background:${c || 'repeating-linear-gradient(45deg,#333,#333 4px,#222 4px,#222 8px)'}" title="${c || 'keine'}"></div>`).join('');
  const ci = $('#diCtInfo');
  if (it.source === 'ct') {
    ci.classList.remove('hidden');
    ci.innerHTML = `<div class="badge ct">Aus ChurchTools</div>
      ${it.ctNote ? `<div class="ctnote">${esc(it.ctNote)}</div>` : ''}
      ${it.overrides?.length ? `<div style="margin-top:8px" class="muted">Lokal geändert: ${esc(it.overrides.join(', '))} – diese Felder werden beim Sync nicht überschrieben.
        <button class="btn small" id="diReset" style="margin-left:6px">ChurchTools-Werte wiederherstellen</button></div>` : '<div class="muted" style="margin-top:6px;font-size:12px">Änderungen an Titel, Verantwortlich, Info oder Dauer bleiben beim nächsten Sync erhalten. Notizen, Farbe und Prompter-Text sind immer lokal.</div>'}`;
    const r = $('#diReset');
    if (r) r.onclick = async () => { await api('POST', `${base}/items/${id}/reset`).catch(err => toast(err.message, 'error')); $('#dlgItem').close(); };
  } else ci.classList.add('hidden');
  $('#diDelete').textContent = it.source === 'ct' ? 'Aus Ablauf entfernen' : 'Löschen';
  $('#diSave').classList.toggle('hidden', !canEdit); $('#diDelete').classList.toggle('hidden', !canEdit);
  $('#dlgItem').showModal();
}
$('#diColors').addEventListener('click', e => {
  const s = e.target.closest('[data-c]'); if (!s) return;
  detailColor = s.dataset.c; $$('#diColors .swatch').forEach(x => x.classList.toggle('sel', x === s));
});
$('#diSave').onclick = async () => {
  const it = rd.items.find(i => i.id === detailId); if (!it) return;
  const dur = Timing.parseDur($('#diDur').value);
  if (it.kind !== 'header' && dur == null) return toast('Dauer nicht erkannt', 'error');
  const patch = {};
  const set = (k, v) => { if (it[k] !== v) patch[k] = v; };
  set('title', $('#diName').value); set('who', $('#diWho').value); set('info', $('#diInfo').value);
  if (it.kind !== 'header') {
    set('duration', dur); set('hardStart', $('#diHard').value || null);
    set('autoNext', $('#diAuto').checked); set('skip', $('#diSkip').checked); set('script', $('#diScript').value);
  }
  set('notes', $('#diNotes').value); set('color', detailColor);
  if (rd.isTemplate && !!it.tplCt !== $('#diTplCt').checked) patch.tplCt = $('#diTplCt').checked;
  if (Object.keys(patch).length) await patchItem(detailId, patch);
  $('#dlgItem').close();
};
$('#diDelete').onclick = async () => {
  const it = rd.items.find(i => i.id === detailId);
  const msg = it.source === 'ct'
    ? 'Punkt aus diesem Ablauf entfernen? Er bleibt in ChurchTools bestehen und kommt beim Sync nicht zurück (über „Gelöschte CT-Punkte zurückholen“ wiederherstellbar). Tipp: „Überspringen“ blendet nur aus.'
    : 'Diesen eigenen Punkt löschen?';
  if (!confirm(msg)) return;
  await api('DELETE', `${base}/items/${detailId}`).catch(err => toast(err.message, 'error'));
  $('#dlgItem').close();
};

// ---------- Transport + Tastatur ----------
$('#bGo').onclick = () => control((rd.live?.status || 'stopped') === 'stopped' ? 'start' : 'next');
$('#bPrev').onclick = () => control('prev');
$('#bPause').onclick = () => control('toggle');
$('#bPlus').onclick = () => control('adjust', 60);
$('#bMinus').onclick = () => control('adjust', -60);
$('#bEnd').onclick = () => { if (confirm('Show beenden?')) control('end'); };

document.addEventListener('keydown', e => {
  if (!canControl) return;
  const a = document.activeElement;
  if (a && (a.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName))) return;
  if ($('dialog[open]')) return;
  if (e.code === 'Space') { e.preventDefault(); $('#bGo').click(); }
  else if (e.key === 'b' || e.key === 'B') control('prev');
  else if (e.key === 'p' || e.key === 'P') control('toggle');
  else if (e.key === '+') control('adjust', 60);
  else if (e.key === '-') control('adjust', -60);
});

// ---------- ProPresenter / Stream Deck ----------
$('#bPP').onclick = () => api('POST', `${base}/pp-push`).then(() => toast('An ProPresenter gesendet', 'ok')).catch(e => toast(e.message, 'error'));
$('#bDeck').onclick = () => {
  $('#deckId').value = RID;
  const root = `${location.origin}/api/rundowns/${RID}`;
  const rows = [['Start', 'control/start'], ['Weiter', 'control/next'], ['Zurück', 'control/prev'], ['Pause/Weiter', 'control/toggle'],
    ['+1 Minute', 'control/adjust?arg=60'], ['−1 Minute', 'control/adjust?arg=-60'], ['Punkt 3 starten', 'control/goto?arg=3'], ['Ende', 'control/end'], ['Status (JSON)', 'state']];
  $('#deckUrls').innerHTML = rows.map(([n, p]) => `<div><span class="muted" style="display:inline-block;width:120px;font-family:var(--sans)">${n}</span>${esc(root + '/' + p)}</div>`).join('');
  $('#dlgDeck').showModal();
};

// ---------- Import & Vorlagen ----------
$('#bImportFile').onclick = () => openImport({ targetId: RID });
$('#bSaveTpl').onclick = async () => {
  const suggestion = rd.isTemplate ? rd.name + ' (Kopie)' : rd.name.replace(/\s+–\s+\d{1,2}\.\d{1,2}\.\d{4}$/, '') + ' (Vorlage)';
  const name = prompt('Name der Vorlage', suggestion);
  if (name == null) return;
  try {
    const t = await api('POST', `${base}/save-template`, { name });
    toast('Vorlage gespeichert', 'ok');
    if (rd.isTemplate) location.href = '/edit/' + t.id;
  } catch (err) { toast(err.message, 'error'); }
};
$('#bApplyTpl').onclick = async () => {
  const tpls = (await api('GET', '/api/rundowns')).filter(r => r.isTemplate);
  if (!tpls.length) return toast('Noch keine Vorlagen vorhanden', 'error');
  $('#tplSelect').innerHTML = tpls.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  $('#dlgTpl').showModal();
};
$('#tplApplyGo').onclick = async () => {
  try {
    const s = await api('POST', `${base}/apply-template`, { templateId: $('#tplSelect').value });
    toast(`Vorlage angewendet: ${s.inserted} Punkte eingefügt, ${s.enriched} ergänzt${s.skipped ? `, ${s.skipped} schon vorhanden` : ''}`, 'ok');
    $('#dlgTpl').close();
  } catch (err) { toast(err.message, 'error'); }
};
