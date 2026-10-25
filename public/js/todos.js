// Vorbereitungs-Todos im Editor: Dauer eintragen → spätester Beginn wird vom Show-Start zurückgerechnet
(function () {
  const panel = $('#todoPanel');
  const tbase = () => `/api/rundowns/${encodeURIComponent(RID)}`;
  let pending = false, dragTodo = null;

  // Ein-/Ausklappen merken (pro Browser)
  try { if (localStorage.getItem('todosCollapsed') === '1') panel.classList.add('collapsed'); } catch { /* egal */ }
  $('#todoToggle').onclick = () => {
    panel.classList.toggle('collapsed');
    try { localStorage.setItem('todosCollapsed', panel.classList.contains('collapsed') ? '1' : '0'); } catch { /* egal */ }
  };

  const editing = () => panel.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text';
  panel.addEventListener('focusout', () => setTimeout(() => { if (pending && !editing()) { pending = false; renderTodos(); } }, 50));

  function fmtT(ms, rel) {
    if (ms == null) return '–';
    if (rel) return ms === 0 ? 'Start' : `${Timing.fmtDur(-ms)} vorher`.replace(/^-/, '');
    const d = new Date(ms), today = new Date(now());
    const sameDay = d.toDateString() === today.toDateString();
    return Timing.fmtClock(ms) + (sameDay || !rd.startTime || d.toDateString() === new Date(rd.startTime).toDateString() ? '' : ` (${d.toLocaleDateString('de-DE', { weekday: 'short' })})`);
  }
  const STATE = { overdue: 'überfällig', soon: 'jetzt beginnen', ok: 'geplant', done: 'erledigt' };

  window.renderTodos = function () {
    if (!rd) return;
    if (editing()) { pending = true; return; }
    const todos = rd.todos || [];
    const ce = canEdit;
    $$('.need-editor-inline', panel).forEach(el => el.classList.toggle('hidden', !ce));
    if (document.activeElement !== $('#todoBuffer')) $('#todoBuffer').value = Math.round((rd.todoBuffer || 0) / 60);
    if (!todos.length) {
      $('#todoBody').innerHTML = `<div class="todo-empty">${ce ? 'Noch keine Vorbereitung eingetragen. Mit „＋ Todo“ Aufgaben wie Aufbau, Soundcheck oder Stream-Test anlegen – aus der Dauer wird zurückgerechnet, wann ihr spätestens anfangen müsst.' : 'Keine Vorbereitung eingetragen.'}</div>`;
      panel.classList.toggle('hidden', !ce && !todos.length);
      updateTodos();
      return;
    }
    panel.classList.remove('hidden');
    $('#todoBody').innerHTML = `<table class="todo"><thead><tr>
        <th></th><th style="width:28px">✓</th><th>Aufgabe</th><th style="width:150px">Wer</th><th style="width:96px">Dauer</th>
        <th style="width:110px">Spätestens Beginn</th><th style="width:90px">Fertig bis</th><th style="width:110px">Status</th><th style="width:70px"></th>
      </tr></thead><tbody>${todos.map(t => `
      <tr data-tid="${t.id}" class="${t.parallel ? 'par' : ''}">
        <td class="todo-handle" draggable="${ce}">${ce ? '⋮⋮' : ''}</td>
        <td><input type="checkbox" class="tdone" ${t.done ? 'checked' : ''} ${canControl ? '' : 'disabled'} title="${t.done && t.doneBy ? `erledigt von ${esc(t.doneBy)}${t.doneAt ? ' um ' + Timing.fmtClock(Date.parse(t.doneAt)) : ''}` : 'Erledigt'}"></td>
        <td class="tt">${ce ? `<input type="text" data-f="title" value="${esc(t.title)}" placeholder="Aufgabe">` : esc(t.title)}
          ${t.done && t.doneBy ? `<br><span class="doneby">✓ ${esc(t.doneBy)}${t.doneAt ? ', ' + Timing.fmtClock(Date.parse(t.doneAt)) : ''}</span>` : ''}</td>
        <td>${ce ? `<input type="text" data-f="who" value="${esc(t.who)}" placeholder="–">` : esc(t.who)}</td>
        <td>${ce ? `<input type="text" data-f="duration" class="t-dur" value="${Timing.fmtDur(t.duration * 1000)}">` : `<span class="mono">${Timing.fmtDur(t.duration * 1000)}</span>`}</td>
        <td class="t-time" data-ls="${t.id}"></td>
        <td class="t-time muted" data-due="${t.id}"></td>
        <td data-st="${t.id}"></td>
        <td style="text-align:right;white-space:nowrap">${ce ? `
          <button class="btn icon small" data-par title="${t.parallel ? 'Nicht mehr parallel' : 'Parallel zur vorherigen Aufgabe (gleiche Fertig-Zeit)'}" style="${t.parallel ? 'border-color:var(--accent)' : ''}">⇉</button>
          <button class="btn icon small danger" data-del title="Löschen">✕</button>` : ''}</td>
      </tr>`).join('')}</tbody></table>`;
    updateTodos();
  };

  // Zeiten/Status laufend aktualisieren (ändert sich mit der Uhrzeit)
  window.updateTodos = function (t) {
    if (!rd) return;
    const r = Timing.computeTodos(rd, t ?? now());
    const sum = [];
    if (r.total) {
      sum.push(`<span>${r.done}/${r.total} erledigt</span>`);
      if (r.prepStart != null) sum.push(`<span>Beginn spätestens <strong class="mono" style="color:var(--text)">${fmtT(r.prepStart, r.relative)}</strong></span>`);
      if (rd.todoBuffer) sum.push(`<span>fertig bis ${fmtT(r.prepEnd, r.relative)}</span>`);
      if (r.overdue) sum.push(`<span class="tstate overdue">${r.overdue} überfällig</span>`);
      else if (r.open === 0) sum.push('<span class="tstate done">alles erledigt</span>');
      if (r.relative) sum.push('<span class="warnc">Startzeit fehlt – Zeiten relativ zum Start</span>');
    }
    const html = sum.join('<span>·</span>');
    if ($('#todoSum').innerHTML !== html) $('#todoSum').innerHTML = html;
    for (const td of rd.todos || []) {
      const x = r.items[td.id]; if (!x) continue;
      const set = (sel, v) => { const el = $(sel); if (el && el.innerHTML !== v) el.innerHTML = v; };
      set(`[data-ls="${td.id}"]`, fmtT(x.latestStart, r.relative));
      set(`[data-due="${td.id}"]`, fmtT(x.due, r.relative));
      set(`[data-st="${td.id}"]`, `<span class="tstate ${x.state}">${STATE[x.state]}</span>`);
      const row = $(`tr[data-tid="${td.id}"]`);
      if (row) { row.classList.toggle('done', x.state === 'done'); row.classList.toggle('overdue', x.state === 'overdue'); row.classList.toggle('soon', x.state === 'soon'); }
    }
  };

  const patch = (tid, body) => api('PATCH', `${tbase()}/todos/${tid}`, body).catch(e => toast(e.message, 'error'));

  // Eingaben
  let orig = '';
  $('#todoBody').addEventListener('focusin', e => { if (e.target.dataset.f) orig = e.target.value; });
  $('#todoBody').addEventListener('focusout', e => {
    const f = e.target.dataset.f; if (!f) return;
    const tid = e.target.closest('[data-tid]').dataset.tid;
    const t = (rd.todos || []).find(x => x.id === tid); if (!t) return;
    let v = e.target.value;
    if (f === 'duration') {
      const s = Timing.parseDur(v);
      if (s == null) { toast('Dauer nicht erkannt – z. B. 30, 1:30:00 oder 90s', 'error'); e.target.value = orig; return; }
      e.target.value = Timing.fmtDur(s * 1000);
      if (s === t.duration) return;
      t.duration = s; v = s;
    } else {
      if (v === orig) return;
      t[f] = v;
    }
    patch(tid, { [f]: v });
    updateTodos();
  });
  $('#todoBody').addEventListener('keydown', e => {
    if (!e.target.dataset.f) return;
    if (e.key === 'Enter') e.target.blur();
    if (e.key === 'Escape') { e.target.value = orig; e.target.blur(); }
  });
  $('#todoBody').addEventListener('change', e => {
    if (!e.target.classList.contains('tdone')) return;
    const tid = e.target.closest('[data-tid]').dataset.tid;
    const t = rd.todos.find(x => x.id === tid);
    t.done = e.target.checked; updateTodos();
    e.target.blur(); // Leertaste soll danach wieder die Show steuern, nicht das Häkchen umschalten
    patch(tid, { done: e.target.checked });
  });
  $('#todoBody').addEventListener('click', async e => {
    const row = e.target.closest('[data-tid]'); if (!row) return;
    const tid = row.dataset.tid, t = rd.todos.find(x => x.id === tid);
    if (e.target.closest('[data-par]')) {
      if (!t.parallel && rd.todos.indexOf(t) === 0) return toast('Die erste Aufgabe kann nicht parallel sein', 'error');
      patch(tid, { parallel: !t.parallel });
    }
    if (e.target.closest('[data-del]') && confirm(`„${t.title || 'Todo'}“ löschen?`)) {
      api('DELETE', `${tbase()}/todos/${tid}`).catch(err => toast(err.message, 'error'));
    }
  });

  // Sortieren per Drag & Drop
  $('#todoBody').addEventListener('dragstart', e => {
    const row = e.target.closest('tr[data-tid]'); if (!row || !canEdit) return;
    dragTodo = row.dataset.tid; e.dataTransfer.effectAllowed = 'move';
  });
  $('#todoBody').addEventListener('dragover', e => { if (dragTodo) e.preventDefault(); });
  $('#todoBody').addEventListener('drop', e => {
    e.preventDefault();
    const row = e.target.closest('tr[data-tid]');
    if (!dragTodo || !row || row.dataset.tid === dragTodo) { dragTodo = null; return; }
    const todoId = dragTodo; dragTodo = null;
    const i = rd.todos.findIndex(x => x.id === todoId), [t] = rd.todos.splice(i, 1);
    rd.todos.splice(rd.todos.findIndex(x => x.id === row.dataset.tid), 0, t);
    renderTodos();
    api('POST', `${tbase()}/todos-move`, { todoId, beforeId: row.dataset.tid }).catch(err => toast(err.message, 'error'));
  });

  $('#todoAdd').onclick = async () => {
    panel.classList.remove('collapsed');
    try {
      const t = await api('POST', `${tbase()}/todos`, { todo: { title: '', duration: 900 } });
      setTimeout(() => { const el = $(`tr[data-tid="${t.id}"] [data-f="title"]`); el && el.focus(); }, 150);
    } catch (err) { toast(err.message, 'error'); }
  };
  $('#todoReset').onclick = () => { if (confirm('Alle Häkchen der Vorbereitung entfernen?')) api('POST', `${tbase()}/todos-reset`).catch(err => toast(err.message, 'error')); };
  $('#todoBuffer').addEventListener('change', e => {
    const min = Math.max(0, Number(String(e.target.value).replace(',', '.')) || 0);
    api('PATCH', tbase(), { todoBuffer: Math.round(min * 60) }).catch(err => toast(err.message, 'error'));
  });
  $('#todoBuffer').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
})();
