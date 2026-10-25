// Gemeinsame Helfer für alle Seiten
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !location.pathname.startsWith('/login')) {
    location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search);
    throw new Error('Anmeldung erforderlich');
  }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// ---------- Benutzer: Menü, eigenes Konto, Verwaltung ----------
const ROLE_LABEL = { admin: 'Admin', editor: 'Bearbeiten', operator: 'Steuern', viewer: 'Nur ansehen' };
const ROLE_LEVEL = { viewer: 1, operator: 2, editor: 3, admin: 4 };
let ME = null, AUTH = null;
async function loadMe() {
  AUTH = await api('GET', '/api/auth');
  ME = AUTH.user;
  document.body.dataset.role = ME ? ME.role : '';
  return ME;
}
const roleAtLeast = r => !!ME && (ROLE_LEVEL[ME.role] || 0) >= ROLE_LEVEL[r];

function mountUserMenu(container) {
  if (!ME || !AUTH.enabled || !container) return;
  const initials = (ME.name || ME.username).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const wrap = document.createElement('div');
  wrap.className = 'usermenu';
  wrap.innerHTML = `
    <button class="btn small um-btn" aria-haspopup="true" title="${esc(ME.name || ME.username)} (${ROLE_LABEL[ME.role]})">
      <span class="avatar">${esc(initials)}</span><span class="um-name">${esc(ME.name || ME.username)}</span></button>
    <div class="um-pop hidden">
      <div class="um-head"><strong>${esc(ME.name || ME.username)}</strong><span class="muted">@${esc(ME.username)} · ${ROLE_LABEL[ME.role]}</span></div>
      ${ME.id !== 'api' && ME.id !== '-' ? '<button data-um="account">Mein Konto / Passwort</button>' : ''}
      ${ME.role === 'admin' ? '<button data-um="users">Benutzer verwalten</button>' : ''}
      <a href="/logout" class="um-logout">Abmelden</a>
    </div>`;
  container.appendChild(wrap);
  const pop = wrap.querySelector('.um-pop');
  wrap.querySelector('.um-btn').onclick = e => { e.stopPropagation(); pop.classList.toggle('hidden'); };
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) pop.classList.add('hidden'); });
  wrap.addEventListener('click', e => {
    const b = e.target.closest('[data-um]'); if (!b) return;
    pop.classList.add('hidden');
    if (b.dataset.um === 'account') openAccount();
    if (b.dataset.um === 'users') openUsers();
  });
}

function dialog(id, title, bodyHtml, footHtml, width) {
  let d = document.getElementById(id);
  if (d) d.remove();
  d = document.createElement('dialog');
  d.id = id;
  if (width) d.style.width = width;
  d.innerHTML = `<div class="dlg-head"><h3>${title}</h3><button class="btn icon" data-x>✕</button></div>
    <div class="dlg-body">${bodyHtml}</div><div class="dlg-foot">${footHtml || ''}</div>`;
  document.body.appendChild(d);
  d.querySelector('[data-x]').onclick = () => d.close();
  d.addEventListener('close', () => setTimeout(() => d.remove(), 50));
  d.showModal();
  return d;
}

function openAccount() {
  const d = dialog('dlgAccount', 'Mein Konto', `
    <label class="field"><span>Anzeigename</span><input type="text" id="acName" value="${esc(ME.name || '')}"></label>
    <h4 style="margin:18px 0 8px;font-size:13px">Passwort ändern</h4>
    <label class="field"><span>Aktuelles Passwort</span><input type="password" id="acOld" autocomplete="current-password"></label>
    <label class="field"><span>Neues Passwort (mind. 8 Zeichen)</span><input type="password" id="acNew" autocomplete="new-password"></label>
    <label class="field"><span>Neues Passwort wiederholen</span><input type="password" id="acNew2" autocomplete="new-password"></label>
    <p class="muted" style="font-size:12px;margin:0">Nach einer Passwortänderung werden alle anderen Geräte abgemeldet.</p>`,
    `<button class="btn" data-cancel>Abbrechen</button><button class="btn primary" id="acSave">Speichern</button>`);
  d.querySelector('[data-cancel]').onclick = () => d.close();
  d.querySelector('#acSave').onclick = async () => {
    const body = { name: $('#acName').value };
    if ($('#acNew').value || $('#acOld').value) {
      if ($('#acNew').value !== $('#acNew2').value) return toast('Die neuen Passwörter stimmen nicht überein', 'error');
      body.currentPassword = $('#acOld').value; body.newPassword = $('#acNew').value;
    }
    try { ME = { ...ME, ...(await api('PATCH', '/api/me', body)) }; toast('Gespeichert', 'ok'); d.close(); }
    catch (err) { toast(err.message, 'error'); }
  };
}

async function openUsers() {
  const d = dialog('dlgUsers', 'Benutzer verwalten', `
    <div id="uList" class="ulist"><div class="muted">Lade …</div></div>
    <h4 style="margin:20px 0 8px;font-size:13px">Neuer Benutzer</h4>
    <div class="row2" style="grid-template-columns:1fr 1fr">
      <label class="field"><span>Name</span><input type="text" id="nuName" placeholder="z. B. Anna Müller"></label>
      <label class="field"><span>Benutzername</span><input type="text" id="nuUser" autocapitalize="none" spellcheck="false" placeholder="z. B. anna"></label>
      <label class="field"><span>Start-Passwort (mind. 8 Zeichen)</span><div style="display:flex;gap:6px"><input type="text" id="nuPw" autocomplete="off" class="mono"><button class="btn small" id="nuGen" title="Zufälliges Passwort">🎲</button></div></label>
      <label class="field"><span>Rolle</span><select id="nuRole">
        <option value="viewer">Nur ansehen – Abläufe lesen, nichts ändern</option>
        <option value="operator">Steuern – Show bedienen, Todos abhaken</option>
        <option value="editor" selected>Bearbeiten – Abläufe anlegen und ändern</option>
        <option value="admin">Admin – zusätzlich Einstellungen und Benutzer</option></select></label>
    </div>
    <button class="btn primary small" id="nuAdd">＋ Benutzer anlegen</button>`, '', 'min(760px, 96vw)');
  const gen = () => { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const a = crypto.getRandomValues(new Uint32Array(12)); return [...a].map(n => c[n % c.length]).join(''); };
  d.querySelector('#nuGen').onclick = () => { $('#nuPw').value = gen(); };
  $('#nuPw').value = gen();
  async function refresh() {
    const list = await api('GET', '/api/users');
    $('#uList').innerHTML = list.map(u => `
      <div class="urow ${u.disabled ? 'off' : ''}" data-uid="${u.id}">
        <span class="avatar">${esc((u.name || u.username).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span>
        <div class="uinfo"><strong>${esc(u.name || u.username)}</strong> <span class="muted">@${esc(u.username)}</span>${u.id === ME.id ? ' <span class="badge">du</span>' : ''}${u.disabled ? ' <span class="badge warn">deaktiviert</span>' : ''}
          <div class="muted" style="font-size:11px">${u.lastLogin ? 'zuletzt angemeldet ' + new Date(u.lastLogin).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'noch nie angemeldet'}</div></div>
        <select data-act="role" ${u.id === ME.id ? 'disabled title="Eigene Rolle kann nicht geändert werden"' : ''} style="width:auto">
          ${['viewer', 'operator', 'editor', 'admin'].map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select>
        <button class="btn small" data-act="pw" title="Neues Passwort setzen">🔑</button>
        ${u.id === ME.id ? '' : `<button class="btn small" data-act="toggle">${u.disabled ? 'Aktivieren' : 'Sperren'}</button>
        <button class="btn small danger" data-act="del" title="Löschen">✕</button>`}
      </div>`).join('');
  }
  $('#uList').addEventListener('change', async e => {
    if (e.target.dataset.act !== 'role') return;
    const uid = e.target.closest('[data-uid]').dataset.uid;
    try { await api('PATCH', '/api/users/' + uid, { role: e.target.value }); toast('Rolle geändert', 'ok'); } catch (err) { toast(err.message, 'error'); }
    refresh();
  });
  $('#uList').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT') return;
    const row = b.closest('[data-uid]'), uid = row.dataset.uid, name = row.querySelector('strong').textContent;
    try {
      if (b.dataset.act === 'pw') {
        const pw = prompt(`Neues Passwort für ${name} (mind. 8 Zeichen):`, gen());
        if (!pw) return;
        await api('PATCH', '/api/users/' + uid, { password: pw });
        toast('Passwort gesetzt – bitte an ' + name + ' weitergeben', 'ok');
      }
      if (b.dataset.act === 'toggle') await api('PATCH', '/api/users/' + uid, { disabled: !row.classList.contains('off') });
      if (b.dataset.act === 'del') { if (!confirm(`${name} wirklich löschen?`)) return; await api('DELETE', '/api/users/' + uid); }
      refresh();
    } catch (err) { toast(err.message, 'error'); }
  });
  d.querySelector('#nuAdd').onclick = async () => {
    const body = { name: $('#nuName').value, username: $('#nuUser').value, password: $('#nuPw').value, role: $('#nuRole').value };
    try {
      const u = await api('POST', '/api/users', body);
      toast(`${u.username} angelegt – Passwort: ${body.password}`, 'ok');
      $('#nuName').value = ''; $('#nuUser').value = ''; $('#nuPw').value = gen();
      refresh();
    } catch (err) { toast(err.message, 'error'); }
  };
  refresh().catch(err => toast(err.message, 'error'));
}

function toast(msg, type = 'info') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3500);
  setTimeout(() => t.remove(), 4000);
}

function rundownIdFromPath() {
  const parts = location.pathname.split('/').filter(Boolean);
  return decodeURIComponent(parts[1] || '');
}

/**
 * Live-Verbindung mit automatischem Reconnect und Uhrabgleich.
 * onRundown(rd) bei jeder Änderung, onLive(live) bei Steuerbefehlen.
 */
function connectLive(id, { onRundown, onLive, onStatus }) {
  const conn = { offset: 0, rd: null };
  conn.now = () => Date.now() + conn.offset;

  // Uhrabgleich mit dem Server (wichtig, damit alle Displays dieselbe Restzeit zeigen)
  async function syncClock() {
    try {
      let best = null;
      for (let i = 0; i < 3; i++) {
        const t0 = Date.now();
        const { serverTime } = await (await fetch('/api/time', { cache: 'no-store' })).json();
        const rtt = Date.now() - t0;
        if (!best || rtt < best.rtt) best = { rtt, offset: serverTime + rtt / 2 - Date.now() };
      }
      conn.offset = best.offset;
    } catch { /* später erneut */ }
  }
  syncClock(); setInterval(syncClock, 60000);

  const es = new EventSource(`/api/rundowns/${encodeURIComponent(id)}/events`);
  es.onopen = () => onStatus && onStatus(true);
  es.onerror = () => onStatus && onStatus(false);
  es.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.type === 'rundown') { conn.rd = m.data; onRundown && onRundown(m.data); }
    if (m.type === 'live' && conn.rd) { conn.rd.live = m.data; onLive && onLive(m.data); }
  };
  return conn;
}

function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
