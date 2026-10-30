'use strict';
/*
 * Vault 25 Brahmin Paddock — server voor de GM-laptop.
 *
 *   cd server && npm install && npm start
 *
 * - Serveert de webapp (../www) voor browsers en het GM-scherm (/gm.html).
 * - WebSocket op /ws: telefoons verbinden hier; de wereld draait hier.
 * - Slaat spelers, rollen, tassen en inleveringen op in data/save.json.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const { World } = require('./sim');
const cfg = require(process.env.V25_CONFIG || './config');

const WWW = path.join(__dirname, '..', 'www');
const DATA = process.env.V25_DATA || path.join(__dirname, 'data');
const SAVE = path.join(DATA, 'save.json');
const TICK = 0.05;          // 20x per seconde rekenen
const SNAP_MS = 100;        // 10x per seconde wereld versturen

// ------------------------------------------------------------- opslag
let saved = {};
try { saved = JSON.parse(fs.readFileSync(SAVE, 'utf8')); } catch (e) { /* eerste start */ }
function save() {
  try {
    fs.mkdirSync(DATA, { recursive: true });
    const tmp = SAVE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(world.toJSON(), null, 1));
    fs.renameSync(tmp, SAVE);   // atomair: nooit een half bestand bij stroomuitval
  } catch (e) { console.error('Opslaan mislukt:', e.message); }
}

// ------------------------------------------------------------- wereld
const conns = new Set();   // { ws, pid, gm }
function send(c, msg) { if (c.ws.readyState === 1) c.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }
const world = new World(cfg, saved, (to, msg) => {
  const s = JSON.stringify(msg);
  for (const c of conns) {
    if (to === 'all' ? (c.pid || c.gm) : to === 'gm' ? c.gm : c.pid === to) send(c, s);
  }
});

setInterval(() => world.tick(TICK), TICK * 1000);
setInterval(() => {
  const s = JSON.stringify(world.snapshot());
  for (const c of conns) if (c.pid || c.gm) send(c, s);
}, SNAP_MS);
setInterval(() => {
  if (world.dirty) {
    world.dirty = false;
    const s = JSON.stringify(world.gmState());
    for (const c of conns) if (c.gm) send(c, s);
  }
  if (world.saveNeeded) { world.saveNeeded = false; save(); }
}, 1000);

// ------------------------------------------------------------- http
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  // CORS: de Android-app (origin http://localhost) mag de ping lezen
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, name: 'vault25-paddock', players: [...world.players.values()].filter(p => p.online).length }));
    return;
  }
  const file = path.normalize(path.join(WWW, url === '/' ? 'index.html' : url));
  if (!file.startsWith(WWW)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('Niet gevonden'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

// ------------------------------------------------------------- websocket
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
wss.on('connection', (ws) => {
  const c = { ws, pid: null, gm: false, alive: true };
  conns.add(c);
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'join': {
        const p = world.join(m.id, m.name, Array.isArray(m.codes) ? m.codes.slice(0, 5) : []);
        if (!p) return;
        // Zelfde speler op een tweede tab/telefoon: de oude verbinding sluiten
        for (const o of conns) if (o !== c && o.pid === p.id) { o.pid = null; o.ws.close(4000, 'elders ingelogd'); }
        c.pid = p.id;
        send(c, { t: 'hello', layout: world.layout() });
        world.sendMe(p);
        send(c, world.snapshot());
        console.log(`+ ${p.name} (${[...p.roles].join(', ') || 'geen rol'})`);
        break;
      }
      case 'pose': if (c.pid) world.setPose(c.pid, m); break;
      case 'act': if (c.pid) world.act(c.pid, m.kind, m.target); break;
      case 'code': if (c.pid) world.redeem(c.pid, m.code); break;
      case 'turnin': if (c.pid) world.turnIn(c.pid); break;
      case 'gm-auth':
        if (m.pw === cfg.gmPassword) {
          c.gm = true;
          send(c, { t: 'gm-ok', layout: world.layout() });
          send(c, world.gmState());
        } else {
          send(c, { t: 'gm-denied' });
        }
        break;
      case 'gm': {
        if (!c.gm) return;
        if (m.op === 'resolve') world.gmResolve(String(m.code), !!m.approve);
        if (m.op === 'role') world.gmSetRole(String(m.pid), String(m.role), !!m.on);
        if (m.op === 'reset') world.gmResetWorld();
        if (m.op === 'say' && m.text) world.event('gm', String(m.text).slice(0, 140));
        world.dirty = true;
        break;
      }
    }
  });
  ws.on('close', () => {
    conns.delete(c);
    if (c.pid && ![...conns].some(o => o.pid === c.pid)) {
      const p = world.players.get(c.pid);
      world.leave(c.pid);
      if (p) console.log(`- ${p.name}`);
    }
  });
});

// Dode verbindingen opruimen (telefoon in slaap, wifi weg)
setInterval(() => {
  for (const c of conns) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false;
    try { c.ws.ping(); } catch (e) { /* al dicht */ }
  }
}, 10000);

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
}

const PORT = Number(process.env.PORT) || cfg.port;
server.listen(PORT, () => {
  console.log('\n  VAULT 25 — BRAHMIN PADDOCK server draait\n');
  const ips = lanAddresses();
  if (!ips.length) console.log('  (geen netwerk gevonden — alleen http://localhost:' + PORT + ')');
  for (const ip of ips) {
    console.log(`  Spelers (app):  serveradres ${ip}:${PORT}`);
    console.log(`  GM-scherm:      http://${ip}:${PORT}/gm.html`);
  }
  console.log(`  Lokaal testen:  http://localhost:${PORT}/  (simulatie)\n`);
  if (cfg.gmPassword === 'verander-mij') console.log('  ⚠ Verander gmPassword en de rolcodes in server/config.js!\n');
});

process.on('SIGINT', () => { save(); process.exit(0); });
process.on('SIGTERM', () => { save(); process.exit(0); });
