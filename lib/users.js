// Benutzerkonten (data/users.json) mit scrypt-Passwort-Hashes
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'users.json');

// Rollen, aufsteigend nach Rechten
const ROLES = {
  viewer: { level: 1, label: 'Nur ansehen', desc: 'Abläufe und Vorbereitung ansehen, nichts ändern' },
  operator: { level: 2, label: 'Steuern', desc: 'Show bedienen, Vorbereitungs-Todos abhaken' },
  editor: { level: 3, label: 'Bearbeiten', desc: 'Abläufe anlegen, bearbeiten, importieren, löschen' },
  admin: { level: 4, label: 'Admin', desc: 'Alles, inkl. Einstellungen und Benutzerverwaltung' },
};
const level = role => (ROLES[role] || { level: 0 }).level;

let cache = null;
function readAll() {
  if (cache) return cache;
  try { cache = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : []; } catch { cache = []; }
  return cache;
}
function writeAll(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(list, null, 2), { mode: 0o600 });
  fs.renameSync(FILE + '.tmp', FILE);
  cache = list;
}

function hash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const h = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$${salt}$${h}`;
}
function verify(password, stored) {
  const [alg, salt, h] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !h) return false;
  const test = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  const ref = Buffer.from(h, 'hex');
  return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}

const norm = u => String(u || '').trim().toLowerCase();
const publicUser = u => u && ({ id: u.id, username: u.username, name: u.name || '', role: u.role, disabled: !!u.disabled, createdAt: u.createdAt, lastLogin: u.lastLogin || null });

function validatePassword(pw) {
  if (String(pw || '').length < 8) throw Object.assign(new Error('Passwort muss mindestens 8 Zeichen haben'), { status: 400 });
}
function validateUsername(u) {
  if (!/^[a-zA-Z0-9._@-]{2,40}$/.test(String(u || '').trim())) {
    throw Object.assign(new Error('Benutzername: 2–40 Zeichen, nur Buchstaben, Ziffern und . _ @ -'), { status: 400 });
  }
}

function list() { return readAll().map(publicUser); }
function count() { return readAll().length; }
function byId(id) { return readAll().find(u => u.id === id) || null; }
function byName(username) { return readAll().find(u => norm(u.username) === norm(username)) || null; }
function activeAdmins(except) { return readAll().filter(u => u.role === 'admin' && !u.disabled && u.id !== except).length; }

function create({ username, password, name = '', role = 'editor' }) {
  validateUsername(username); validatePassword(password);
  if (!ROLES[role]) throw Object.assign(new Error('Unbekannte Rolle'), { status: 400 });
  if (byName(username)) throw Object.assign(new Error('Benutzername ist schon vergeben'), { status: 409 });
  const u = {
    id: crypto.randomBytes(8).toString('base64url'),
    username: String(username).trim(), name: String(name).trim().slice(0, 80), role,
    hash: hash(password), ver: 1, disabled: false, createdAt: new Date().toISOString(),
  };
  writeAll([...readAll(), u]);
  return publicUser(u);
}

function update(id, patch, { actorId } = {}) {
  const all = readAll().map(u => ({ ...u }));
  const u = all.find(x => x.id === id);
  if (!u) throw Object.assign(new Error('Benutzer nicht gefunden'), { status: 404 });
  const losingAdmin = u.role === 'admin' && !u.disabled &&
    ((patch.role && patch.role !== 'admin') || patch.disabled === true);
  if (losingAdmin && activeAdmins(u.id) === 0) throw Object.assign(new Error('Es muss mindestens ein aktiver Admin bleiben'), { status: 400 });
  if (patch.username !== undefined && norm(patch.username) !== norm(u.username)) {
    validateUsername(patch.username);
    if (byName(patch.username)) throw Object.assign(new Error('Benutzername ist schon vergeben'), { status: 409 });
    u.username = String(patch.username).trim();
  }
  if (patch.name !== undefined) u.name = String(patch.name).trim().slice(0, 80);
  if (patch.role !== undefined) {
    if (!ROLES[patch.role]) throw Object.assign(new Error('Unbekannte Rolle'), { status: 400 });
    if (u.role !== patch.role) { u.role = patch.role; u.ver++; }
  }
  if (patch.disabled !== undefined) {
    if (patch.disabled && id === actorId) throw Object.assign(new Error('Du kannst dich nicht selbst deaktivieren'), { status: 400 });
    if (!!patch.disabled !== !!u.disabled) { u.disabled = !!patch.disabled; u.ver++; }
  }
  if (patch.password) { validatePassword(patch.password); u.hash = hash(patch.password); u.ver++; }
  writeAll(all);
  return publicUser(u);
}

function remove(id, { actorId } = {}) {
  const u = byId(id);
  if (!u) throw Object.assign(new Error('Benutzer nicht gefunden'), { status: 404 });
  if (id === actorId) throw Object.assign(new Error('Du kannst dich nicht selbst löschen'), { status: 400 });
  if (u.role === 'admin' && !u.disabled && activeAdmins(u.id) === 0) throw Object.assign(new Error('Der letzte Admin kann nicht gelöscht werden'), { status: 400 });
  writeAll(readAll().filter(x => x.id !== id));
}

function checkLogin(username, password) {
  const u = byName(username);
  // Auch bei unbekanntem Namen rechnen, damit die Antwortzeit nichts verrät
  const ok = verify(password, u ? u.hash : 'scrypt$00$00');
  if (!u || !ok || u.disabled) return null;
  return u;
}

function touchLogin(id) {
  const all = readAll().map(u => (u.id === id ? { ...u, lastLogin: new Date().toISOString() } : u));
  writeAll(all);
}

/** Ersten Admin aus ADMIN_USERNAME / ADMIN_PASSWORD (.env) anlegen, falls noch keine Benutzer existieren */
function seedFromEnv(env) {
  if (count() > 0) return null;
  const username = env.str('ADMIN_USERNAME'), password = env.str('ADMIN_PASSWORD');
  if (!username || !password) return null;
  return create({ username, password, role: 'admin', name: 'Administrator' });
}

module.exports = { ROLES, level, list, count, byId, byName, create, update, remove, checkLogin, touchLogin, seedFromEnv, publicUser };
