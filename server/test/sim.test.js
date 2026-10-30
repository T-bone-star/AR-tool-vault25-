'use strict';
// Spelregeltest met meerdere spelers. Draaien: node server/test/sim.test.js
const { World } = require('../sim');
const cfg = JSON.parse(JSON.stringify(require('../config')));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✓' : '✗'} ${name} ${extra}`); };

const out = [];
const w = new World(cfg, {}, (to, msg) => out.push({ to, msg }));
const msgsFor = (id) => out.filter(o => o.to === id && o.msg.t === 'msg').map(o => o.msg.text);
const lastMsg = (id) => msgsFor(id).at(-1) || '';
const events = (kind) => out.filter(o => o.to === 'all' && o.msg.t === 'event' && o.msg.kind === kind);
const run = (s, dt = 0.05) => { for (let t = 0; t < s; t += dt) w.tick(dt); };

// Pose: staan op (x,z) op 1,6 m, kijkend naar (tx,ty,tz)
function look(id, x, z, tx, ty, tz, y = 1.6) {
  const dx = tx - x, dy = ty - y, dz = tz - z;
  w.setPose(id, { x, y, z, dx, dy, dz });
}

// ---------- spelers en rollen
const jan = w.join('p-jan', 'Jan', ['spoor-25']);      // jager (code, hoofdletterongevoelig)
const piet = w.join('p-piet', 'Piet', ['ZAAD-25']);    // boer
const kees = w.join('p-kees', 'Kees');                  // geen rol
const anna = w.join('p-anna', 'Anna', ['ZAAD-25']);    // ook boer
check('jager-code geeft rol', jan.roles.has('jager') && !jan.roles.has('boer'));
check('boer-code geeft rol', piet.roles.has('boer'));
check('zonder code geen rol', kees.roles.size === 0);
w.redeem('p-kees', 'FOUT');
check('verkeerde code geweigerd', /Onbekende code/.test(lastMsg('p-kees')));

// ---------- oogsten: alleen boeren, en maar één wint
const f = w.fields[0];
f.plantedAt = w.t - 10000;
look('p-kees', f.cfg.x, f.cfg.z + 4, f.cfg.x, 0, f.cfg.z);
w.act('p-kees', 'harvest', 0);
check('geen boer kan niet oogsten', /Alleen een boer/.test(lastMsg('p-kees')) && w.fieldProgress(f) === 1);
look('p-piet', f.cfg.x - 2, f.cfg.z + 4, f.cfg.x, 0, f.cfg.z);
look('p-anna', f.cfg.x + 2, f.cfg.z + 4, f.cfg.x, 0, f.cfg.z);
w.act('p-piet', 'harvest', 0);   // tegelijk...
w.act('p-anna', 'harvest', 0);   // ...maar Piet was eerst
check('eerste boer krijgt de oogst', piet.inv.tato === f.cfg.yield, JSON.stringify(piet.inv));
check('tweede boer krijgt niets (te laat)', !anna.inv.tato && /niet rijp/.test(lastMsg('p-anna')));
check('oogst zichtbaar voor iedereen', events('harvest').some(e => /Piet oogstte de tato/.test(e.msg.text)));
look('p-piet', f.cfg.x, f.cfg.z + 40, f.cfg.x, 0, f.cfg.z);
w.fields[1].plantedAt = w.t - 10000;
w.act('p-piet', 'harvest', 1);
check('te ver weg kan niet oogsten', /Te ver/.test(lastMsg('p-piet')));

// ---------- jagen: iedereen kan raken, alleen jager krijgt buit; maar één raakt
w.critters = [];
w.nextSpawn = 0;
cfg.wildlife.types.forEach(t => { t.hitChance = 1; t.skittishRange = 0; });
cfg.behavior.maxShotRange = 1e6;   // geen afname met afstand: in de test is raak echt raak
run(0.1);
let c = w.critters[0];
check('wild verschenen', !!c);
c.x = 0; c.z = -16; c.target = null; c.pauseUntil = w.t + 999;
const aimY = c.def.aimHeight * c.def.scale;
look('p-kees', 4, -16, c.x, aimY, c.z);
w.act('p-kees', 'shoot', c.id);
check('niet-jager raakt wel', c.state === 'DEAD');
check('niet-jager krijgt geen buit', !kees.inv.vlees && /zonder jagerskennis/.test(lastMsg('p-kees')));
check('schot zichtbaar voor iedereen', out.some(o => o.to === 'all' && o.msg.t === 'shot' && o.msg.by === 'p-kees'));
look('p-jan', -4, -16, c.x, aimY, c.z);
w.act('p-jan', 'shoot', c.id);
check('tweede schot op hetzelfde dier: te laat', !jan.inv.vlees && /Te laat/.test(lastMsg('p-jan')));

w.critters = []; w.nextSpawn = 0; run(0.1);
c = w.critters[0]; c.x = 0; c.z = -16; c.target = null; c.pauseUntil = w.t + 999;
look('p-jan', -4, -16, c.x, c.def.aimHeight * c.def.scale, c.z);
w.t += 1; w.act('p-jan', 'shoot', c.id);
check('jager krijgt buit', (jan.inv.vlees || 0) >= 1, JSON.stringify(jan.inv));
check('jacht zichtbaar voor iedereen', events('hunt').some(e => /Jan velde/.test(e.msg.text)));

w.critters = []; w.nextSpawn = 0; run(0.1);
c = w.critters[0]; c.x = 0; c.z = -16; c.target = null; c.pauseUntil = w.t + 999;
look('p-jan', -4, -16, c.x + 10, 0, c.z - 10);   // kijkt ernaast
w.t += 1; w.act('p-jan', 'shoot', c.id);
check('vals richten (target sturen zonder te kijken) = mis', c.state !== 'DEAD');

// ---------- melken: alleen boer, één keer per rustperiode
const b = w.animals.find(a => a.product === 'melk');
b.state = 'GRAZE'; b.x = 0; b.z = 0; b.pauseUntil = w.t + 999;
look('p-kees', 0, 4, 0, 0.9, 0);
w.act('p-kees', 'milk', b.id);
check('geen boer kan niet melken', /Alleen een boer/.test(lastMsg('p-kees')));
look('p-piet', 0, 4, 0, 0.9, 0);
look('p-anna', 2, 4, 0, 0.9, 0);
w.act('p-piet', 'milk', b.id);
w.act('p-anna', 'milk', b.id);
check('één boer melkt, ander te laat', piet.inv.melk === 1 && !anna.inv.melk && /net gemolken/.test(lastMsg('p-anna')));

// ---------- vee terugbrengen: iedereen, slechts één leider
w.animals.forEach(a => { a.state = 'GRAZE'; a.x = 0; a.z = 0; a.target = null; a.pauseUntil = w.t + 999; });
const esc = w.animals.find(a => a.type === 'radstag');
esc.state = 'WANDER_OUTSIDE'; esc.x = 3; esc.z = -12; esc.target = { x: 3, z: -12 };
// Iedereen behalve Kees kijkt weg (omhoog)
for (const id of ['p-jan', 'p-piet', 'p-anna']) look(id, 30, 30, 30, 50, 30.1);
look('p-kees', 3, -20, 3, 0.8, -12);
run(0.2);
check('niet-boer/niet-jager kan vee lokken', esc.state === 'FOLLOW' && esc.followBy === 'p-kees', esc.state);
look('p-jan', -3, -20, 3, 0.8, -12);
run(0.2);
check('lokker blijft dezelfde (geen kaping)', esc.followBy === 'p-kees');
look('p-jan', 30, 30, 30, 50, 30.1);
// Kees leidt via de poort: eerst naar voor de opening, dan naar binnen
for (let i = 0; i < 600 && esc.state === 'FOLLOW'; i++) {
  const nearFront = Math.hypot(esc.x - 0, esc.z + 9) < 1;
  if (!nearFront && esc.z < -6.5) look('p-kees', 3, -20, 0, 0, -9); else look('p-kees', 0, -20, 0, 0, -2);
  if (esc.z > -9.5) look('p-kees', 0, -20, 0, 0, -2);
  w.tick(0.05);
}
check('vee terug binnen via de poort', esc.state === 'GRAZE' && w.isInside(esc.x, esc.z), `${esc.state} ${esc.x.toFixed(1)},${esc.z.toFixed(1)}`);
check('teruggeleider krijgt beloning (geen rol nodig)', kees.inv.kroonkurken === 5, JSON.stringify(kees.inv));
check('terugbrengen zichtbaar voor iedereen', events('return').some(e => /Kees bracht een radstag/.test(e.msg.text)));
w.condition = 'beschadigd';
const otherStags = w.animals.filter(a => a.type === 'radstag' && a !== esc);
otherStags.forEach(a => { a.canEscape = false; });
check('teruggebracht dier breekt niet direct weer uit', esc.immuneUntil > w.t + 60 && w.triggerEscape('radstag', 1, false) === 0);
otherStags.forEach(a => { a.canEscape = true; });
w.condition = 'goed';

// Speler gaat offline tijdens lokken -> dier wordt losgelaten
esc.state = 'WANDER_OUTSIDE'; esc.x = 3; esc.z = -12; esc.followBy = null;
look('p-kees', 3, -20, 3, 0.8, -12); run(0.2);
w.leave('p-kees'); run(4);
check('lokker offline -> dier los', esc.state === 'WANDER_OUTSIDE' && !esc.followBy);

// ---------- paddockstaat en uitbraken
{
  const ww = new World(cfg, {}, () => {});
  const run2 = (s2, dt = 0.5) => { for (let t = 0; t < s2; t += dt) ww.tick(dt); };
  ww.join('x', 'X'); // niemand posed: geen lokken
  run2(30 * 60);
  check('paddock goed: geen vanzelf-uitbraken in 30 min', ww.animals.every(a => a.state === 'GRAZE'), ww.animals.map(a => a.state).join(''));
  check('molerats kunnen niet uitbreken', ww.animals.filter(a => a.type === 'molerat').every(a => !a.canEscape));

  check('GM-uitbraak: brahmin', ww.triggerEscape('brahmin', 1, true) === 1);
  run2(60);
  const out = ww.animals.filter(a => !ww.isInside(a.x, a.z));
  check('GM-uitbraak loopt via de poort naar buiten', out.length === 1 && out[0].type === 'brahmin' && out[0].state === 'WANDER_OUTSIDE', out.map(a => a.type + ':' + a.state).join());

  const ww2 = new World(cfg, {}, () => {});
  ww2.gmSetCondition('kapot');
  let maxOut = 0;
  for (let t = 0; t < 30 * 60; t += 0.5) { ww2.tick(0.5); maxOut = Math.max(maxOut, ww2.outsideCount()); }
  check('paddock kapot: dieren breken vanzelf uit', ww2.animals.some(a => !ww2.isInside(a.x, a.z) || a.immuneUntil > 0));
  check('nooit meer dan maxOutside tegelijk buiten', maxOut <= cfg.paddock.maxOutside, `(max ${maxOut})`);

  const ww3 = new World(cfg, {}, () => {});
  ww3.gmSetCondition('beschadigd');
  let escapes3 = 0; const origStart = ww3.startEscape.bind(ww3);
  ww3.startEscape = (a) => { escapes3++; origStart(a); };
  for (let t = 0; t < 120 * 60; t += 0.5) ww3.tick(0.5);
  check('beschadigd: ongeveer 1 uitbraak per 12 min (2 uur)', escapes3 >= 3 && escapes3 <= 20, `(${escapes3})`);

  // Kapot hek: overal terug te leiden (niet alleen poort)
  const ww4 = new World(cfg, {}, () => {});
  ww4.join('k', 'K');
  ww4.gmSetCondition('kapot');
  const a4 = ww4.animals.find(a => a.type === 'radstag');
  ww4.animals.forEach(a => { a.pauseUntil = 1e9; });
  a4.state = 'WANDER_OUTSIDE'; a4.x = 12; a4.z = 0; a4.outSince = 0; a4.target = { x: 12, z: 0 };
  ww4.setPose('k', { x: 16, y: 1.6, z: 0, dx: -4, dy: -0.8, dz: 0 });
  for (let i = 0; i < 400 && a4.state !== 'GRAZE'; i++) { ww4.setPose('k', { x: 16, y: 1.6, z: 0, dx: -12, dy: -1.6, dz: 0 }); ww4.tick(0.05); }
  check('kapot hek: dier dwars door de touwen terug te leiden', a4.state === 'GRAZE', `${a4.state} ${a4.x.toFixed(1)}`);
  check('paddockstaat in snapshot voor de telefoon', ww4.snapshot().st.cond === 'kapot');
}

// ---------- wildstand per gebied
{
  const ww = new World(cfg, {}, () => {});
  const jj = ww.join('j', 'J', [cfg.roles.jager.code]);
  const north = ww.sectors.find(s => s.name === 'noord');
  // Jager schiet 5 beesten in het noorden
  for (let i = 0; i < 5; i++) {
    ww.critters = [{ id: 'z' + i, type: 'radroach', def: { ...cfg.wildlife.types[0], hitChance: 1, skittishRange: 0 }, x: 0, z: -16, yaw: 0, state: 'WANDER', target: null, pauseUntil: 1e9 }];
    ww.setPose('j', { x: 0, y: 1.6, z: -12, dx: 0, dy: 0.12 - 1.6, dz: -4 });
    ww.t += 1; ww.act('j', 'shoot', 'z' + i);
  }
  check('jagen put het gebied uit', north.stock <= 1 - 5 * cfg.wildlife.depletionPerKill + 1e-9 && north.kills === 5, `(stand ${north.stock.toFixed(2)})`);
  check('andere gebieden onaangetast', ww.sectors.filter(s => s !== north).every(s => s.stock === 1));
  // Niet-jager telt ook
  ww.join('n', 'N');
  const before = north.stock;
  ww.critters = [{ id: 'q', type: 'radroach', def: { ...cfg.wildlife.types[0], hitChance: 1 }, x: 0, z: -16, yaw: 0, state: 'WANDER', target: null, pauseUntil: 1e9 }];
  ww.setPose('n', { x: 0, y: 1.6, z: -12, dx: 0, dy: 0.12 - 1.6, dz: -4 });
  ww.act('n', 'shoot', 'q');
  check('ook niet-jagers putten het gebied uit', north.stock < before);
  // Spawn vermijdt lege gebieden
  north.stock = 0;
  let inNorth = 0;
  for (let i = 0; i < 400; i++) { const sct = ww.pickSpawnSector(); if (sct === north) inNorth++; }
  check('leeg gebied krijgt geen nieuw wild', inNorth === 0);
  // Herstel
  ww.critters = []; for (let t = 0; t < 3600; t += 1) ww.tick(1);
  check('gebied herstelt langzaam (1 uur)', north.stock > 0.4 && north.stock < 0.6, `(stand ${north.stock.toFixed(2)})`);
  // Vermenigvuldiger
  ww.gmRestoreWild();
  ww.gmSetWildMult(2);
  check('GM x2 verdubbelt het maximum aan wild', ww.wildCapacity().max === cfg.wildlife.maxAlive * 2);
  ww.gmSetWildMult(0);
  ww.critters = []; for (let t = 0; t < 300; t += 0.5) ww.tick(0.5);
  check('GM x0 = geen wild', ww.critters.length === 0);
  // Veel jagen in één gebied -> minder wild in totaal
  const wa = new World(cfg, {}, () => {}), wb = new World(cfg, {}, () => {});
  wb.sectors.forEach(s => { s.stock = 0.2; });
  check('uitgeputte omgeving = minder wild toegestaan', wb.wildCapacity().max < wa.wildCapacity().max, `${wb.wildCapacity().max} < ${wa.wildCapacity().max}`);
}

// ---------- radio
{
  let hour = 14;
  const clock = () => { const d = new Date(2026, 10, 21, hour, 0, 0); return d; };
  const ww = new World(cfg, {}, () => {}, { clock });
  const run2 = (s2, dt = 1) => { for (let t = 0; t < s2; t += dt) ww.tick(dt); };
  const pose = (id) => ww.setPose(id, { x: 0, y: 1.6, z: 14, dx: 0, dy: 0, dz: -1 });
  ww.join('r', 'R'); pose('r');
  run2(10);
  check('geen bericht zolang alles in orde is', ww.radioQueue.length === 0);
  ww.triggerEscape('brahmin', 1, true);
  // speler kijkt weg zodat er niet gelokt wordt
  ww.setPose('r', { x: 0, y: 1.6, z: 14, dx: 0, dy: 1, dz: 0.01 });
  run2(4 * 60);
  check('nog geen bericht na 4 min los', !ww.radioQueue.some(b => b.kind === 'escape'));
  run2(90);
  const esc = ww.radioQueue.find(b => b.kind === 'escape');
  check('bericht na 5 min onbeheerde uitbraak', !!esc, esc && esc.text);
  check('bericht noemt dier en richting', esc && /brahmin/.test(esc.text) && /(noord|oost|zuid|west)kant/.test(esc.text));
  check('bericht heeft ook een LLM-prompt', esc && /FreeRadical/.test(esc.prompt) && /brahmin/.test(esc.prompt));
  run2(5 * 60);
  check('niet elke 5 s opnieuw (herhaling max 1x per 15 min)', ww.radioQueue.filter(b => b.kind === 'escape').length === 1);
  const got = ww.radioNext();
  check('radio haalt bericht op', got && got.kind === 'escape' && got.delivered);
  check('daarna is de wachtrij leeg', ww.radioNext() === null);

  // Lang niemand bij de paddock
  const wi = new World(cfg, {}, () => {}, { clock });
  for (let t = 0; t < 44 * 60; t += 5) wi.tick(5);
  check('nog geen "verlaten"-bericht na 44 min', !wi.radioQueue.some(b => b.kind === 'idle'));
  for (let t = 0; t < 2 * 60; t += 5) wi.tick(5);
  const idle = wi.radioQueue.find(b => b.kind === 'idle');
  check('"verlaten"-bericht na 45 min niemand', !!idle, idle && idle.text);
  // Iemand komt naar buiten → teller reset
  const wj = new World(cfg, {}, () => {}, { clock });
  wj.join('a', 'A');
  for (let t = 0; t < 60 * 60; t += 5) { if (t % 600 === 0) wj.setPose('a', { x: 0, y: 1.6, z: 10, dx: 0, dy: 0, dz: -1 }); else wj.leave('a'), wj.join('a', 'A'); wj.tick(5); }
  check('regelmatig iemand buiten = geen "verlaten"-bericht', !wj.radioQueue.some(b => b.kind === 'idle'));

  // Stille uren
  hour = 4;
  const wq = new World(cfg, {}, () => {}, { clock });
  for (let t = 0; t < 120 * 60; t += 10) wq.tick(10);
  check('geen berichten tussen 02:00 en 10:00', wq.radioQueue.length === 0);
  hour = 14;

  // Paddock kapot -> direct bericht; GM eigen bericht
  const wk = new World(cfg, {}, () => {}, { clock });
  wk.gmSetCondition('kapot');
  check('paddock kapot -> radiobericht', wk.radioQueue.some(b => b.kind === 'paddock'));
  wk.gmRadio('Test van de spelleiding');
  check('GM kan zelf een radiobericht sturen', wk.radioQueue.some(b => b.text === 'Test van de spelleiding'));
  // Opslaan
  const saved2 = JSON.parse(JSON.stringify(wk.toJSON()));
  const wk2 = new World(cfg, saved2, () => {}, { clock });
  check('na herstart: paddockstaat, wildstand en radio behouden', wk2.condition === 'kapot' && wk2.radioQueue.length === wk.radioQueue.length && wk2.sectors.length === 4);
}

// ---------- inleveren + GM
const before = { ...jan.inv };
w.turnIn('p-jan');
const ti = w.turnins.at(-1);
check('inleveren maakt code + leegt tas', ti && /^[A-Z0-9]{4}$/.test(ti.code) && Object.keys(jan.inv).length === 0, ti && ti.code);
check('inlevering bevat de spullen', JSON.stringify(ti.items) === JSON.stringify(before));
w.turnIn('p-jan');
check('lege tas inleveren geweigerd', /leeg/.test(lastMsg('p-jan')) && w.turnins.length === 1);
w.gmResolve(ti.code, false);
check('GM "terug" zet spullen terug', JSON.stringify(jan.inv) === JSON.stringify(before));
w.turnIn('p-jan');
const ti2 = w.turnins.at(-1);
w.gmResolve(ti2.code, true);
check('GM "uitbetaald" sluit af', ti2.status === 'paid' && Object.keys(jan.inv).length === 0);
check('dubbel afhandelen kan niet', w.gmResolve(ti2.code, true) === false);
w.gmSetRole('p-kees', 'jager', true);
check('GM kan rol geven', kees.roles.has('jager'));

// ---------- opslaan / herladen (reconnect behoudt tas en rollen)
const saved = JSON.parse(JSON.stringify(w.toJSON()));
const w2 = new World(cfg, saved, () => {});
const piet2 = w2.join('p-piet', 'Piet');
check('na herstart: rol en tas behouden', piet2.roles.has('boer') && piet2.inv.melk === 1, JSON.stringify(piet2.inv));

// ---------- snapshot en layout bevatten geen geheimen
const lay = JSON.stringify(w.layout());
check('layout lekt geen rolcodes of GM-wachtwoord', !lay.includes('SPOOR') && !lay.includes('ZAAD') && !lay.includes(cfg.gmPassword));
const snap = w.snapshot();
check('snapshot heeft vee, wild, akkers', snap.a.length === 7 && Array.isArray(snap.c) && snap.f.length === 3);

// ---------- duurtest: 10 minuten wereld met 4 spelers, geen crashes, geen wild in het hek
for (const id of ['p-jan', 'p-piet', 'p-anna']) look(id, 0, 14, 0, 0, 0);
let wildInside = 0;
for (let i = 0; i < 12000; i++) {
  w.tick(0.05);
  if (i % 50 === 0) wildInside += w.critters.filter(c => c.state !== 'DEAD' && w.isInside(c.x, c.z)).length;
}
check('10 min duurtest: wild nooit in het hek', wildInside === 0);
check('10 min duurtest: wild blijft beperkt', w.critters.filter(c => c.state !== 'DEAD').length <= cfg.wildlife.maxAlive);

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
