// Speeltest zonder browser: speelt een complete ronde na (jagen, oogsten,
// melken, uitbraak, terugleiden door de poort, inleveren, kamer-schaal).
// Gebruik:  cd tests && npm install && node speeltest.js

// Headless speeltest: echte three.js, nagemaakte A-Frame/DOM.
const fs = require('fs');
const vm = require('vm');
const THREE = require('three');
const ROOT = process.argv[2] || require('path').join(__dirname, '..');

let fakeNow = 0;
const listeners = {};
const events = [];
const store = {};

function makeEl(tag) {
  const el = {
    tagName: tag, attrs: {}, children: [], parentNode: null, components: {},
    object3D: new THREE.Object3D(),
    setAttribute(k, v) {
      this.attrs[k] = v;
      if (k === 'position' && typeof v === 'string') { const [x, y, z] = v.split(' ').map(Number); this.object3D.position.set(x, y, z); }
      if (k === 'scale' && typeof v === 'string') { const [x] = v.split(' ').map(Number); this.object3D.scale.setScalar(x); }
      if (k === 'rotation' && typeof v === 'string') { const [x, y, z] = v.split(' ').map(Number).map(THREE.MathUtils.degToRad); this.object3D.rotation.set(x, y, z); }
      if (COMPONENTS[k]) attachComponent(this, k, v);
    },
    appendChild(c) { c.parentNode = this; this.children.push(c); this.object3D.add(c.object3D); if (scene && isIn(this, scene)) initTree(c); },
    removeChild(c) { this.children = this.children.filter(x => x !== c); this.object3D.remove(c.object3D); removeTree(c); },
    emit(name, detail) { events.push({ name, detail }); (listeners[name] || []).forEach(f => f({ detail })); },
    addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} },
  };
  return el;
}
function isIn(el, root) { while (el) { if (el === root) return true; el = el.parentNode; } return false; }
const COMPONENTS = {}, SYSTEMS = {};
const pending = [];
function attachComponent(el, name, data) {
  const def = COMPONENTS[name];
  const c = Object.create(def);
  c.el = el;
  const sd = {};
  for (const k in (def.schema || {})) sd[k] = def.schema[k].default;
  if (typeof data === 'object') Object.assign(sd, data);
  c.data = sd;
  el.components[name] = c;
  c._inited = false;
  if (scene && isIn(el, scene)) { c._inited = true; c.init && c.init(); } else pending.push(c);
}
function initTree(el) {
  for (const n in el.components) { const c = el.components[n]; if (!c._inited) { c._inited = true; c.init && c.init(); } }
  el.children.forEach(initTree);
}
function removeTree(el) { for (const n in el.components) { const c = el.components[n]; c.remove && c.remove(); delete el.components[n]; } el.children.forEach(removeTree); }
function allComps(el, out = []) { for (const n in el.components) out.push(el.components[n]); el.children.forEach(ch => allComps(ch, out)); return out; }

let scene = null;
const sceneEl = makeEl('a-scene'); sceneEl.systems = {}; sceneEl.sceneEl = sceneEl;
const camEl = makeEl('a-camera');

const ctx = {
  console, Math, JSON, Object, Array, String, Number, Promise, setTimeout: (f) => f(), clearTimeout() {},
  THREE, CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; },
  performance: { now: () => fakeNow * 1000 },
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  AFRAME: {
    registerComponent(n, d) { COMPONENTS[n] = d; },
    registerSystem(n, d) { SYSTEMS[n] = d; },
  },
  document: {
    readyState: 'complete',
    createElement: makeEl,
    querySelector(sel) { return sel === '[camera]' ? camEl : sceneEl; },
    getElementById: () => null,
    addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); },
    dispatchEvent(e) { events.push({ name: e.type, detail: e.detail }); (listeners[e.type] || []).forEach(f => f(e)); },
  },
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['utils', 'config', 'inventory', 'farm-builder', 'animal', 'wildlife', 'interact']) {
  vm.runInContext(fs.readFileSync(`${ROOT}/js/${f}.js`, 'utf8'), ctx, { filename: f });
}

// Scene opzetten zoals sim-modus
for (const n in SYSTEMS) { const s = Object.create(SYSTEMS[n]); s.el = sceneEl; sceneEl.systems[n] = s; }
for (const n in SYSTEMS) sceneEl.systems[n].init && sceneEl.systems[n].init();
for (const c of [...pending]) c.el.sceneEl = sceneEl;
const proto = makeEl('x'); // zorg dat elk element sceneEl kent
const origCreate = ctx.document.createElement;
ctx.document.createElement = (t) => { const e = origCreate(t); e.sceneEl = sceneEl; return e; };
camEl.sceneEl = sceneEl;
scene = sceneEl;
const farm = ctx.document.createElement('a-entity');
farm.setAttribute('farm-builder', '');
sceneEl.appendChild(camEl);
sceneEl.appendChild(farm);

const sys = sceneEl.systems.farm;
const inter = sceneEl.systems.interact;
const V25 = ctx.V25;

function step(seconds, dt = 0.05) {
  for (let t = 0; t < seconds; t += dt) {
    fakeNow += dt;
    sceneEl.object3D.updateMatrixWorld(true);
    for (const n in sceneEl.systems) sceneEl.systems[n].tick && sceneEl.systems[n].tick(fakeNow * 1000, dt * 1000);
    for (const c of allComps(sceneEl)) c.tick && c.tick(fakeNow * 1000, dt * 1000);
  }
}
function lookAt(x, y, z) {
  camEl.object3D.lookAt(new THREE.Vector3(x, y, z));
  camEl.object3D.rotateY(Math.PI); // entity +z is achterkant; three lookAt richt +z
  sceneEl.object3D.updateMatrixWorld(true);
}
function setCam(x, y, z) { camEl.object3D.position.set(x, y, z); sceneEl.object3D.updateMatrixWorld(true); }

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✓' : '✗'} ${name} ${extra}`); };

// ---------- 0. opbouw
check('vee gespawnd', sys.animals.length === 7, `(${sys.animals.length})`);
check('akkers geregistreerd', sys.fields.length === 3);
check('poort berekend', !!sys.gateMid && sys.gateMid.z === -6);

// ---------- 1. richten op de grond -> blikpunt
setCam(0, 1.6, 14);
lookAt(0, 0, 10);
let g = sys.gazeGround(18);
check('blikpunt op de grond', g.hit && Math.abs(g.z - 10) < 0.05 && Math.abs(g.x) < 0.05, JSON.stringify(g));

// ---------- 2. oogsten
const field = sys.fields[0];
field.plantedAt = fakeNow - 1000; // rijp maken
step(0.3);
lookAt(field.cfg.x, 0, field.cfg.z);
step(0.2);
check('vizier op rijpe akker = oogst', inter.aim && inter.aim.kind === 'oogst', inter.aim && inter.aim.kind);
inter.doAction();
check('oogst in de tas', V25.inv.items.tato === 4, JSON.stringify(V25.inv.items));
step(0.2);
check('akker na oogst weer jong', field.stage === 0 && inter.aim && inter.aim.kind === 'groei');

// ---------- 3. jagen
step(6); // wild laten verschijnen
check('wild verschenen', sys.critters.length > 0, `(${sys.critters.length})`);
let kills = 0, shots = 0;
for (let i = 0; i < 40 && kills < 3; i++) {
  const c = sys.critters.find(c => c.state !== 'DEAD');
  if (!c) { step(5); continue; }
  const p = c.el.object3D.position;
  setCam(p.x + 4, 1.6, p.z + 4);          // ga op ~5,7 m staan
  c.state = 'WANDER'; c.def.skittishRange = 0; // niet laten schrikken in de test
  lookAt(p.x, c.aimHeight, p.z);
  inter.acc = 100; step(0.06);
  if (inter.aim && inter.aim.kind === 'jacht') {
    fakeNow += 1; shots++;
    inter.doAction();
    if (c.state === 'DEAD') kills++;
  }
  step(0.5);
}
check('vizier op wild = jacht + schoten raak', kills >= 3, `(${kills} gevelt uit ${shots} schoten)`);
check('vlees in de tas', V25.inv.items.vlees >= 3, JSON.stringify(V25.inv.items));
step(5);
check('dood wild opgeruimd', sys.critters.every(c => c.state !== 'DEAD' || c.deadFor < 4));
check('wild blijft buiten het hek', sys.critters.every(c => !sys.isInside(c.el.object3D.position.x, c.el.object3D.position.z)));

// ---------- 4. melken
const brahmin = sys.animals.map(e => e.components.animal).find(a => a.data.product === 'melk' && a.state === 'GRAZE');
const bp = brahmin.el.object3D.position;
setCam(bp.x, 1.6, bp.z + 5); lookAt(bp.x, brahmin.aimHeight, bp.z);
brahmin.pauseUntil = brahmin.age + 99; // even stilstaan
inter.acc = 100; step(0.06);
check('vizier op brahmin = melken', inter.aim && inter.aim.kind === 'melk', inter.aim && inter.aim.kind);
inter.doAction();
check('melk in de tas', V25.inv.items.melk === 1);
inter.acc = 100; step(0.06);
check('melk-cooldown werkt', !brahmin.canMilk(fakeNow));

// ---------- 5. uitbraak en terugleiden door de poort
// Uitbraak afdwingen (deterministisch), camera kijkt omhoog zodat niets gelokt wordt
setCam(0, 1.6, 30); lookAt(0, 50, 30.01);
sys.animals.forEach(e => { const a = e.components.animal; if (a.isOutside()) { a.el.object3D.position.set(0, 0, 0); a.state = 'GRAZE'; } });
const esc = sys.animals.map(e => e.components.animal).find(a => a.data.canEscape);
const kkBefore = V25.inv.items.kroonkurken || 0;
esc.startEscape();
let crossedRope = false;
for (let i = 0; i < 800 && esc.state === 'ESCAPE'; i++) {
  const p0 = esc.el.object3D.position.clone();
  step(0.05);
  const p1 = esc.el.object3D.position;
  if (sys.isInside(p0.x, p0.z) && !sys.isInside(p1.x, p1.z) && !sys.nearGate(p1.x, p1.z)) crossedRope = true;
}
check('dier uitgebroken via de poortopening', esc.state === 'WANDER_OUTSIDE' && !crossedRope, `${esc.state} crossedRope=${crossedRope}`);
step(3);
const ep = esc.el.object3D.position;
// ga tussen dier en hek staan... eerst lokken: kijk naar het dier
setCam(ep.x, 1.6, ep.z + 6); lookAt(ep.x, 0.9, ep.z);
step(0.2);
check('vizier op uitbraak = lokken (FOLLOW)', esc.state === 'FOLLOW', esc.state);

// Test hek: stuur het dier naar een punt BINNEN maar ver van de poort (oostkant)
esc.el.object3D.position.set(10.5, 0, 2); // oostkant, ver van de poort
const camSide = { x: 13, z: 2 };
setCam(camSide.x, 1.6, camSide.z);
let blockedSeen = false;
for (let i = 0; i < 400; i++) {
  lookAt(5, 0, 2);            // binnen, ver van poort
  step(0.05);
  if (esc.blocked) blockedSeen = true;
  if (esc.state !== 'FOLLOW') break;
}
check('dier kan niet door de touwen', !sys.isInside(ep.x, ep.z) && blockedSeen && esc.state === 'FOLLOW', `pos ${ep.x.toFixed(1)},${ep.z.toFixed(1)} blocked=${blockedSeen}`);

// Nu zoals een speler: blik langs waypoints om het hek heen naar de poort
setCam(19, 1.6, -4);
const wps = [{ x: 10.5, z: -2 }, { x: 10.5, z: -9 }, { x: 0, z: -9 }, { x: 0, z: -2 }];
let wi = 0;
for (let i = 0; i < 2000 && esc.state === 'FOLLOW'; i++) {
  const w = wps[wi];
  lookAt(w.x, 0, w.z);
  step(0.05);
  if (Math.hypot(ep.x - w.x, ep.z - w.z) < 1.0 && wi < wps.length - 1) wi++;
  // speler loopt mee zodat hij binnen bereik blijft
  if (wi >= 2) setCam(14, 1.6, -14); // achter het dier aan lopen
}
function U_dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
check('dier terug binnen via de poort', esc.state === 'GRAZE' && sys.isInside(ep.x, ep.z), `${esc.state} ${ep.x.toFixed(1)},${ep.z.toFixed(1)}`);
const returnedNow = events.filter(e => e.name === 'animal-returned').length; const kkDelta = (V25.inv.items.kroonkurken || 0) - kkBefore;
check('beloning: 5 kroonkurken per teruggeleid dier (max 2 ontsnappers)', kkDelta % 5 === 0 && kkDelta >= 5 && kkDelta <= 10, '(+' + ((V25.inv.items.kroonkurken || 0) - kkBefore) + ')');

// ---------- 6. inlevercode
const code = V25.inv.makeCode();
const chk = V25.inv.checkCode(code);
check('inlevercode geldig', chk.ok, code);
check('code bevat alle spullen', chk.items.length === Object.keys(V25.inv.items).length);
const tampered = code.replace(/VLS\d+/, 'VLS99');
check('gemanipuleerde code afgekeurd', !V25.inv.checkCode(tampered).ok, tampered);
V25.inv.clear();
check('tas leeg na inleveren', V25.inv.total() === 0);
// Teruggeleid dier breekt niet meteen weer uit
const reEsc = esc.state;
step(20);
check('teruggeleid dier blijft even binnen', esc.state === 'GRAZE' && esc.escapeAt > esc.age, `${esc.state} escAt=${esc.escapeAt.toFixed(0)} age=${esc.age.toFixed(0)}`);

// ---------- 7. schaal (kamer-modus): zelfde spel, kleine boerderij
[...sys.critters].forEach(c => c.el.parentNode && c.el.parentNode.removeChild(c.el));
farm.object3D.scale.setScalar(0.2);
farm.object3D.position.set(0, 0, -2.8);
setCam(0, 1.4, 0);
const f2 = sys.fields[1]; f2.plantedAt = fakeNow - 1000; step(0.2);
// wereldpositie akker berekenen
const wp = new THREE.Vector3(f2.cfg.x, 0, f2.cfg.z); farm.object3D.localToWorld(wp);
lookAt(wp.x, wp.y, wp.z); inter.acc = 100; step(0.06);
check('kamer-schaal: oogsten werkt ook verkleind', inter.aim && inter.aim.kind === 'oogst', inter.aim && inter.aim.kind);

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
