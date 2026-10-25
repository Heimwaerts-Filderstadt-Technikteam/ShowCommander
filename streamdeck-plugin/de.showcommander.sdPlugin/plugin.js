/* ShowCommander – Stream-Deck-Plugin (SDK v2, HTML-Codepfad)
 * Die Stream-Deck-Software ruft connectElgatoStreamDeckSocket() beim Laden auf. */

let ws = null;
let pluginUUID = null;
let globalSettings = { server: '', rundown: 'active', apiKey: '' };
const contexts = new Map(); // context -> { action, settings, pressedAt, lastImage }
let state = null;
let lastError = '';
let pollTimer = null;

function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

function baseUrl() {
  let s = String(globalSettings.server || '').trim().replace(/\/+$/, '');
  if (!s) return null;
  if (!/^https?:\/\//.test(s)) s = 'http://' + s;
  if (!/:\d+$/.test(s.replace(/^https?:\/\//, ''))) s += ':8080';
  return `${s}/api/rundowns/${encodeURIComponent(globalSettings.rundown || 'active')}`;
}

function withKey(url) {
  return globalSettings.apiKey ? url + (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(globalSettings.apiKey) : url;
}

async function request(method, path) {
  const b = baseUrl();
  if (!b) throw new Error('Server fehlt');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(withKey(`${b}/${path}`), { method, signal: ctrl.signal, cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('API-Key falsch');
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Keine Antwort');
    throw err;
  } finally { clearTimeout(t); }
}

function renderAll() {
  for (const [context, c] of contexts) {
    const img = Keys.render(c.action, c.settings || {}, state, { error: lastError });
    const key = img || 'static';
    if (key === c.lastImage) continue;
    c.lastImage = key;
    // null => Bild aus dem Manifest (setImage ohne Bild setzt es zurück)
    send({ event: 'setImage', context, payload: img ? { image: img, target: 0 } : { target: 0 } });
  }
}

async function poll() {
  clearTimeout(pollTimer);
  if (contexts.size && baseUrl()) {
    try {
      state = await request('GET', 'state');
      lastError = '';
    } catch (err) {
      state = null;
      lastError = err.message;
    }
    renderAll();
  }
  pollTimer = setTimeout(poll, state ? 250 : 2000);
}

async function control(context, cmd, arg) {
  try {
    const q = arg !== undefined && arg !== '' ? `?arg=${encodeURIComponent(arg)}` : '';
    const data = await request('POST', `control/${cmd}${q}`);
    if (data && data.status) { state = data; renderAll(); }
    if (data && data.ok === false) send({ event: 'showAlert', context });
  } catch (err) {
    lastError = err.message;
    send({ event: 'showAlert', context });
  }
}

function onKeyDown(context, action) {
  const c = contexts.get(context);
  if (c) c.pressedAt = Date.now();
  const a = action.split('.').pop();
  const s = c?.settings || {};
  if (a === 'go') control(context, state && state.status !== 'stopped' ? 'next' : 'start');
  if (a === 'prev') control(context, 'prev');
  if (a === 'pause') control(context, 'toggle');
  if (a === 'adjust') control(context, 'adjust', Number(s.seconds ?? 60));
  if (a === 'goto') control(context, 'goto', String(s.cue || 1));
  if (a === 'display' && s.mode === 'next') control(context, 'next');
}

function onKeyUp(context, action) {
  const c = contexts.get(context);
  const a = action.split('.').pop();
  if (a === 'end') {
    const held = c?.pressedAt ? Date.now() - c.pressedAt : 0;
    if (held >= 700) control(context, 'end');
    else send({ event: 'showAlert', context }); // kurz gedrückt: Hinweis, nichts passiert
  }
}

// eslint-disable-next-line no-unused-vars
function connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, inInfo) {
  pluginUUID = inPluginUUID;
  ws = new WebSocket('ws://127.0.0.1:' + inPort);
  ws.onopen = () => {
    send({ event: inRegisterEvent, uuid: inPluginUUID });
    send({ event: 'getGlobalSettings', context: inPluginUUID });
  };
  ws.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    const { event, action, context, payload } = msg;
    switch (event) {
      case 'willAppear':
        contexts.set(context, { action, settings: payload?.settings || {}, lastImage: null });
        renderAll();
        if (contexts.size === 1) poll();
        break;
      case 'willDisappear':
        contexts.delete(context);
        break;
      case 'didReceiveSettings':
        if (contexts.has(context)) { const c = contexts.get(context); c.settings = payload?.settings || {}; c.lastImage = null; renderAll(); }
        break;
      case 'didReceiveGlobalSettings':
        globalSettings = { server: '', rundown: 'active', apiKey: '', ...(payload?.settings || {}) };
        state = null; poll();
        break;
      case 'sendToPlugin':
        if (payload?.globalSettings) { globalSettings = { ...globalSettings, ...payload.globalSettings }; state = null; poll(); }
        if (payload?.test) {
          request('GET', 'state')
            .then(s => send({ event: 'sendToPropertyInspector', action, context, payload: { testResult: `✔ Verbunden: ${s.rundown?.name || ''}` } }))
            .catch(err => send({ event: 'sendToPropertyInspector', action, context, payload: { testResult: `✖ ${err.message}` } }));
        }
        break;
      case 'keyDown':
        onKeyDown(context, action);
        break;
      case 'keyUp':
        onKeyUp(context, action);
        break;
    }
  };
}
