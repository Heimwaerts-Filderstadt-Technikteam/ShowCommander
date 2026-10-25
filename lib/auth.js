// Anmeldung mit Benutzerkonten: signiertes Session-Cookie (HMAC), ohne Abhängigkeiten.
// API-Key (Header X-API-Key oder ?key=) bleibt für Companion / Stream Deck erhalten.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const env = require('./env');
const users = require('./users');

const COOKIE = 'sc_session';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function cfg() {
  return {
    enabled: env.bool('AUTH_ENABLED', true),     // false = komplett ohne Anmeldung (nur im geschützten Netz!)
    apiKey: env.str('API_KEY'),
    apiKeyRole: users.ROLES[env.str('API_KEY_ROLE')] ? env.str('API_KEY_ROLE') : 'editor',
    sessionDays: Math.max(1, env.num('SESSION_DAYS', 30)),
    secureCookie: env.str('COOKIE_SECURE', 'auto'), // auto | true | false
  };
}

// Geheimnis zum Signieren: SESSION_SECRET oder einmalig erzeugt und in data/ gespeichert
let secret = null;
function getSecret() {
  if (secret) return secret;
  if (env.has('SESSION_SECRET')) return (secret = env.str('SESSION_SECRET'));
  const f = path.join(DATA_DIR, '.session-secret');
  try {
    if (fs.existsSync(f)) secret = fs.readFileSync(f, 'utf8').trim();
    if (!secret) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      secret = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(f, secret, { mode: 0o600 });
    }
  } catch { secret = crypto.randomBytes(32).toString('hex'); }
  return secret;
}
const sign = data => crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  if (x.length !== y.length) { crypto.timingSafeEqual(x, x); return false; }
  return crypto.timingSafeEqual(x, y);
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignorieren */ } }
  }
  return out;
}

const ANON_ADMIN = { id: '-', username: 'admin', name: 'Ohne Anmeldung', role: 'admin' };

/**
 * Ermittelt den angemeldeten Benutzer (oder null) und hängt ihn an req.user.
 * Rolle des Benutzers wird bei jedem Request frisch gelesen → Rechteänderungen wirken sofort.
 */
function currentUser(req) {
  if (req.user !== undefined) return req.user;
  const c = cfg();
  let user = null;
  if (!c.enabled) user = ANON_ADMIN;
  else {
    const key = req.get('x-api-key') || req.query.key;
    if (c.apiKey && key && safeEqual(key, c.apiKey)) user = { id: 'api', username: 'api-key', name: 'API-Key', role: c.apiKeyRole };
    else {
      const raw = parseCookies(req)[COOKIE];
      if (raw) {
        const [uid, ver, exp, sig] = raw.split('.');
        if (uid && ver && exp && sig && safeEqual(sig, sign(`${uid}.${ver}.${exp}`)) && Number(exp) > Date.now()) {
          const u = users.byId(uid);
          if (u && !u.disabled && String(u.ver) === ver) user = users.publicUser(u);
        }
      }
    }
  }
  req.user = user;
  return user;
}

const hasRole = (req, role) => { const u = currentUser(req); return !!u && users.level(u.role) >= users.level(role); };
const isAuthed = req => !!currentUser(req);

function isSecure(req) {
  const s = cfg().secureCookie.toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return !!req.socket.encrypted || (req.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https';
}

function setSession(req, res, u, remember) {
  const days = remember ? cfg().sessionDays : 1;
  const payload = `${u.id}.${u.ver}.${Date.now() + days * 864e5}`;
  const parts = [`${COOKIE}=${payload}.${sign(payload)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (remember) parts.push(`Max-Age=${days * 86400}`);
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function clearSession(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecure(req) ? '; Secure' : ''}`);
}

// Schutz gegen Passwort-Raten: max. 10 Fehlversuche pro IP in 15 Minuten
const attempts = new Map();
const WINDOW = 15 * 60e3;
// X-Forwarded-For nur hinter einem Reverse-Proxy beachten (TRUST_PROXY=true), sonst ließe er sich fälschen
function clientIp(req) {
  if (env.bool('TRUST_PROXY', false)) {
    const xff = (req.get('x-forwarded-for') || '').split(',').map(s => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return req.socket.remoteAddress || '?';
}
function blockedMinutes(req) {
  const a = attempts.get(clientIp(req));
  if (!a) return 0;
  if (Date.now() - a.first > WINDOW) { attempts.delete(clientIp(req)); return 0; }
  return a.count >= 10 ? Math.ceil((a.first + WINDOW - Date.now()) / 60e3) : 0;
}
function fail(req) {
  const ip = clientIp(req);
  const a = attempts.get(ip) || { count: 0, first: Date.now() };
  a.count++; attempts.set(ip, a);
}
setInterval(() => { const t = Date.now(); for (const [k, v] of attempts) if (t - v.first > WINDOW) attempts.delete(k); }, 60e3).unref();

function login(req, res) {
  const wait = blockedMinutes(req);
  if (wait) return { ok: false, status: 429, error: `Zu viele Fehlversuche. Bitte in ${wait} Min. erneut versuchen.` };
  const { username = '', password = '', remember = true } = req.body || {};
  const u = users.checkLogin(username, password);
  if (!u) { fail(req); return { ok: false, status: 401, error: 'Benutzername oder Passwort falsch' }; }
  attempts.delete(clientIp(req));
  users.touchLogin(u.id);
  setSession(req, res, users.byId(u.id), !!remember);
  return { ok: true, user: users.publicUser(u) };
}

/** Erster Start ohne Benutzer: ersten Admin über die Login-Seite anlegen */
function needsSetup() { return cfg().enabled && users.count() === 0; }
function setup(req, res) {
  if (!needsSetup()) return { ok: false, status: 409, error: 'Es gibt bereits Benutzer' };
  const { username, password, name } = req.body || {};
  const u = users.create({ username, password, name, role: 'admin' });
  users.touchLogin(u.id);
  setSession(req, res, users.byId(u.id), true);
  return { ok: true, user: u };
}

// Eigenes Passwort nach Änderung: neue Session ausstellen (alte werden durch ver++ ungültig)
function refreshSession(req, res, id) {
  const u = users.byId(id);
  if (u) setSession(req, res, u, true);
}

function safeNext(n) {
  n = String(n || '/');
  return n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') && !n.startsWith('/login') ? n : '/';
}

/** API-Middleware: 401 ohne Anmeldung, 403 bei zu wenig Rechten */
const requireApi = (role = 'editor') => (req, res, next) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Anmeldung erforderlich', login: '/login' });
  if (!hasRole(req, role)) return res.status(403).json({ error: `Dafür fehlen dir die Rechte (benötigt: ${users.ROLES[role].label})` });
  next();
};
/** Seiten-Middleware: Weiterleitung zur Login-Seite */
const requirePage = (role = 'viewer') => (req, res, next) => {
  if (!isAuthed(req)) {
    res.statusCode = 302;
    res.setHeader('Location', '/login?next=' + encodeURIComponent(req.url));
    return res.end();
  }
  if (!hasRole(req, role)) return res.status(403).send('Keine Berechtigung für diese Seite');
  next();
};

module.exports = { cfg, currentUser, isAuthed, hasRole, login, setup, needsSetup, clearSession, refreshSession, requireApi, requirePage, safeNext };
