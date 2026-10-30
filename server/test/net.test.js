'use strict';
// Netwerktest: echte server, echte WebSockets, meerdere "telefoons" + GM.
// Draaien: node server/test/net.test.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const WebSocket = require('ws');
// Testconfig: snelle akkers, zodat de test niet minuten hoeft te wachten
const base = JSON.parse(JSON.stringify(require('../config')));
base.fields.forEach(f => { f.growSeconds = 3; });
const CFGFILE = path.join(os.tmpdir(), `v25-cfg-${process.pid}.json`);
fs.writeFileSync(CFGFILE, JSON.stringify(base));
const cfg = base;

const PORT = 18000 + Math.floor(Math.random() * 1000);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'v25-'));
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✓' : '✗'} ${name} ${extra}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function get(p) {
  return new Promise((res) => http.get({ host: '127.0.0.1', port: PORT, path: p }, (r) => {
    let b = ''; r.on('data', d => b += d); r.on('end', () => res({ status: r.statusCode, body: b, type: r.headers['content-type'] }));
  }).on('error', () => res({ status: 0 })));
}

function client(id, name, codes = []) {
  const c = { id, msgs: [], snaps: 0, last: null, me: null, layout: null };
  c.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  c.ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    c.msgs.push(m);
    if (m.t === 'snap') { c.snaps++; c.last = m; }
    if (m.t === 'me') c.me = m;
    if (m.t === 'hello') c.layout = m.layout;
  });
  c.open = new Promise(r => c.ws.on('open', r));
  c.send = (m) => c.ws.send(JSON.stringify(m));
  c.join = async () => { await c.open; c.send({ t: 'join', id, name, codes }); await sleep(300); };
  c.pose = (x, z, tx, ty, tz, y = 1.6) => c.send({ t: 'pose', x, y, z, dx: tx - x, dy: ty - y, dz: tz - z });
  c.texts = () => c.msgs.filter(m => m.t === 'msg').map(m => m.text);
  return c;
}

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), V25_DATA: DATA, V25_CONFIG: CFGFILE }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 50 && !log.includes('draait'); i++) await sleep(100);
  check('server start', log.includes('draait'));

  try {
    // --- statische bestanden (voor browser en GM)
    const idx = await get('/');
    check('startscherm wordt geserveerd', idx.status === 200 && idx.body.includes('BRAHMIN PADDOCK'));
    const af = await get('/vendor/aframe.min.js');
    check('A-Frame lokaal beschikbaar (geen internet nodig)', af.status === 200 && af.body.length > 1e6);
    check('GM-scherm beschikbaar', (await get('/gm.html')).status === 200);
    check('server.js niet op te vragen (buiten www)', (await get('/../server/config.js')).status !== 200);
    const ping = JSON.parse((await get('/ping')).body);
    check('/ping werkt', ping.ok === true);

    // --- drie telefoons
    const jan = client('n-jan', 'Jan', [cfg.roles.jager.code]);
    const piet = client('n-piet', 'Piet', [cfg.roles.boer.code]);
    const anna = client('n-anna', 'Anna', [cfg.roles.boer.code]);
    await Promise.all([jan.join(), piet.join(), anna.join()]);
    check('iedereen krijgt de layout', !!(jan.layout && piet.layout && anna.layout));
    check('layout bevat geen geheime codes', !JSON.stringify(jan.layout).includes(cfg.roles.jager.code));
    check('rollen via code', jan.me.roles.includes('jager') && piet.me.roles.includes('boer'));
    await sleep(500);
    check('snapshots komen binnen (~10/s)', jan.snaps >= 4, `(${jan.snaps} in ~0,8 s)`);

    // Spelers zien elkaar
    jan.pose(0, 14, 0, 0, 0); piet.pose(-5, 14, -5, 0, 10); anna.pose(5, 14, 5, 0, 10);
    await sleep(400);
    const seen = jan.last.p.map(p => p.name).sort().join(',');
    check('spelers zien elkaars positie', seen === 'Anna,Jan,Piet', seen);

    // --- oogstrace via het netwerk: wacht tot een akker rijp is
    let fi = -1;
    for (let i = 0; i < 300 && fi < 0; i++) { await sleep(100); fi = jan.last.f.findIndex(p => p >= 1); }
    check('akker wordt rijp', fi >= 0);
    const fc = cfg.fields[fi];
    piet.pose(fc.x - 1, fc.z + 4, fc.x, 0, fc.z);
    anna.pose(fc.x + 1, fc.z + 4, fc.x, 0, fc.z);
    jan.pose(fc.x, fc.z + 4, fc.x, 0, fc.z);
    await sleep(300);
    jan.send({ t: 'act', kind: 'harvest', target: fi });     // geen boer
    piet.send({ t: 'act', kind: 'harvest', target: fi });
    anna.send({ t: 'act', kind: 'harvest', target: fi });
    await sleep(400);
    const crop = fc.crop;
    const got = [piet, anna].filter(c => (c.me.inv[crop] || 0) > 0);
    check('jager (geen boer) kan niet oogsten', !(jan.me.inv[crop]) && jan.texts().some(t => /Alleen een boer/.test(t)));
    check('precies één boer krijgt de oogst', got.length === 1, got.map(c => c.id).join(','));
    const ev = jan.msgs.filter(m => m.t === 'event' && m.kind === 'harvest');
    check('andere spelers zien wie oogstte', ev.length === 1 && /oogstte/.test(ev[0].text), ev[0] && ev[0].text);

    // --- schoten zijn zichtbaar
    jan.send({ t: 'act', kind: 'shoot', target: null });
    await sleep(200);
    check('schot van Jan zichtbaar bij Piet', piet.msgs.some(m => m.t === 'shot' && m.by === 'n-jan'));

    // --- inleveren + GM
    const winner = got[0];
    winner.send({ t: 'turnin' });
    await sleep(300);
    const ti = winner.msgs.find(m => m.t === 'turnin');
    check('inleveren geeft code', !!ti && /^[A-Z0-9]{4}$/.test(ti.code), ti && ti.code);
    check('tas daarna leeg', Object.keys(winner.me.inv).length === 0);

    const bad = client('gm-x', ''); await bad.open;
    bad.send({ t: 'gm-auth', pw: 'fout' }); await sleep(200);
    check('GM met fout wachtwoord geweigerd', bad.msgs.some(m => m.t === 'gm-denied'));
    bad.send({ t: 'gm', op: 'reset' }); await sleep(100);

    const gm = client('gm', ''); await gm.open;
    gm.send({ t: 'gm-auth', pw: cfg.gmPassword }); await sleep(1300);
    const gs = gm.msgs.filter(m => m.t === 'gm-state').at(-1);
    check('GM ziet open inlevering', gs && gs.turnins.some(t => t.code === ti.code && t.status === 'open'));
    check('GM ziet spelers met tassen en rollen', gs && gs.players.length === 3 && gs.players.some(p => p.roles.includes('jager')));
    gm.send({ t: 'gm', op: 'resolve', code: ti.code, approve: true });
    await sleep(300);
    check('speler krijgt bericht "uitbetaald"', winner.texts().some(t => t.includes(ti.code) && /uitbetaald/.test(t)));
    gm.send({ t: 'gm', op: 'role', pid: 'n-anna', role: 'jager', on: true });
    await sleep(300);
    check('GM geeft rol, speler merkt het direct', anna.me.roles.includes('jager'));
    gm.send({ t: 'gm', op: 'say', text: 'Stormwaarschuwing!' });
    await sleep(200);
    check('omroepbericht bereikt spelers', jan.msgs.some(m => m.t === 'event' && m.text === 'Stormwaarschuwing!'));

    // --- zelfde speler op tweede telefoon: oude verbinding eruit
    const jan2 = client('n-jan', 'Jan');
    let closed = 0; jan.ws.on('close', (code) => { closed = code; });
    await jan2.join();
    await sleep(200);
    check('tweede apparaat van dezelfde speler neemt het over', closed === 4000 && jan2.me && jan2.me.roles.includes('jager'));

    // --- rommel sturen crasht de server niet
    const junk = client('junk', 'X'); await junk.open;
    junk.ws.send('geen json'); junk.ws.send(JSON.stringify({ t: 'pose', x: 'NaN' })); junk.ws.send(JSON.stringify({ t: 'act', kind: 'harvest', target: 999 }));
    await sleep(200);
    check('server overleeft rommel', (await get('/ping')).status === 200);

    // --- opslag + herstart
    for (const c of [jan2, piet, anna, gm, bad, junk]) c.ws.close();
    await sleep(1500);
    srv.kill('SIGTERM');
    await sleep(500);
    const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'save.json'), 'utf8'));
    check('opgeslagen: spelers + rollen + inlevering', saved.players.length === 3 && saved.turnins.some(t => t.status === 'paid'), JSON.stringify(saved).slice(0, 300));
  } catch (e) {
    console.error(e); fail++;
  } finally {
    srv.kill('SIGKILL');
    fs.rmSync(DATA, { recursive: true, force: true });
    fs.rmSync(CFGFILE, { force: true });
  }
  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
