// Lädt eine .env-Datei aus dem Projektordner (ohne Abhängigkeiten).
// Bereits gesetzte Umgebungsvariablen (z. B. aus Docker) haben Vorrang.
const fs = require('fs');
const path = require('path');

function parse(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      const q = v[0];
      v = v.slice(1, -1);
      if (q === '"') v = v.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    } else {
      v = v.replace(/\s+#.*$/, '').trim(); // Kommentar am Zeilenende
    }
    out[m[1]] = v;
  }
  return out;
}

function load(file = process.env.ENV_FILE || path.join(__dirname, '..', '.env')) {
  if (!fs.existsSync(file)) return null;
  const vars = parse(fs.readFileSync(file, 'utf8'));
  for (const [k, v] of Object.entries(vars)) if (process.env[k] === undefined) process.env[k] = v;
  return file;
}

// Hilfen zum Auslesen
const str = (k, d = '') => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const num = (k, d) => { const v = str(k, ''); return v === '' || isNaN(Number(v)) ? d : Number(v); };
const bool = (k, d) => { const v = str(k, '').toLowerCase(); return v === '' ? d : ['1', 'true', 'yes', 'ja', 'on'].includes(v); };
const has = k => process.env[k] !== undefined && process.env[k] !== '';

module.exports = { load, parse, str, num, bool, has };
