// Vor- und Nachbereitung im Editor.
// Vor dem Event: aus der Dauer wird vom Show-Start rückwärts gerechnet, wann spätestens begonnen werden muss.
// Nach dem Event: ab Show-Ende vorwärts.
// „Fertig bis“ kann fest eingetragen werden – die übrigen Aufgaben rechnen dann von diesem Termin aus weiter.
(function () {
  const panel = $('#todoPanel');
  const tbase = () => `/api/rundowns/${encodeURIComponent(RID)}`;
  let pending = false, dragTodo = null;
  const PHASES = { pre: { list: '#preList', startLabel: 'Spätestens Beginn' }, post: { list: '#postList', startLabel: 'Beginn ab' } };
  const STATE = { overdue: 'überfällig', soon: 'jetzt beginnen', running: 'läuft jetzt', ok: 'geplant', done: 'erledigt' };

  try { if (localStorage.getItem('todosCollapsed') === '1') panel.classList.add('collapsed'); } catch { /* egal */ }
  $('#todoToggle').onclick = () => {
    panel.classList.toggle('collapsed');
    try { localStorage.setItem('todosCollapsed', panel.classList.contains('collapsed') ? '1' : '0'); } catch { /* egal */ }
  };

  const editing = () => panel.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text';
  panel.addEventListener('focusout', () => setTimeout(() => { if (pending && !editing()) { pending = false; renderTodos(); } }, 50));

  // Uhrzeit anzeigen; abweichender Tag mit Wochentag
  function fmtT(ms, rel) {
    if (ms == null) return '–';
    if (rel) return ms === 0 ? 'Start' : (ms < 0 ? `${Timing.fmtDur(-ms)} vorher` : `+${Timing.fmtDur(ms)}`);
    const d = new Date(ms), ref = rd.startTime ? new Date(rd.startTime) : new Date(now());
    return Timing.fmtClock(ms) + (d.toDateString() === ref.toDateString() ? '' : ` ${d.toLocaleDateString('de-DE', { weekday: 'short' })}`);
  }

  // „HH:MM“ → Zeitpunkt. Vor dem Event: liegt die Zeit nach dem Start, ist der Vortag gemeint.
  // Nach dem Event: liegt sie vor dem Show-Ende, ist der Folgetag gemeint.
  function parseDue(str, phase, r) {
    const m = /^\s*(\d{1,2})[:.](\d{2})\s*(?:uhr)?\s*$/i.exec(str || '');
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    const d = new Date(rd.startTime);
    d.setHours(+m[1], +m[2], 0, 0);
    let ms = d.getTime();
    if (phase === 'pre' && ms > r.showStart) ms -= 864e5;
    if (phase === 'post' && ms < r.showEnd) ms += 864e5;
    return ms;
  }

  function rowHtml(t, ce) {
    const hasStart = !!rd.startTime;
    return `
      <tr data-tid="${t.id}" class="${t.parallel ? 'par' : ''}">
        <td class="todo-handle" draggable="${ce}">${ce ? '⋮⋮' : ''}</td>
        <td><input type="checkbox" class="tdone" ${t.done ? 'checked' : ''} ${canControl ? '' : 'disabled'} title="Erledigt"></td>
        <td class="tt">${ce ? `<input type="text" data-f="title" value="${esc(t.title)}" placeholder="Aufgabe">` : esc(t.title)}
          ${t.done && t.doneBy ? `<br><span class="doneby">✓ ${esc(t.doneBy)}${t.doneAt ? ', ' + Timing.fmtClock(Date.parse(t.doneAt)) : ''}</span>` : ''}</td>
        <td>${ce ? `<input type="text" data-f="who" value="${esc(t.who)}" placeholder="–">` : esc(t.who)}</td>
        <td>${ce ? `<input type="text" data-f="duration" class="t-dur" value="${Timing.fmtDur(t.duration * 1000)}">` : `<span class="mono">${Timing.fmtDur(t.duration * 1000)}</span>`}</td>
        <td class="t-time" data-start="${t.id}"></td>
        <td class="t-time">${ce
          ? `<div class="duewrap"><input type="text" data-f="due" class="t-due${t.fixedDue != null ? ' fixed' : ''}" ${hasStart ? '' : 'disabled title="Erst eine Startzeit für den Ablauf setzen"'}
               title="${t.fixedDue != null ? 'Fest eingetragen – leeren oder ↺ für automatische Berechnung' : 'Automatisch berechnet – eine Uhrzeit eintragen, um sie festzulegen'}">
             ${t.fixedDue != null ? '<button class="unfix" data-unfix title="Wieder automatisch berechnen">↺</button>' : ''}</div>`
          : `<span data-due-ro="${t.id}"></span>`}</td>
        <td data-st="${t.id}"></td>
        <td style="text-align:right;white-space:nowrap">${ce ? `
          <button class="btn icon small" data-par title="${t.parallel ? 'Nicht mehr parallel' : 'Parallel zur vorherigen Aufgabe'}" style="${t.parallel ? 'border-color:var(--accent)' : ''}">⇉</button>
          <button class="btn icon small" data-swap title="${t.phase === 'post' ? 'Nach „Vor dem Event“ verschieben' : 'Nach „Nach dem Event“ verschieben'}">${t.phase === 'post' ? '↑' : '↓'}</button>
          <button class="btn icon small danger" data-del title="Löschen">✕</button>` : ''}</td>
      </tr>`;
  }

  window.renderTodos = function () {
    if (!rd) return;
    if (editing()) { pending = true; return; }
    const todos = rd.todos || [];
    const ce = canEdit;
    $$('.need-editor-inline', panel).forEach(el => el.classList.toggle('hidden', !ce));
    panel.classList.toggle('hidden', !ce && !todos.length);
    if (document.activeElement !== $('#todoBuffer')) $('#todoBuffer').value = Math.round((rd.todoBuffer || 0) / 60);
    if (document.activeElement !== $('#todoPostBuffer')) $('#todoPostBuffer').value = Math.round((rd.todoPostBuffer || 0) / 60);
    for (const [phase, cfg] of Object.entries(PHASES)) {
      const list = todos.filter(t => (t.phase === 'post' ? 'post' : 'pre') === phase);
      const box = $(cfg.list);
      box.closest('.todo-phase').classList.toggle('hidden', !ce && !list.length);
      if (!list.length) {
        box.innerHTML = `<div class="todo-empty">${ce ? (phase === 'pre'
          ? 'Aufgaben vor Beginn (Aufbau, Soundcheck, Stream-Test …) mit „＋ Todo“ anlegen – aus der Dauer wird zurückgerechnet, wann ihr spätestens anfangen müsst.'
          : 'Aufgaben nach dem Event (Stream beenden, Abbau, Video hochladen …) – gerechnet ab Show-Ende.') : '–'}</div>`;
        continue;
      }
      box.innerHTML = `<table class="todo"><thead><tr>
          <th></th><th style="width:28px">✓</th><th>Aufgabe</th><th style="width:150px">Wer</th><th style="width:96px">Dauer</th>
          <th style="width:110px">${cfg.startLabel}</th><th style="width:120px">Fertig bis</th><th style="width:130px">Status</th><th style="width:96px"></th>
        </tr></thead><tbody>${list.map(t => rowHtml(t, ce)).join('')}</tbody></table>`;
    }
    updateTodos();
  };

  // Zeiten/Status laufend aktualisieren (ändern sich mit Uhrzeit und Show-Verlauf)
  window.updateTodos = function (tNow) {
    if (!rd) return;
    const r = Timing.computeTodos(rd, tNow ?? now());
    const set = (el, v) => { if (el && el.innerHTML !== v) el.innerHTML = v; };

    // Kopfzeile
    const sum = [];
    if (r.total) {
      sum.push(`<span>${r.done}/${r.total} erledigt</span>`);
      if (r.overdue) sum.push(`<span class="tstate overdue">${r.overdue} überfällig</span>`);
      else if (r.open === 0) sum.push('<span class="tstate done">alles erledigt</span>');
      if (r.relative) sum.push('<span class="warnc">Startzeit fehlt – Zeiten relativ zum Start</span>');
    }
    set($('#todoSum'), sum.join('<span>·</span>'));
    set($('#preInfo'), r.pre.total
      ? `<span>${r.pre.done}/${r.pre.total}</span><span>· Beginn spätestens <strong class="mono" style="color:var(--text)">${fmtT(r.prepStart, r.relative)}</strong></span><span>· fertig bis ${fmtT(r.prepEnd, r.relative)}</span>`
      : '');
    set($('#postInfo'), r.post.total
      ? `<span>${r.post.done}/${r.post.total}</span><span>· ab ${fmtT(r.postStart, r.relative)}</span><span>· alles fertig bis <strong class="mono" style="color:var(--text)">${fmtT(r.postEnd, r.relative)}</strong></span>`
      : (rd.items?.length ? `<span>Show-Ende ${fmtT(r.showEnd, r.relative)}</span>` : ''));

    for (const td of rd.todos || []) {
      const x = r.items[td.id]; if (!x) continue;
      set($(`[data-start="${td.id}"]`), fmtT(x.start, r.relative));
      const dueText = fmtT(x.due, r.relative);
      const inp = $(`tr[data-tid="${td.id}"] [data-f="due"]`);
      if (inp && document.activeElement !== inp) {
        // fest eingetragen → als Wert; berechnet → als Platzhalter (Feld bleibt leer, bis man etwas einträgt)
        if (x.fixed) { if (inp.value !== Timing.fmtClock(x.due)) inp.value = Timing.fmtClock(x.due); inp.placeholder = ''; }
        else { if (inp.value) inp.value = ''; inp.placeholder = dueText; }
      }
      set($(`[data-due-ro="${td.id}"]`), dueText + (x.fixed ? ' 📌' : ''));
      set($(`[data-st="${td.id}"]`), `<span class="tstate ${x.state}">${STATE[x.state]}</span>` +
        (x.conflict ? `<br><span class="tconf" title="${x.phase === 'pre' ? 'Der feste Termin liegt nach dem Beginn der nächsten Aufgabe' : 'Der feste Termin lässt nicht genug Zeit nach der vorherigen Aufgabe'}">⚠ passt nicht in die Kette</span>` : ''));
      const row = $(`tr[data-tid="${td.id}"]`);
      if (row) for (const s of ['done', 'overdue', 'soon']) row.classList.toggle(s, x.state === s);
    }
  };

  const patch = (tid, body) => api('PATCH', `${tbase()}/todos/${tid}`, body).catch(e => toast(e.message, 'error'));

  // ---------- Eingaben ----------
  let orig = '';
  const body = $('#todoBody');
  body.addEventListener('focusin', e => { if (e.target.dataset.f) orig = e.target.value; });
  body.addEventListener('focusout', e => {
    const f = e.target.dataset.f; if (!f) return;
    const tid = e.target.closest('[data-tid]').dataset.tid;
    const t = (rd.todos || []).find(x => x.id === tid); if (!t) return;
    let v = e.target.value;
    if (f === 'duration') {
      const s = Timing.parseDur(v);
      if (s == null) { toast('Dauer nicht erkannt – z. B. 30, 1:30:00 oder 90s', 'error'); e.target.value = orig; return; }
      e.target.value = Timing.fmtDur(s * 1000);
      if (s === t.duration) return;
      t.duration = s; patch(tid, { duration: s });
    } else if (f === 'due') {
      if (v.trim() === orig.trim()) return;
      if (!v.trim()) { t.fixedDue = null; patch(tid, { fixedDue: null }); renderTodos(); return; }
      const r = Timing.computeTodos(rd, now());
      const ms = parseDue(v, t.phase === 'post' ? 'post' : 'pre', r);
      if (ms == null) { toast('Uhrzeit nicht erkannt – z. B. 8:30 oder 18:00', 'error'); e.target.value = orig; return; }
      t.fixedDue = Math.round((ms - Date.parse(rd.startTime)) / 1000);
      patch(tid, { fixedDue: t.fixedDue });
      renderTodos();
      return;
    } else {
      if (v === orig) return;
      t[f] = v; patch(tid, { [f]: v });
    }
    updateTodos();
  });
  body.addEventListener('keydown', e => {
    if (!e.target.dataset.f) return;
    if (e.key === 'Enter') e.target.blur();
    if (e.key === 'Escape') { e.target.value = orig; e.target.blur(); }
  });
  body.addEventListener('change', e => {
    if (!e.target.classList.contains('tdone')) return;
    const tid = e.target.closest('[data-tid]').dataset.tid;
    const t = rd.todos.find(x => x.id === tid);
    t.done = e.target.checked; updateTodos();
    e.target.blur(); // Leertaste soll danach wieder die Show steuern
    patch(tid, { done: e.target.checked });
  });
  body.addEventListener('click', e => {
    const add = e.target.closest('[data-add-phase]');
    if (add) return addTodo(add.dataset.addPhase);
    const row = e.target.closest('[data-tid]'); if (!row) return;
    const tid = row.dataset.tid, t = rd.todos.find(x => x.id === tid);
    const samePhase = rd.todos.filter(x => (x.phase || 'pre') === (t.phase || 'pre'));
    if (e.target.closest('[data-par]')) {
      if (!t.parallel && samePhase.indexOf(t) === 0) return toast('Die erste Aufgabe kann nicht parallel sein', 'error');
      patch(tid, { parallel: !t.parallel });
    }
    if (e.target.closest('[data-unfix]')) { t.fixedDue = null; patch(tid, { fixedDue: null }); renderTodos(); }
    if (e.target.closest('[data-swap]')) {
      const phase = t.phase === 'post' ? 'pre' : 'post';
      api('POST', `${tbase()}/todos-move`, { todoId: tid, phase }).catch(err => toast(err.message, 'error'));
    }
    if (e.target.closest('[data-del]') && confirm(`„${t.title || 'Todo'}“ löschen?`)) {
      api('DELETE', `${tbase()}/todos/${tid}`).catch(err => toast(err.message, 'error'));
    }
  });

  async function addTodo(phase) {
    panel.classList.remove('collapsed');
    try {
      const t = await api('POST', `${tbase()}/todos`, { todo: { title: '', duration: 900, phase } });
      setTimeout(() => { const el = $(`tr[data-tid="${t.id}"] [data-f="title"]`); el && el.focus(); }, 150);
    } catch (err) { toast(err.message, 'error'); }
  }

  // ---------- Sortieren per Drag & Drop (auch zwischen vor/nach) ----------
  body.addEventListener('dragstart', e => {
    const row = e.target.closest('tr[data-tid]'); if (!row || !canEdit) return;
    dragTodo = row.dataset.tid; e.dataTransfer.effectAllowed = 'move';
  });
  body.addEventListener('dragover', e => {
    if (!dragTodo) return;
    e.preventDefault();
    $$('.phase-list', panel).forEach(l => l.classList.toggle('drop-target', l.contains(e.target)));
  });
  body.addEventListener('dragend', () => { dragTodo = null; $$('.drop-target', panel).forEach(l => l.classList.remove('drop-target')); });
  body.addEventListener('drop', e => {
    e.preventDefault();
    $$('.drop-target', panel).forEach(l => l.classList.remove('drop-target'));
    const ph = e.target.closest('.todo-phase'); if (!dragTodo || !ph) { dragTodo = null; return; }
    const phase = ph.dataset.phase, row = e.target.closest('tr[data-tid]');
    const todoId = dragTodo; dragTodo = null;
    if (row && row.dataset.tid === todoId) return;
    const t = rd.todos.find(x => x.id === todoId);
    rd.todos.splice(rd.todos.indexOf(t), 1);
    if (row) rd.todos.splice(rd.todos.findIndex(x => x.id === row.dataset.tid), 0, t); else rd.todos.push(t);
    if ((t.phase || 'pre') !== phase) { t.phase = phase; t.fixedDue = null; }
    renderTodos();
    api('POST', `${tbase()}/todos-move`, { todoId, beforeId: row ? row.dataset.tid : null, phase }).catch(err => toast(err.message, 'error'));
  });

  $('#todoReset').onclick = () => { if (confirm('Alle Häkchen (vor und nach dem Event) entfernen?')) api('POST', `${tbase()}/todos-reset`).catch(err => toast(err.message, 'error')); };
  for (const [id, key] of [['#todoBuffer', 'todoBuffer'], ['#todoPostBuffer', 'todoPostBuffer']]) {
    $(id).addEventListener('change', e => {
      const min = Math.max(0, Number(String(e.target.value).replace(',', '.')) || 0);
      api('PATCH', tbase(), { [key]: Math.round(min * 60) }).catch(err => toast(err.message, 'error'));
    });
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  }
})();
