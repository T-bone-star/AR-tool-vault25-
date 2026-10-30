'use strict';
// Clienttest: de echte telefooncode (net, world, interact) tegen de echte server,
// met echte three.js en een nagemaakte A-Frame/DOM. Draaien: node test/client.test.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const vm = require('vm');
const THREE = require('three');
const WebSocket = require('ws');

const WWW = path.join(__dirname, '..', '..', 'www');
const PORT = 19000 + Math.floor(Math.random() * 1000);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'v25c-'));
const base = JSON.parse(JSON.stringify(require('../config')));
base.fields.forEach(f => { f.growSeconds = 2; });
base.wildlife.firstSpawnSeconds = 0.5;
base.wildlife.types.forEach(t => { t.hitChance = 1; t.skittishRange = 0; t.speed = 0.01; });
base.behavior.maxShotRange = 1e6;
base.species.kip.products = { ei: 0.01, veren: 0.01 };   // in de test meteen klaar
const CFGFILE = path.join(os.tmpdir(), `v25c-cfg-${process.pid}.json`);
fs.writeFileSync(CFGFILE, JSON.stringify(base));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✓' : '✗'} ${name} ${extra}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------ nagemaakte browser + A-Frame
function makeBrowser(playerId, name, codes) {
  const listeners = {}, events = [], store = { 'v25-id': playerId, 'v25-name': name, 'v25-server': `127.0.0.1:${PORT}`, 'v25-codes': codes };
  const COMPONENTS = {}, SYSTEMS = {};
  let scene = null;
  const isIn = (el, root) => { while (el) { if (el === root) return true; el = el.parentNode; } return false; };
  function initTree(el) {
    for (const n in el.components) { const c = el.components[n]; if (!c._inited) { c._inited = true; c.init && c.init(); } }
    el.children.forEach(initTree);
  }
  function removeTree(el) { for (const n in el.components) { const c = el.components[n]; c.remove && c.remove(); } el.children.forEach(removeTree); }
  function makeEl(tag) {
    const el = {
      tagName: tag, attrs: {}, children: [], parentNode: null, components: {}, object3D: new THREE.Object3D(),
      sceneEl: null,
      setAttribute(k, v) {
        this.attrs[k] = v;
        if (k === 'position' && typeof v === 'string') { const [x, y, z] = v.split(' ').map(Number); this.object3D.position.set(x, y, z); }
        if (k === 'scale' && typeof v === 'string') this.object3D.scale.setScalar(Number(v.split(' ')[0]));
        if (k === 'rotation' && typeof v === 'string') { const [x, y, z] = v.split(' ').map(Number).map(THREE.MathUtils.degToRad); this.object3D.rotation.set(x, y, z); }
        if (COMPONENTS[k]) {
          const def = COMPONENTS[k], c = Object.create(def);
          c.el = this;
          const d = {};
          for (const s in (def.schema || {})) d[s] = def.schema[s].default;
          if (typeof v === 'object') Object.assign(d, v);
          c.data = d;
          this.components[k] = c;
          if (scene && isIn(this, scene)) { c._inited = true; c.init && c.init(); }
        }
      },
      appendChild(c) { c.parentNode = this; this.children.push(c); this.object3D.add(c.object3D); if (scene && isIn(this, scene)) initTree(c); return c; },
      removeChild(c) { this.children = this.children.filter(x => x !== c); this.object3D.remove(c.object3D); removeTree(c); },
      emit(n, detail) { ctx.document.dispatchEvent({ type: n, detail }); },
      addEventListener() {},
    };
    return el;
  }
  const camEl = makeEl('a-camera');
  const ctx = {
    console, Math, JSON, Object, Array, String, Number, Promise, Date, Map, Set, setTimeout, clearTimeout,
    THREE, WebSocket,
    CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; },
    performance: { now: () => Date.now() },
    location: { host: 'localhost', hostname: 'localhost', port: '', search: '' },
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    AFRAME: { registerComponent(n, d) { COMPONENTS[n] = d; }, registerSystem(n, d) { SYSTEMS[n] = d; } },
    document: {
      readyState: 'complete',
      createElement(t) {
        if (t === 'canvas') return { width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) };
        const e = makeEl(t); e.sceneEl = scene; return e;
      },
      querySelector(sel) { return sel === '[camera]' ? camEl : scene; },
      getElementById: () => null,
      addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); },
      removeEventListener(n, f) { listeners[n] = (listeners[n] || []).filter(x => x !== f); },
      dispatchEvent(e) { events.push(e); (listeners[e.type] || []).forEach(f => f(e)); },
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['utils', 'config', 'net', 'models', 'world', 'interact']) {
    vm.runInContext(fs.readFileSync(path.join(WWW, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
  }
  // THREE.Sprite e.d. zijn echt; CanvasTexture met nep-canvas is prima voor de test.
  const b = {
    ctx, events, camEl,
    get net() { return ctx.V25.net; },
    buildScene() {
      scene = makeEl('a-scene');
      scene.sceneEl = scene; scene.systems = {};
      for (const n in SYSTEMS) { const s = Object.create(SYSTEMS[n]); s.el = scene; scene.systems[n] = s; }
      for (const n in SYSTEMS) scene.systems[n].init && scene.systems[n].init();
      camEl.sceneEl = scene;
      scene.appendChild(camEl);
      const farm = ctx.document.createElement('a-entity');
      farm.setAttribute('farm-builder', '');
      scene.appendChild(farm);
      b.scene = scene; b.farm = farm; b.sys = scene.systems.farm; b.inter = scene.systems.interact;
    },
    tick(ms = 50) {
      scene.object3D.updateMatrixWorld(true);
      for (const n in scene.systems) scene.systems[n].tick && scene.systems[n].tick(Date.now(), ms);
      const all = (el, out = []) => { for (const n in el.components) out.push(el.components[n]); el.children.forEach(c => all(c, out)); return out; };
      for (const c of all(scene)) c.tick && c.tick(Date.now(), ms);
    },
    async run(ms) { const end = Date.now() + ms; while (Date.now() < end) { b.tick(50); await sleep(50); } },
    setCam(x, y, z) { camEl.object3D.position.set(x, y, z); scene.object3D.updateMatrixWorld(true); },
    lookAt(x, y, z) { camEl.object3D.lookAt(new THREE.Vector3(x, y, z)); camEl.object3D.rotateY(Math.PI); scene.object3D.updateMatrixWorld(true); },
    last(type) { return events.filter(e => e.type === type).at(-1); },
    all(type) { return events.filter(e => e.type === type); },
  };
  return b;
}

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), V25_DATA: DATA, V25_CONFIG: CFGFILE }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 50 && !log.includes('draait'); i++) await sleep(100);

  try {
    const piet = makeBrowser('c-piet', 'Piet', base.roles.boer.code);
    const kees = makeBrowser('c-kees', 'Kees', '');
    piet.net.connect(); kees.net.connect();
    for (let i = 0; i < 40 && !(piet.net.layout && kees.net.layout); i++) await sleep(50);
    check('telefooncode verbindt en krijgt layout', !!piet.net.layout && piet.net.state === 'online');
    check('rolcode ingewisseld bij verbinden', piet.net.me && piet.net.me.roles.includes('boer'));
    check('code niet bewaard na inwisselen', !piet.ctx.localStorage.getItem('v25-codes'));

    piet.buildScene(); kees.buildScene();
    piet.setCam(0, 1.6, 14); kees.setCam(3, 1.6, 14);
    piet.lookAt(0, 0, 0); kees.lookAt(0, 0, 0);
    await Promise.all([piet.run(1500), kees.run(1500)]);
    check('hek + akkers gebouwd uit server-layout', piet.sys.fields.length === base.fields.length);
    const herd = base.pens.filter(p => p.active).reduce((n, p) => n + Object.values(p.start || {}).reduce((a, b) => a + b, 0), 0);
    check('vee getekend uit snapshots', piet.sys.animals.size === herd, `(${piet.sys.animals.size} van ${herd})`);
    check('gebouwde hokken zichtbaar, niet-gebouwde verborgen', piet.farm.components['farm-builder'].penGroups.paddock.el.object3D.visible && !piet.farm.components['farm-builder'].penGroups.hertenkamp.el.object3D.visible);
    check('andere speler zichtbaar als figuur', piet.sys.avatars.size === 1 && kees.sys.avatars.size === 1);
    const av = [...piet.sys.avatars.values()][0];
    check('figuur staat op de plek van de ander', Math.abs(av.object3D.position.x - 3) < 0.6, av.object3D.position.x.toFixed(2));

    // Akkers rijp + oogsten via de echte knoplogica
    await Promise.all([piet.run(2500), kees.run(2500)]);
    const f0 = piet.sys.fields[0];
    check('akker groeit mee met de server', f0.stage === 2, `stage ${f0.stage} p=${f0.progress}`);
    kees.lookAt(f0.cfg.x, 0, f0.cfg.z); await kees.run(200);
    check('niet-boer ziet slot op de knop', kees.inter.aim && kees.inter.aim.kind === 'oogst' && kees.inter.aim.locked);
    kees.inter.doAction(); await kees.run(300);
    check('niet-boer drukt: niets verstuurd, uitleg getoond', !(kees.net.me.inv[f0.cfg.crop]) && /kan oogsten/.test((kees.last('action-info') || {}).detail?.msg || ''));
    piet.lookAt(f0.cfg.x, 0, f0.cfg.z); await piet.run(200);
    check('boer ziet OOGST', piet.inter.aim && piet.inter.aim.kind === 'oogst' && !piet.inter.aim.locked);
    piet.inter.doAction(); await Promise.all([piet.run(500), kees.run(500)]);
    check('oogst in de tas van de boer', (piet.net.me.inv[f0.cfg.crop] || 0) === f0.cfg.yield, JSON.stringify(piet.net.me.inv));
    check('Kees ziet in de nieuwsregel dat Piet oogstte', kees.all('net-event').some(e => /Piet oogstte/.test(e.detail.text)));
    await piet.run(300);
    check('akker na oogst weer jong op beide telefoons', piet.sys.fields[0].stage === 0 && kees.sys.fields[0].stage === 0);

    // Jagen: Kees (geen jager) schiet raak maar krijgt niets
    for (let i = 0; i < 40 && kees.sys.critters.size === 0; i++) await kees.run(100);
    const [cid, cel] = [...kees.sys.critters.entries()][0] || [];
    check('wild getekend', !!cel);
    if (cel) {
      const p = cel.object3D.position, cv = cel.components['critter-view'];
      kees.setCam(p.x + 3, 1.6, p.z + 3); kees.lookAt(p.x, cv.aimHeight, p.z);
      await kees.run(250);
      check('vizier op wild = VUUR met "geen buit"', kees.inter.aim && kees.inter.aim.kind === 'jacht' && /geen buit/.test(kees.inter.aim.label), kees.inter.aim && kees.inter.aim.label);
      kees.inter.doAction(); await Promise.all([kees.run(600), piet.run(600)]);
      check('beest neer op beide telefoons', (kees.sys.critters.get(cid)?.__net?.d === 1) && (piet.sys.critters.get(cid)?.__net?.d === 1));
      check('Kees kreeg geen vlees', !kees.net.me.inv.vlees && kees.all('net-msg').some(e => /zonder jagerskennis/.test(e.detail.text)));
      check('Piet hoorde/zag het schot', piet.all('net-shot').some(e => e.detail.by === 'c-kees'));
    }

    // Hek-staat: GM zet paddock op kapot -> touwen verdwijnen op de telefoon
    const gmws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await new Promise(r => gmws.on('open', r));
    gmws.send(JSON.stringify({ t: 'gm-auth', pw: base.gmPassword }));
    await sleep(200);
    const fbc = piet.farm.components['farm-builder'];
    const segs = fbc.penGroups.paddock.segs;
    const total = segs.length;
    const visible = () => segs.filter(r => r.object3D.visible).length;
    check('hek heel bij start', visible() === total, `${visible()}/${total}`);
    gmws.send(JSON.stringify({ t: 'gm', op: 'condition', pen: 'paddock', condition: 'kapot' }));
    await piet.run(500);
    check('GM "kapot" -> hek op de telefoon vol gaten', visible() < total * 0.5 && visible() > 0, `${visible()}/${total}`);
    check('speler krijgt melding over het hek', piet.all('net-event').some(e => e.detail.kind === 'paddock' && /brahmin-paddock is kapot/i.test(e.detail.text)));
    gmws.send(JSON.stringify({ t: 'gm', op: 'condition', pen: 'paddock', condition: 'goed' }));
    await piet.run(500);
    check('GM "goed" -> hek weer heel', visible() === total);
    // Hok bouwen via GM: konijnenren verschijnt op de telefoon
    gmws.send(JSON.stringify({ t: 'gm', op: 'pen', pen: 'konijnen', on: true }));
    gmws.send(JSON.stringify({ t: 'gm', op: 'add', pen: 'konijnen', species: 'konijn' }));
    await piet.run(500);
    check('GM bouwt konijnenren -> zichtbaar met konijn', fbc.penGroups.konijnen.el.object3D.visible && [...piet.sys.animals.values()].some(e => e.__net.type === 'konijn'));

    // Verzorgen: kip in het kippenhok
    const kipEl = [...piet.sys.animals.values()].find(e => e.__net.type === 'kip' && e.__net.m);
    check('kip met klaarliggende eieren', !!kipEl, kipEl ? JSON.stringify(kipEl.__net.m) : '');
    if (kipEl) {
      const kp = kipEl.object3D.position, kc = kipEl.components['herd-animal'];
      piet.setCam(kp.x, 1.6, kp.z + 3); piet.lookAt(kp.x, kc.aimHeight, kp.z);
      await piet.run(250);
      check('zonder veeboer-rol: slot op ZORG', piet.inter.aim && piet.inter.aim.kind === 'verzorg' && piet.inter.aim.locked && /Veeboer 1\+/.test(piet.inter.aim.label), piet.inter.aim && piet.inter.aim.label);
      gmws.send(JSON.stringify({ t: 'gm', op: 'role', pid: 'c-piet', role: 'vee1', on: true }));
      await piet.run(400);
      piet.inter.key = ''; await piet.run(200);
      check('met Veeboer 1: ZORG zonder slot', piet.inter.aim && piet.inter.aim.kind === 'verzorg' && !piet.inter.aim.locked, piet.inter.aim && piet.inter.aim.label);
      piet.inter.doAction(); await piet.run(500);
      check('eieren in de tas', (piet.net.me.inv.ei || 0) >= 1, JSON.stringify(piet.net.me.inv));
    }
    gmws.close();

    // Inleveren via de telefoon
    piet.net.send({ t: 'turnin' }); await piet.run(400);
    const ti = piet.last('net-turnin');
    check('inlevercode op de telefoon', ti && /^[A-Z0-9]{4}$/.test(ti.detail.code), ti && ti.detail.code);

    // Verbinding kwijt -> automatisch opnieuw
    piet.net.ws.close();
    await piet.run(300);
    check('verbinding kwijt wordt gemeld', piet.all('net-status').some(e => e.detail.state === 'offline'));
    for (let i = 0; i < 40 && piet.net.state !== 'online'; i++) await piet.run(100);
    check('automatisch opnieuw verbonden, rol behouden', piet.net.state === 'online' && piet.net.me.roles.includes('boer'));
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
