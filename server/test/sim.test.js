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
b.state = 'GRAZE'; b.x = 0; b.z = 0; b.pauseUntil = w.t + 999; b.escapeAt = Infinity;
look('p-kees', 0, 4, 0, 0.9, 0);
w.act('p-kees', 'milk', b.id);
check('geen boer kan niet melken', /Alleen een boer/.test(lastMsg('p-kees')));
look('p-piet', 0, 4, 0, 0.9, 0);
look('p-anna', 2, 4, 0, 0.9, 0);
w.act('p-piet', 'milk', b.id);
w.act('p-anna', 'milk', b.id);
check('één boer melkt, ander te laat', piet.inv.melk === 1 && !anna.inv.melk && /net gemolken/.test(lastMsg('p-anna')));

// ---------- vee terugbrengen: iedereen, slechts één leider
w.animals.forEach(a => { a.escapeAt = Infinity; a.state = 'GRAZE'; a.x = 0; a.z = 0; a.target = null; a.pauseUntil = w.t + 999; });
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
check('teruggebracht dier breekt niet direct weer uit', esc.escapeAt > w.t + 60);

// Speler gaat offline tijdens lokken -> dier wordt losgelaten
esc.state = 'WANDER_OUTSIDE'; esc.x = 3; esc.z = -12; esc.followBy = null;
look('p-kees', 3, -20, 3, 0.8, -12); run(0.2);
w.leave('p-kees'); run(4);
check('lokker offline -> dier los', esc.state === 'WANDER_OUTSIDE' && !esc.followBy);

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
