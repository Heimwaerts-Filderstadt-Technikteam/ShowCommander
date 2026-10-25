// Minimaler ChurchTools-Mock zum lokalen Testen (Port 4010)
// Start: node test/mock-churchtools.js  → in ShowCommander als URL http://localhost:4010 eintragen
const http = require('http');
const PORT = Number(process.env.MOCK_PORT) || 4010;

const start = new Date(); start.setDate(start.getDate() + ((7 - start.getDay()) % 7)); start.setHours(10, 0, 0, 0);
let version = 1;

function agenda() {
  const items = [
    { id: 1, type: 'normal', title: 'Soundcheck & Bandprobe', duration: 1800, isBeforeEvent: true, note: '', responsible: { text: '', persons: [] } },
    { id: 2, type: 'header', title: 'Ankommen', duration: 0, isBeforeEvent: false },
    { id: 3, type: 'normal', title: 'Begrüßung', duration: 180, note: 'Ankündigung <b>Kinderprogramm</b>', responsible: { text: '', persons: [{ person: { title: 'Anna Moderation' }, service: '[Moderation]', accepted: true }] } },
    { id: 4, type: 'song', title: 'Lobpreis', duration: 300, song: { title: 'Großer Gott wir loben dich', arrangement: 'Standard', key: 'F' }, responsible: { persons: [{ person: { title: 'Lobpreisteam' }, service: 'Band', accepted: true }] } },
    { id: 5, type: 'song', title: 'Lobpreis', duration: 240, song: { title: 'Way Maker', arrangement: 'Kurz', key: 'E' }, responsible: { persons: [] } },
    { id: 6, type: 'header', title: 'Wort', duration: 0 },
    { id: 7, type: 'normal', title: 'Predigt', duration: version > 1 ? 2100 : 1800, note: 'Thema: Hoffnung', responsible: { persons: [{ person: { title: 'Pastor Max' }, service: 'Predigt', accepted: true }] } },
    { id: 8, type: 'normal', title: 'Gebet', duration: 180, responsible: { persons: [] } },
  ];
  if (version > 1) items.push({ id: 9, type: 'normal', title: 'Segen', duration: 60, responsible: { persons: [] } });
  let t = start.getTime() - 1800000;
  for (const it of items) { it.start = new Date(t).toISOString(); t += it.duration * 1000; it.note ??= ''; it.responsible ??= { persons: [] }; }
  return { id: 77, name: 'Gottesdienst', isFinal: version > 1, meta: { modifiedDate: new Date().toISOString() }, items };
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.headers.authorization !== 'Login testtoken') return json(401, { message: 'Session expired!' });
  if (url.pathname === '/api/whoami') return json(200, { data: { firstName: 'Test', lastName: 'Benutzer' } });
  if (url.pathname === '/api/events') return json(200, { data: [
    { id: 42, name: 'Gottesdienst', startDate: start.toISOString(), endDate: new Date(start.getTime() + 5400000).toISOString(), calendar: { title: 'Gottesdienste' } },
  ], meta: { pagination: { lastPage: 1 } } });
  if (url.pathname === '/api/events/42') return json(200, { data: { id: 42, name: 'Gottesdienst', startDate: start.toISOString() } });
  if (url.pathname === '/api/events/42/agenda') return json(200, { data: agenda() });
  if (url.pathname === '/__bump') { version++; return json(200, { version }); }
  json(404, { message: 'not found' });
}).listen(PORT, () => console.log('ChurchTools-Mock auf http://localhost:' + PORT + ' (Token: testtoken)'));
