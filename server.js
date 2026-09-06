// FORM Lab — local server. Reads the XIAO over USB, streams to the browser, records sessions to CSV.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const PORT = 4000;
const SESSIONS = path.join(__dirname, 'sessions');
const PUBLIC = path.join(__dirname, 'public');
fs.mkdirSync(SESSIONS, { recursive: true });

let serial = null, serialPath = null, clients = new Set();
let recording = null; // { name, file, rows, startedAt }
let lastSample = null;

function broadcast(obj) {
  const msg = `data: ${JSON.stringify(obj)}\n\n`;
  for (const res of clients) res.write(msg);
}

async function findPort() {
  const ports = await SerialPort.list();
  const p = ports.find(p => /usbmodem/.test(p.path) && (p.vendorId || '').toLowerCase() === '2886');
  return p ? p.path : null;
}

async function connectLoop() {
  if (!serial) {
    const p = await findPort().catch(() => null);
    if (p) {
      try {
        serial = new SerialPort({ path: p, baudRate: 115200 });
        serialPath = p;
        serial.on('open', () => { serial.set({ dtr: true, rts: true }, () => {}); broadcast({ type: 'status', connected: true, port: p }); console.log('connected', p); });
        const parser = serial.pipe(new ReadlineParser({ delimiter: '\n' }));
        parser.on('data', onLine);
        serial.on('close', () => { serial = null; serialPath = null; broadcast({ type: 'status', connected: false }); });
        serial.on('error', e => { console.log('serial error', e.message); try { serial.close(); } catch {} serial = null; serialPath = null; });
      } catch (e) { console.log('open failed', e.message); serial = null; }
    }
  }
  setTimeout(connectLoop, 1500);
}

function onLine(line) {
  const parts = line.trim().split(',');
  if ((parts.length !== 4 && parts.length !== 10) || isNaN(parseInt(parts[0]))) return;
  const n = parts.map(Number);
  const s = { t: n[0], raw: n[1], volts: n[2], ohms: n[3] };
  if (parts.length === 10) Object.assign(s, { ax: n[4], ay: n[5], az: n[6], gx: n[7], gy: n[8], gz: n[9] });
  lastSample = s;
  if (recording) recording.rows.push(s);
  broadcast({ type: 'sample', ...s, recording: recording ? recording.name : null });
}

function stamp() {
  const d = new Date(), z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}${z(d.getMinutes())}`;
}

function startRecording(name, meta) {
  if (recording) return recording.name;
  meta = meta || {};
  const auto = [meta.subject, meta.exercise, meta.placement && meta.placement !== 'right bicep' ? meta.placement : '', meta.load, meta.reps ? 'x' + meta.reps : ''].filter(Boolean).join(' ');
  const safe = (name || auto || 'session').replace(/[^\w\- .]+/g, '').trim() || 'session';
  recording = { name: `${stamp()} ${safe}`, rows: [], startedAt: Date.now(), meta, marks: [] };
  broadcast({ type: 'recording', active: true, name: recording.name });
  return recording.name;
}

function addMark(label) {
  if (!recording) return null;
  const t = recording.rows.length ? (recording.rows[recording.rows.length - 1].t - recording.rows[0].t) / 1000 : 0;
  const m = { t: Math.round(t * 10) / 10, label: String(label || 'mark').slice(0, 60) };
  recording.marks.push(m); broadcast({ type: 'mark', ...m }); return m;
}

function metaPath(name) { return path.join(SESSIONS, `${name}.json`); }
function readMeta(name) { try { return JSON.parse(fs.readFileSync(metaPath(name), 'utf8')); } catch { return { meta: {}, marks: [] }; } }
function writeMeta(name, obj) { fs.writeFileSync(metaPath(name), JSON.stringify(obj, null, 2)); }

function stopRecording() {
  if (!recording) return null;
  const r = recording; recording = null;
  const file = path.join(SESSIONS, `${r.name}.csv`);
  const imu = r.rows.some(s => s.ax !== undefined);
  const head = imu ? 't_ms,raw,volts,ohms,ax,ay,az,gx,gy,gz' : 't_ms,raw,volts,ohms';
  const body = head + '\n' + r.rows.map(s => imu ? `${s.t},${s.raw},${s.volts},${s.ohms},${s.ax ?? 0},${s.ay ?? 0},${s.az ?? 0},${s.gx ?? 0},${s.gy ?? 0},${s.gz ?? 0}` : `${s.t},${s.raw},${s.volts},${s.ohms}`).join('\n');
  fs.writeFileSync(file, body);
  writeMeta(r.name, { meta: r.meta, marks: r.marks, startedAt: new Date(r.startedAt).toISOString(), seconds: r.rows.length ? (r.rows[r.rows.length - 1].t - r.rows[0].t) / 1000 : 0 });
  broadcast({ type: 'recording', active: false, name: r.name, saved: true });
  return r.name;
}

function readSession(name) {
  const file = path.join(SESSIONS, `${name}.csv`);
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').slice(1);
  const rows = lines.map(l => l.split(',').map(Number)).filter(a => (a.length === 4 || a.length === 10) && !isNaN(a[0]));
  const t0 = rows.length ? rows[0][0] : 0;
  return rows.map(a => a.length === 10 ? { t: (a[0] - t0) / 1000, ohms: a[3], ax: a[4], ay: a[5], az: a[6], gx: a[7], gy: a[8], gz: a[9] } : { t: (a[0] - t0) / 1000, ohms: a[3] });
}

function listSessions() {
  return fs.readdirSync(SESSIONS).filter(f => f.endsWith('.csv')).sort().reverse().map(f => {
    const name = f.replace(/\.csv$/, '');
    const rows = readSession(name);
    const m = readMeta(name);
    return { name, samples: rows.length, seconds: rows.length ? Math.round(rows[rows.length - 1].t) : 0, imu: rows.some(r => r.ax !== undefined), meta: m.meta || {}, marks: m.marks || [] };
  });
}

function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify({ type: 'status', connected: !!serial, port: serialPath, recording: recording ? recording.name : null })}\n\n`);
    clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (url.pathname === '/api/status') return json(res, 200, { connected: !!serial, port: serialPath, recording: recording ? recording.name : null, last: lastSample });
  if (url.pathname === '/api/sessions' && req.method === 'GET') return json(res, 200, listSessions());
  if (url.pathname.startsWith('/api/sessions/') && url.pathname.endsWith('/meta')) {
    const name = decodeURIComponent(url.pathname.slice('/api/sessions/'.length, -'/meta'.length));
    if (req.method === 'GET') return json(res, 200, readMeta(name));
    if (req.method === 'PUT') { let body = ''; req.on('data', c => body += c); req.on('end', () => { try { const cur = readMeta(name); const inc = JSON.parse(body || '{}'); writeMeta(name, { ...cur, meta: inc.meta ?? cur.meta, marks: inc.marks ?? cur.marks }); json(res, 200, readMeta(name)); } catch (e) { json(res, 400, { error: e.message }); } }); return; }
  }
  if (url.pathname.startsWith('/api/sessions/') && req.method === 'GET') {
    const name = decodeURIComponent(url.pathname.slice('/api/sessions/'.length));
    const rows = readSession(name); return rows ? json(res, 200, rows) : json(res, 404, { error: 'not found' });
  }
  if (url.pathname.startsWith('/api/sessions/') && req.method === 'DELETE') {
    const name = decodeURIComponent(url.pathname.slice('/api/sessions/'.length));
    const file = path.join(SESSIONS, `${name}.csv`);
    if (fs.existsSync(file)) fs.unlinkSync(file); if (fs.existsSync(metaPath(name))) fs.unlinkSync(metaPath(name)); return json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/record/start' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c); req.on('end', () => { let b = {}; try { b = JSON.parse(body || '{}'); } catch {} json(res, 200, { name: startRecording(b.name, b.meta) }); }); return;
  }
  if (url.pathname === '/api/record/mark' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c); req.on('end', () => { let b = {}; try { b = JSON.parse(body || '{}'); } catch {} json(res, 200, { mark: addMark(b.label) }); }); return;
  }
  if (url.pathname === '/api/record/stop' && req.method === 'POST') return json(res, 200, { name: stopRecording() });
  if (url.pathname.startsWith('/download/')) {
    const name = decodeURIComponent(url.pathname.slice('/download/'.length));
    const file = path.join(SESSIONS, name);
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${name}"` });
    return fs.createReadStream(file).pipe(res);
  }
  const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
  if (file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'text/plain';
    res.writeHead(200, { 'Content-Type': type }); return fs.createReadStream(file).pipe(res);
  }
  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => { console.log(`FORM Lab  http://localhost:${PORT}`); connectLoop(); });
