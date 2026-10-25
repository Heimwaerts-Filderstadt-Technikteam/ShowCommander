// Datei-Import ohne Abhängigkeiten: zerlegt DOCX, ODT, XLSX, CSV und TXT in Zeilen mit Zellen.
// PDF wird im Browser (pdf.js) in Zeilen zerlegt und kommt bereits als rows hier an.
// Ergebnis: { source, rows: [{ cells: string[], heading?: boolean }] }
const zlib = require('zlib');

// ---------- ZIP lesen (für DOCX/XLSX/ODT) ----------
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Keine gültige ZIP-Datei (DOCX/XLSX/ODT erwartet)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    files[name] = () => {
      const lnl = buf.readUInt16LE(local + 26), lel = buf.readUInt16LE(local + 28);
      const data = buf.slice(local + 30 + lnl + lel, local + 30 + lnl + lel + csize);
      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data);
      throw new Error('Nicht unterstützte ZIP-Kompression');
    };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeXml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e] ?? m;
  });
}

/**
 * Generischer Walker für Word-artige XML-Dokumente.
 * tags: { para, heading?, text[], tab, br, table, row, cell, styleAttr? }
 */
function walkDoc(xml, t) {
  const rows = [];
  let tableDepth = 0, row = null, cell = null, para = null, isHeading = false;
  const re = /<(\/?)([\w:.-]+)((?:\s[^>]*?)?)(\/?)>|([^<]+)/g;
  let m, textOpen = 0;
  const pushPara = () => {
    const txt = (para || '').replace(/[  ]+/g, ' ').trim();
    if (tableDepth > 0 && cell !== null) cell += (cell ? '\n' : '') + txt;
    else if (txt) rows.push({ cells: txt.split('\t').map(x => x.trim()), heading: isHeading });
    para = null; isHeading = false;
  };
  while ((m = re.exec(xml))) {
    const [, close, name, attrs, selfClose, text] = m;
    if (text !== undefined) { if (textOpen && para !== null) para += decodeXml(text); continue; }
    if (t.text.includes(name)) { if (close) textOpen--; else if (!selfClose) textOpen++; continue; }
    if (name === t.tab && !close) { if (para !== null) para += '\t'; continue; }
    if (name === t.br && !close) { if (para !== null) para += ' '; continue; }
    if (name === t.para || name === t.heading) {
      if (!close) {
        para = '';
        if (name === t.heading) isHeading = true;
        if (selfClose) pushPara();
      } else pushPara();
      continue;
    }
    if (t.styleTag && name === t.styleTag && !close && para !== null) {
      const v = (/\bw:val="([^"]+)"/.exec(attrs) || [])[1] || '';
      if (/heading|berschrift|title|titel/i.test(v)) isHeading = true;
      continue;
    }
    if (name === t.table) { tableDepth += close ? -1 : 1; continue; }
    if (name === t.row && tableDepth === 1) { if (!close) row = []; else { if (row && row.some(c => c)) rows.push({ cells: row }); row = null; } continue; }
    if (name === t.cell && tableDepth === 1) { if (!close) cell = ''; else { if (row) row.push(cell.trim()); cell = null; } continue; }
  }
  return rows;
}

function docx(buf) {
  const files = unzip(buf);
  if (!files['word/document.xml']) throw new Error('Das ist keine Word-Datei (word/document.xml fehlt)');
  const xml = files['word/document.xml']().toString('utf8');
  return walkDoc(xml, { para: 'w:p', text: ['w:t'], tab: 'w:tab', br: 'w:br', table: 'w:tbl', row: 'w:tr', cell: 'w:tc', styleTag: 'w:pStyle' });
}

function odt(buf) {
  const files = unzip(buf);
  if (!files['content.xml']) throw new Error('Das ist keine ODT-Datei');
  let xml = files['content.xml']().toString('utf8');
  // Text liegt in ODT direkt im <text:p>, nicht in eigenen Text-Tags
  xml = xml.replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, c) => ' '.repeat(Number(c || 1)));
  return walkDoc(xml.replace(/<(text:p|text:h)(\s[^>]*)?>/g, '<$1$2><x:t>').replace(/<\/(text:p|text:h)>/g, '</x:t></$1>'),
    { para: 'text:p', heading: 'text:h', text: ['x:t'], tab: 'text:tab', br: 'text:line-break', table: 'table:table', row: 'table:table-row', cell: 'table:table-cell' });
}

function excelTime(v) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0 || n >= 1) return v;
  const total = Math.round(n * 86400);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return s ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${h}:${String(m).padStart(2, '0')}`;
}

function xlsx(buf) {
  const files = unzip(buf);
  const shared = [];
  if (files['xl/sharedStrings.xml']) {
    const x = files['xl/sharedStrings.xml']().toString('utf8');
    for (const si of x.match(/<si>[\s\S]*?<\/si>/g) || []) {
      shared.push(decodeXml((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('')));
    }
  }
  const sheetName = Object.keys(files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheetName) throw new Error('Keine Tabelle in der Excel-Datei gefunden');
  const x = files[sheetName]().toString('utf8');
  const rows = [];
  for (const r of x.match(/<row[^>]*>[\s\S]*?<\/row>|<row[^>]*\/>/g) || []) {
    const cells = [];
    for (const c of r.match(/<c\s[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
      const ref = (/\br="([A-Z]+)\d+"/.exec(c) || [])[1] || '';
      const col = ref.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const type = (/\bt="(\w+)"/.exec(c) || [])[1];
      let v = (/<v>([\s\S]*?)<\/v>/.exec(c) || [])[1];
      if (type === 's') v = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') v = decodeXml(((/<t[^>]*>([\s\S]*?)<\/t>/.exec(c)) || [])[1] || '');
      else if (v !== undefined) v = excelTime(decodeXml(v));
      if (col >= 0) cells[col] = String(v ?? '').trim();
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
    if (cells.some(Boolean)) rows.push({ cells });
  }
  return rows;
}

function csv(text) {
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const delim = [';', '\t', ','].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur.trim()); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur.trim()); cur = '';
      if (row.some(Boolean)) rows.push({ cells: row });
      row = [];
    } else cur += ch;
  }
  row.push(cur.trim());
  if (row.some(Boolean)) rows.push({ cells: row });
  return rows;
}

function plain(text) {
  return text.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim())
    .map(l => ({ cells: l.split('\t').map(c => c.trim()).filter((c, i, a) => c || i < a.length - 1) }));
}

async function extract({ filename = '', data, text, rows }) {
  if (Array.isArray(rows)) return { source: 'pdf', rows: rows.slice(0, 3000) };
  if (typeof text === 'string') return { source: 'text', rows: plain(text) };
  if (!data) throw new Error('Keine Datei übermittelt');
  const buf = Buffer.from(data, 'base64');
  const ext = (filename.split('.').pop() || '').toLowerCase();
  let out;
  if (ext === 'docx') out = docx(buf);
  else if (ext === 'odt') out = odt(buf);
  else if (ext === 'xlsx' || ext === 'xlsm') out = xlsx(buf);
  else if (ext === 'csv') out = csv(buf.toString('utf8').replace(/^﻿/, ''));
  else if (ext === 'txt' || ext === 'md') out = plain(buf.toString('utf8').replace(/^﻿/, ''));
  else if (ext === 'doc' || ext === 'xls') throw new Error('Alte Office-Formate (.doc/.xls) bitte zuerst als .docx/.xlsx oder PDF speichern.');
  else throw new Error(`Dateiformat .${ext} wird nicht unterstützt (PDF, DOCX, ODT, XLSX, CSV, TXT)`);
  return { source: ext, rows: out.slice(0, 3000) };
}

module.exports = { extract, unzip, docx, xlsx, csv, plain, odt };
