// Automatisches Löschen alter Abläufe (Standard: 14 Tage nach Gottesdienst bzw. letzter Änderung)
const store = require('./store');

function cleanup({ dryRun = false } = {}) {
  const now = Date.now();
  const deleted = [];
  for (const r of store.list()) {
    if (r.isTemplate || r.keep || !r.deleteAt || r.live) continue;
    if (Date.parse(r.deleteAt) > now) continue;
    deleted.push({ id: r.id, name: r.name });
    if (!dryRun) store.remove(r.id);
  }
  if (deleted.length && !dryRun) console.log(`[Aufbewahrung] ${deleted.length} Ablauf/Abläufe gelöscht: ${deleted.map(d => d.name).join(', ')}`);
  return deleted;
}

function start() {
  cleanup();
  setInterval(cleanup, 60 * 60 * 1000).unref();
}

module.exports = { cleanup, start };
