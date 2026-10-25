// Vorbereitung (über dem Ablauf) und Nachbereitung (unter dem Ablauf).
// Vorbereitung: aus der Dauer wird vom Show-Start rückwärts gerechnet, wann spätestens begonnen werden muss.
// Nachbereitung: ab Show-Ende vorwärts.
// „Fertig bis“ kann fest eingetragen werden – die übrigen Aufgaben rechnen dann von diesem Termin aus weiter.
(function () {
  const PH = {
    pre: { el: $('#prePanel'), list: $('#preList'), info: $('#preInfo'), buf: $('#preBuffer'), bufKey: 'todoBuffer', startLabel: 'Spätestens Beginn',
      empty: 'Aufgaben vor Beginn (Aufbau, Soundcheck, Stream-Test …) mit „＋ Todo“ anlegen – aus der Dauer wird zurückgerechnet, wann ihr spätestens anfangen müsst.' },
    post: { el: $('#postPanel'), list: $('#postList'), info: $('#postInfo'), buf: $('#postBuffer'), bufKey: 'todoPostBuffer', startLabel: 'Beginn ab',
      empty: 'Aufgaben nach dem Event (Stream beenden, Abbau, Video hochladen …) – gerechnet ab Show-Ende.' },
  };
  const panels = [PH.pre.el, PH.post.el];
  const phaseOf = t => (t.phase === 'post' ? 'post' : 'pre');
  const tbase = () => `/api/rundowns/${encodeURIComponent(RID)}`;
  const STATE = { overdue: 'überfällig', soon: 'jetzt beginnen', running: 'läuft jetzt', ok: 'geplant', done: 'erledigt' };
  let pending = false, dragTodo = null;

  // Ein-/Ausklappen pro Block merken
  for (const [ph, cfg] of Object.entries(PH)) {
    try { if (localStorage.getItem('todosCollapsed_' + ph) === '1') cfg.el.classList.add('collapsed'); } catch { /* egal */ }
    cfg.el.querySelector('[data-toggle-phase]').onclick = () => {
      cfg.el.classList.toggle('collapsed');
      try { localStorage.setItem('todosCollapsed_' + ph, cfg.el.classList.contains('collapsed') ? '1' : '0'); } catch { /* egal */ }
    };
  }

  const editing = () => panels.some(p => p.contains(document.activeElement)) && document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text';
  panels.forEach(p => p.addEventListener('focusout', () => setTimeout(() => { if (pending && !editing()) { pending = false; renderTodos(); } }, 50)));

  // Uhrzeit anzeigen; abweichender Tag mit Wochentag
  function fmtT(ms, rel) {
    if (ms == null) return '–';
    if (rel) return ms === 0 ? 'Start' : (ms < 0 ? `${Timing.fmtDur(-ms)} vorher` : `+${Timing.fmtDur(ms)}`);
    const d = new Date(ms), ref = rd.startTime ? new Date(rd.startTime) : new Date(now());
    return Timing.fmtClock(ms) + (d.toDateString() === ref.toDateString() ? '' : ` ${d.toLocaleDateString('de-DE', { weekday: 'short' })}`);
  }

  // „HH:MM“ → Zeitpunkt. Vorbereitung: liegt die Zeit nach dem Start, ist der Vortag gemeint.
  // Nachbereitung: liegt sie vor dem Show-Ende, ist der Folgetag gemeint.
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
    const other = phaseOf(t) === 'post' ? 'Vorbereitung' : 'Nachbereitung';
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
          <button class="btn icon small" data-swap title="In die ${other} verschieben">${phaseOf(t) === 'post' ? '↑' : '↓'}</button>
          <button class="btn icon small danger" data-del title="Löschen">✕</button>` : ''}</td>
      </tr>`;
  }

  window.renderTodos = function () {
    if (!rd) return;
    if (editing()) { pending = true; return; }
    const todos = rd.todos || [];
    const ce = canEdit;
    for (const [ph, cfg] of Object.entries(PH)) {
      const list = todos.filter(t => phaseOf(t) === ph);
      $$('.need-editor-inline', cfg.el).forEach(el => el.classList.toggle('hidden', !ce));
      cfg.el.classList.toggle('hidden', !ce && !list.length);
      if (document.activeElement !== cfg.buf) cfg.buf.value = Math.round((rd[cfg.bufKey] || 0) / 60);
      cfg.list.innerHTML = !list.length
        ? `<div class="todo-empty">${ce ? cfg.empty : '–'}</div>`
        : `<table class="todo"><thead><tr>
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
    const badge = s => (s.overdue ? `<span class="tstate overdue">${s.overdue} überfällig</span>` : (s.total && !s.open ? '<span class="tstate done">alles erledigt</span>' : ''));
    const relHint = r.relative && (r.pre.total || r.post.total) ? '<span class="warnc">· Startzeit fehlt – Zeiten relativ</span>' : '';

    set(PH.pre.info, r.pre.total
      ? `<span>${r.pre.done}/${r.pre.total} erledigt</span><span>· Beginn spätestens <strong class="mono" style="color:var(--text)">${fmtT(r.prepStart, r.relative)}</strong></span><span>· fertig bis ${fmtT(r.prepEnd, r.relative)}</span>${badge(r.pre)}${relHint}`
      : '');
    set(PH.post.info, r.post.total
      ? `<span>${r.post.done}/${r.post.total} erledigt</span><span>· ab ${fmtT(r.postStart, r.relative)}</span><span>· alles fertig bis <strong class="mono" style="color:var(--text)">${fmtT(r.postEnd, r.relative)}</strong></span>${badge(r.post)}${relHint}`
      : (rd.items?.length ? `<span>Show-Ende ${fmtT(r.showEnd, r.relative)}</span>` : ''));

    for (const td of rd.todos || []) {
      const x = r.items[td.id]; if (!x) continue;
      set($(`[data-start="${td.id}"]`), fmtT(x.start, r.relative));
      const dueText = fmtT(x.due, r.relative);
      const inp = $(`tr[data-tid="${td.id}"] [data-f="due"]`);
      if (inp && document.activeElement !== inp) {
        // fest eingetragen → als Wert; berechnet → als Platzhalter
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

  async function addTodo(phase) {
    PH[phase].el.classList.remove('collapsed');
    try {
      const t = await api('POST', `${tbase()}/todos`, { todo: { title: '', duration: 900, phase } });
      setTimeout(() => { const el = $(`tr[data-tid="${t.id}"] [data-f="title"]`); el && el.focus(); }, 150);
    } catch (err) { toast(err.message, 'error'); }
  }

  // ---------- Eingaben (für beide Blöcke) ----------
  let orig = '';
  for (const panel of panels) {
    panel.addEventListener('focusin', e => { if (e.target.dataset.f) orig = e.target.value; });
    panel.addEventListener('focusout', e => {
      const f = e.target.dataset.f; if (!f) return;
      const tid = e.target.closest('[data-tid]').dataset.tid;
      const t = (rd.todos || []).find(x => x.id === tid); if (!t) return;
      const v = e.target.value;
      if (f === 'duration') {
        const s = Timing.parseDur(v);
        if (s == null) { toast('Dauer nicht erkannt – z. B. 30, 1:30:00 oder 90s', 'error'); e.target.value = orig; return; }
        e.target.value = Timing.fmtDur(s * 1000);
        if (s === t.duration) return;
        t.duration = s; patch(tid, { duration: s });
      } else if (f === 'due') {
        if (v.trim() === orig.trim()) return;
        if (!v.trim()) { t.fixedDue = null; patch(tid, { fixedDue: null }); renderTodos(); return; }
        const ms = parseDue(v, phaseOf(t), Timing.computeTodos(rd, now()));
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
    panel.addEventListener('keydown', e => {
      if (!e.target.dataset.f) return;
      if (e.key === 'Enter') e.target.blur();
      if (e.key === 'Escape') { e.target.value = orig; e.target.blur(); }
    });
    panel.addEventListener('change', e => {
      if (!e.target.classList.contains('tdone')) return;
      const tid = e.target.closest('[data-tid]').dataset.tid;
      const t = rd.todos.find(x => x.id === tid);
      t.done = e.target.checked; updateTodos();
      e.target.blur(); // Leertaste soll danach wieder die Show steuern
      patch(tid, { done: e.target.checked });
    });
    panel.addEventListener('click', e => {
      const add = e.target.closest('[data-add-phase]');
      if (add) return addTodo(add.dataset.addPhase);
      const reset = e.target.closest('[data-reset-phase]');
      if (reset) {
        const name = reset.dataset.resetPhase === 'post' ? 'Nachbereitung' : 'Vorbereitung';
        if (confirm(`Alle Häkchen der ${name} entfernen?`)) api('POST', `${tbase()}/todos-reset`, { phase: reset.dataset.resetPhase }).catch(err => toast(err.message, 'error'));
        return;
      }
      const row = e.target.closest('[data-tid]'); if (!row) return;
      const tid = row.dataset.tid, t = rd.todos.find(x => x.id === tid);
      if (e.target.closest('[data-par]')) {
        if (!t.parallel && rd.todos.filter(x => phaseOf(x) === phaseOf(t)).indexOf(t) === 0) return toast('Die erste Aufgabe kann nicht parallel sein', 'error');
        patch(tid, { parallel: !t.parallel });
      }
      if (e.target.closest('[data-unfix]')) { t.fixedDue = null; patch(tid, { fixedDue: null }); renderTodos(); }
      if (e.target.closest('[data-swap]')) {
        api('POST', `${tbase()}/todos-move`, { todoId: tid, phase: phaseOf(t) === 'post' ? 'pre' : 'post' }).catch(err => toast(err.message, 'error'));
      }
      if (e.target.closest('[data-del]') && confirm(`„${t.title || 'Todo'}“ löschen?`)) {
        api('DELETE', `${tbase()}/todos/${tid}`).catch(err => toast(err.message, 'error'));
      }
    });

    // Sortieren per Drag & Drop – auch zwischen Vor- und Nachbereitung
    panel.addEventListener('dragstart', e => {
      const row = e.target.closest('tr[data-tid]'); if (!row || !canEdit) return;
      dragTodo = row.dataset.tid; e.dataTransfer.effectAllowed = 'move';
    });
    panel.addEventListener('dragover', e => {
      if (!dragTodo) return;
      e.preventDefault();
      panels.forEach(p => p.classList.toggle('drop-target', p === panel));
    });
    panel.addEventListener('dragend', () => { dragTodo = null; panels.forEach(p => p.classList.remove('drop-target')); });
    panel.addEventListener('drop', e => {
      e.preventDefault();
      panels.forEach(p => p.classList.remove('drop-target'));
      if (!dragTodo) return;
      const phase = panel.dataset.phase, row = e.target.closest('tr[data-tid]');
      const todoId = dragTodo; dragTodo = null;
      if (row && row.dataset.tid === todoId) return;
      const t = rd.todos.find(x => x.id === todoId);
      rd.todos.splice(rd.todos.indexOf(t), 1);
      if (row) rd.todos.splice(rd.todos.findIndex(x => x.id === row.dataset.tid), 0, t); else rd.todos.push(t);
      if (phaseOf(t) !== phase) { t.phase = phase; t.fixedDue = null; }
      renderTodos();
      api('POST', `${tbase()}/todos-move`, { todoId, beforeId: row ? row.dataset.tid : null, phase }).catch(err => toast(err.message, 'error'));
    });
  }

  for (const cfg of Object.values(PH)) {
    cfg.buf.addEventListener('change', e => {
      const min = Math.max(0, Number(String(e.target.value).replace(',', '.')) || 0);
      api('PATCH', tbase(), { [cfg.bufKey]: Math.round(min * 60) }).catch(err => toast(err.message, 'error'));
    });
    cfg.buf.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  }
})();
