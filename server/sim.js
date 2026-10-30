'use strict';
/*
 * De gedeelde wereld. De server is de enige die beslist:
 *   - waar vee en wild zijn, wat ze doen;
 *   - wie iets als EERSTE oogst, verzorgt of raakt (de rest krijgt "te laat");
 *   - wie welke rol heeft en wat er in elke tas zit.
 * Telefoons sturen alleen hun camera-pose en "ik wil X doen".
 *
 * Meerdere hokken: elk hok heeft een eigen hek, poort, staat en dieren. Een
 * hok dat niet "gebouwd" (actief) is, bestaat niet in de wereld.
 *
 * Geen netwerkcode hier: alles gaat via this.emit(to, msg), zodat dit los
 * te testen is. to = speler-id | 'all' | 'gm'.
 */
const G = require('./geo');
const TEXTS = require('./radio-texts');

const STATE_CODE = { GRAZE: 'g', ESCAPE: 'e', WANDER_OUTSIDE: 'w', FOLLOW: 'f' };
const CODE_CHARS = 'ACDEFGHJKMNPQRTUVWXY3479';
const r2 = (v) => Math.round(v * 100) / 100;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const CONDITIONS = ['goed', 'beschadigd', 'kapot'];
const SIDES = ['noord', 'oost', 'zuid', 'west'];

class World {
  constructor(cfg, saved = {}, emit = () => {}, opts = {}) {
    this.cfg = cfg;
    this.B = cfg.behavior;
    this.W = cfg.wildlife;
    this.S = cfg.species || {};
    this.emit = emit;
    this.t = 0;
    this.nextId = 1;
    this.returnedTotal = 0;
    this.players = new Map();
    for (const p of saved.players || []) {
      this.players.set(p.id, {
        id: p.id, name: p.name, roles: new Set(p.roles || []), inv: p.inv || {},
        online: false, pose: null, lastShot: -99,
      });
    }
    this.turnins = saved.turnins || [];
    this.clock = opts.clock || (() => new Date());   // echte klok (stille uren); te vervangen in tests
    this.R = cfg.radio || { enabled: false };
    this.P = cfg.paddock || { startCondition: 'goed', escapeEveryMinutes: {}, maxOutside: 3 };
    this.initPens(saved.pens);
    // Midden van de hele boerderij (wild, richtingen, "bij de hokken")
    const all = [...this.pens, ...(cfg.fields || []).map(f => ({ x0: f.x - f.width / 2, x1: f.x + f.width / 2, z0: f.z - f.depth / 2, z1: f.z + f.depth / 2 }))];
    this.center = all.length ? {
      x: (Math.min(...all.map(p => p.x0)) + Math.max(...all.map(p => p.x1))) / 2,
      z: (Math.min(...all.map(p => p.z0)) + Math.max(...all.map(p => p.z1))) / 2,
    } : { x: 0, z: 0 };
    // Wildstand per gebied (0–1) + GM-vermenigvuldiger
    const sectors = (cfg.wildlife && cfg.wildlife.sectors) || SIDES;
    this.sectors = sectors.map((name, i) => {
      const old = (saved.sectors || []).find(o => o.name === name);
      return { i, name, stock: old ? G.clamp(old.stock, 0, 1) : 1, kills: old ? old.kills || 0 : 0, depletedSaid: false };
    });
    this.wildMult = Number.isFinite(saved.wildMult) ? saved.wildMult
      : ((cfg.wildlife && cfg.wildlife.startMultiplier) ?? 1);
    // Radio
    this.radioQueue = saved.radioQueue || [];
    this.radioSeq = this.radioQueue.reduce((m, b) => Math.max(m, b.id), 0);
    this.radioLast = {};          // soort → this.t van laatste melding
    this.lastActive = 0;          // this.t waarop iemand voor het laatst bij de hokken was
    this.feed = [];
    this.dirty = true;
    this.saveNeeded = false;
    this.savedHerd = saved.pens ? Object.fromEntries(saved.pens.map(p => [p.id, p.animals || {}])) : null;
    this.spawnWorld();
  }

  // ------------------------------------------------------------- hokken
  initPens(savedPens = []) {
    this.pens = (this.cfg.pens || []).map(def => {
      const old = (savedPens || []).find(o => o.id === def.id) || {};
      const w = def.width, d = def.depth;
      const pen = {
        ...def,
        x0: def.x - w / 2, x1: def.x + w / 2, z0: def.z - d / 2, z1: def.z + d / 2,
        points: [{ x: def.x - w / 2, z: def.z - d / 2 }, { x: def.x + w / 2, z: def.z - d / 2 },
                 { x: def.x + w / 2, z: def.z + d / 2 }, { x: def.x - w / 2, z: def.z + d / 2 }],
        active: old.active != null ? !!old.active : !!def.active,
        cond: CONDITIONS.includes(old.cond) ? old.cond : (this.P.startCondition || 'goed'),
        naam: def.naam || def.label.toLowerCase(),
      };
      // Poort: midden van de gekozen zijde, met een punt net binnen en buiten
      const side = SIDES.includes(def.gate) ? def.gate : 'noord';
      const mid = { noord: { x: def.x, z: pen.z0 }, zuid: { x: def.x, z: pen.z1 },
        west: { x: pen.x0, z: def.z }, oost: { x: pen.x1, z: def.z } }[side];
      const out = { noord: [0, -1], zuid: [0, 1], west: [-1, 0], oost: [1, 0] }[side];
      pen.gateSide = side;
      pen.gateMid = mid;
      pen.gateHalf = (def.gateWidth || 2) / 2;
      pen.gateInside = { x: mid.x - out[0] * 1.2, z: mid.z - out[1] * 1.2 };
      pen.gateOutside = { x: mid.x + out[0] * 3, z: mid.z + out[1] * 3 };
      return pen;
    });
    this.penById = Object.fromEntries(this.pens.map(p => [p.id, p]));
  }

  activePens() { return this.pens.filter(p => p.active); }
  inPen(pen, x, z) { return x > pen.x0 && x < pen.x1 && z > pen.z0 && z < pen.z1; }
  // In welk (gebouwd) hok staat dit punt?
  penAt(x, z) { return this.pens.find(p => p.active && this.inPen(p, x, z)) || null; }
  isInside(x, z) { return !!this.penAt(x, z); }
  nearGate(pen, x, z) { return G.dist(x, z, pen.gateMid.x, pen.gateMid.z) < pen.gateHalf + 0.5; }

  // Mag iets van (x0,z0) naar (x1,z1)? Elk gebouwd hek houdt tegen, behalve bij
  // de poort of als dat hek kapot is.
  fenceAllows(x0, z0, x1, z1) {
    for (const pen of this.pens) {
      if (!pen.active || pen.cond === 'kapot') continue;
      if (this.inPen(pen, x0, z0) === this.inPen(pen, x1, z1)) continue;
      if (!(this.nearGate(pen, x0, z0) || this.nearGate(pen, x1, z1))) return false;
    }
    return true;
  }

  spawnWorld() {
    this.animals = [];
    for (const pen of this.pens) {
      if (!pen.active) continue;
      const herd = this.savedHerd ? (this.savedHerd[pen.id] || {}) : (pen.start || {});
      for (const sp of pen.species) for (let i = 0; i < (herd[sp] || 0); i++) this.addAnimal(pen, sp);
    }
    this.savedHerd = null;
    this.fields = this.cfg.fields.map((f, i) => ({
      idx: i, cfg: f, plantedAt: this.t - (f.growSeconds || 90) * G.rand(0.4, 0.9),
    }));
    this.critters = [];
    this.nextSpawn = this.t + (this.W ? this.W.firstSpawnSeconds || 3 : Infinity);
  }

  addAnimal(pen, sp) {
    const def = this.S[sp] || {};
    const p = this.randomInPen(pen);
    const last = {};
    // Ongeveer de helft heeft bij de start meteen iets klaar, de rest volgt verspreid
    for (const [prod, min] of Object.entries(def.products || {})) last[prod] = this.t - min * 60 * G.rand(0.5, 1.5);
    const a = {
      id: 'a' + this.nextId++, type: sp, pen: pen.id, level: def.level || 1, speed: def.speed || 1,
      x: p.x, z: p.z, yaw: G.rand(0, 6.28), state: 'GRAZE', target: null, pauseUntil: 0,
      canEscape: def.escapes !== false, immuneUntil: 0, outSince: null, lastCollected: last,
      escapeLeg: 0, followBy: null, lostFor: 0, blocked: false, hinted: false,
    };
    this.animals.push(a);
    return a;
  }

  randomInPen(pen) {
    const m = 0.6;   // niet tegen het hek aan
    return { x: G.rand(pen.x0 + m, pen.x1 - m), z: G.rand(pen.z0 + m, pen.z1 - m) };
  }

  speciesLabel(sp) { return ((this.S[sp] && this.S[sp].label) || sp).toLowerCase(); }

  // ------------------------------------------------------------- helpers
  // Gebied (sector) van een punt rond een middelpunt: noord = -z
  sectorAt(x, z) {
    const n = this.sectors.length;
    const ang = Math.atan2(x - this.center.x, -(z - this.center.z));
    const a = (ang + 2 * Math.PI + Math.PI / n) % (2 * Math.PI);
    return this.sectors[Math.floor(a / (2 * Math.PI / n)) % n];
  }
  directionFrom(cx, cz, x, z) {
    const ang = Math.atan2(x - cx, -(z - cz));
    const a = (ang + 2 * Math.PI + Math.PI / 4) % (2 * Math.PI);
    return SIDES[Math.floor(a / (Math.PI / 2)) % 4];
  }

  fieldProgress(f) { return G.clamp((this.t - f.plantedAt) / (f.cfg.growSeconds || 90), 0, 1); }
  label(item) { return (this.cfg.items[item] && this.cfg.items[item].label) || item; }
  hasRole(p, role) { return !role || p.roles.has(role); }
  roleLabel(role) { return (this.cfg.roles[role] && this.cfg.roles[role].label) || role; }
  // Heeft speler een rol uit deze groep van minstens dit niveau? (veeboer 2 mag ook niveau 1)
  hasLevel(p, group, level) {
    if (!group) return true;
    for (const r of p.roles) {
      const d = this.cfg.roles[r];
      if (d && d.group === group && (d.level || 1) >= level) return true;
    }
    return false;
  }

  // Beweeg e naar e.target. true = aangekomen. Hekken zijn vast, behalve bij de poort.
  // insideAllowed=false: mag nooit een hok in (wild).
  step(e, v, dt, insideAllowed = true) {
    if (!e.target) return true;
    const d = G.dist(e.x, e.z, e.target.x, e.target.z);
    if (d < 0.25) { e.blocked = false; return true; }
    const s = Math.min(v * dt, d);
    const nx = (e.target.x - e.x) / d, nz = (e.target.z - e.z) / d;
    const x1 = e.x + nx * s, z1 = e.z + nz * s;
    const ok = insideAllowed ? this.fenceAllows(e.x, e.z, x1, z1) : !this.isInside(x1, z1);
    if (!ok) { e.blocked = true; return false; }
    e.blocked = false;
    e.x = x1; e.z = z1;
    e.yaw = Math.atan2(nx, nz) - Math.PI / 2;
    return false;
  }

  give(p, items) {
    for (const k in items) p.inv[k] = (p.inv[k] || 0) + items[k];
    this.sendMe(p);
    this.saveNeeded = true;
  }
  itemsText(items) {
    return Object.entries(items).map(([k, n]) => `${n} ${this.label(k).toLowerCase()}`).join(', ');
  }

  // ---------------------------------------------------------- berichten
  event(kind, text, extra = {}) {
    const e = { kind, text, at: Math.round(this.t), ...extra };
    this.feed.push(e);
    if (this.feed.length > 200) this.feed.shift();
    this.emit('all', { t: 'event', ...e });
    this.dirty = true;
  }
  msg(p, text, tone = 'info') { this.emit(p.id, { t: 'msg', text, tone }); }
  sendMe(p) {
    this.emit(p.id, { t: 'me', id: p.id, name: p.name, roles: [...p.roles], inv: p.inv });
    this.dirty = true;
  }

  // ------------------------------------------------------------- spelers
  join(id, name, codes = []) {
    id = String(id || '').slice(0, 64);
    if (!id) return null;
    name = String(name || '').trim().slice(0, 24) || 'Bewoner';
    let p = this.players.get(id);
    if (!p) {
      p = { id, name, roles: new Set(), inv: {}, online: true, pose: null, lastShot: -99 };
      this.players.set(id, p);
      this.saveNeeded = true;
    } else {
      if (p.name !== name) this.saveNeeded = true;
      p.name = name;
      p.online = true;
    }
    for (const c of codes) this.redeem(id, c, true);
    this.dirty = true;
    return p;
  }

  leave(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.online = false;
    p.pose = null;
    this.dirty = true;
  }

  redeem(id, code, quiet = false) {
    const p = this.players.get(id);
    const c = String(code || '').trim().toUpperCase();
    if (!p || !c) return false;
    for (const [role, def] of Object.entries(this.cfg.roles)) {
      if (String(def.code).toUpperCase() === c) {
        if (!p.roles.has(role)) {
          p.roles.add(role);
          this.saveNeeded = true;
          this.msg(p, `Je bent nu ${def.label.toLowerCase()}.`, 'good');
        } else if (!quiet) {
          this.msg(p, `Je bent al ${def.label.toLowerCase()}.`);
        }
        this.sendMe(p);
        return true;
      }
    }
    if (!quiet) this.msg(p, 'Onbekende code.', 'bad');
    return false;
  }

  setPose(id, pose) {
    const p = this.players.get(id);
    if (!p || !pose) return;
    const n = ['x', 'y', 'z', 'dx', 'dy', 'dz'].map(k => Number(pose[k]));
    if (n.some(v => !Number.isFinite(v))) return;
    const [x, y, z, dx, dy, dz] = n;
    const l = Math.hypot(dx, dy, dz) || 1;
    p.pose = { x, y, z, dx: dx / l, dy: dy / l, dz: dz / l };
  }

  // ------------------------------------------------------------- acties
  act(id, kind, target) {
    const p = this.players.get(id);
    if (!p || !p.online) return;
    if (kind === 'shoot') return this.shoot(p, target);
    if (kind === 'harvest') return this.harvest(p, target);
    if (kind === 'care' || kind === 'milk') return this.care(p, target);
  }

  shoot(p, targetId) {
    if (this.t - p.lastShot < this.B.shotCooldownSeconds) return;
    p.lastShot = this.t;
    const pos = p.pose ? { x: r2(p.pose.x), z: r2(p.pose.z) } : null;
    this.emit('all', { t: 'shot', by: p.id, pos });
    if (!targetId || !p.pose) return;
    const c = this.critters.find(c => c.id === targetId);
    if (!c || c.state === 'DEAD') { this.msg(p, 'Te laat — die is al neer.'); return; }
    const d = G.dist(p.pose.x, p.pose.z, c.x, c.z);
    const def = c.def;
    if (d > this.B.maxShotRange + 3 ||
        !G.aimOk(p.pose, c.x, (def.aimHeight || 0.2) * (def.scale || 1), c.z, (def.radius || 0.4) * (def.scale || 1))) {
      this.flee(c, p.pose); this.msg(p, `Mis! De ${def.label.toLowerCase()} vlucht.`); return;
    }
    const base = def.hitChance != null ? def.hitChance : 0.85;
    const chance = base * (1 - 0.4 * d / this.B.maxShotRange);
    if (Math.random() >= chance) {
      this.flee(c, p.pose);
      this.msg(p, `Mis! De ${def.label.toLowerCase()} vlucht.`);
      return;
    }
    c.state = 'DEAD';
    c.deadAt = this.t;
    this.depleteAt(c.x, c.z, this.hasRole(p, this.cfg.rules.huntLootRole));
    if (this.hasRole(p, this.cfg.rules.huntLootRole)) {
      this.give(p, def.loot || {});
      this.msg(p, `${def.label} geveld: ${this.itemsText(def.loot || {})}.`, 'good');
      this.event('hunt', `${p.name} velde een ${def.label.toLowerCase()}`, { by: p.id });
    } else {
      this.msg(p, `${def.label} geveld — maar zonder jagerskennis levert het niets op.`, 'bad');
      this.event('hunt', `${p.name} velde een ${def.label.toLowerCase()} (geen buit)`, { by: p.id });
    }
  }

  harvest(p, idx) {
    const f = this.fields[Number(idx)];
    if (!f) return;
    const name = this.label(f.cfg.crop).toLowerCase();
    if (!this.hasRole(p, this.cfg.rules.harvestRole)) {
      this.msg(p, `Alleen een ${this.roleLabel(this.cfg.rules.harvestRole).toLowerCase()} kan oogsten.`, 'bad');
      return;
    }
    if (!p.pose || G.dist(p.pose.x, p.pose.z, f.cfg.x, f.cfg.z) > this.B.actionRangeMeters) {
      this.msg(p, 'Te ver weg om te oogsten.'); return;
    }
    if (this.fieldProgress(f) < 1) {
      this.msg(p, `Te laat of te vroeg — de ${name} is niet rijp.`); return;
    }
    const n = f.cfg.yield || f.cfg.rows || 1;
    f.plantedAt = this.t;
    this.give(p, { [f.cfg.crop]: n });
    this.msg(p, `${n} ${name} geoogst.`, 'good');
    this.event('harvest', `${p.name} oogstte de ${name}`, { by: p.id, field: f.idx });
  }

  // Wat dit dier nu klaar heeft (eieren, haar, mest …) — alleen in z'n eigen hok
  readyProducts(a) {
    const pen = this.penById[a.pen];
    if (a.state !== 'GRAZE' || !pen || !pen.active || !this.inPen(pen, a.x, a.z)) return [];
    const def = this.S[a.type] || {};
    return Object.entries(def.products || {}).filter(([prod, min]) => this.t - a.lastCollected[prod] >= min * 60).map(([prod]) => prod);
  }

  care(p, animalId) {
    const a = this.animals.find(a => a.id === animalId);
    if (!a) return;
    const name = this.speciesLabel(a.type);
    if (!this.hasLevel(p, this.cfg.rules.careGroup, a.level)) {
      this.msg(p, `Voor een ${name} heb je Veeboer niveau ${a.level} of hoger nodig.`, 'bad');
      return;
    }
    if (!p.pose || G.dist(p.pose.x, p.pose.z, a.x, a.z) > this.B.actionRangeMeters) {
      this.msg(p, 'Te ver weg.'); return;
    }
    const ready = this.readyProducts(a);
    if (!ready.length) { this.msg(p, `Te laat — deze ${name} is net verzorgd.`); return; }
    const items = {};
    for (const prod of ready) { a.lastCollected[prod] = this.t; items[prod] = 1; }
    this.give(p, items);
    this.msg(p, `${cap1(name)} verzorgd: ${this.itemsText(items)}.`, 'good');
    this.event('care', `${p.name} verzorgde een ${name}`, { by: p.id });
  }

  // ----------------------------------------------------------- inleveren
  turnIn(id) {
    const p = this.players.get(id);
    if (!p) return;
    const items = Object.fromEntries(Object.entries(p.inv).filter(([, n]) => n > 0));
    if (!Object.keys(items).length) { this.msg(p, 'Je tas is leeg.'); return; }
    let code;
    do {
      code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    } while (this.turnins.some(t => t.code === code));
    const ti = { code, pid: p.id, name: p.name, items, at: Date.now(), status: 'open' };
    this.turnins.push(ti);
    p.inv = {};
    this.sendMe(p);
    this.emit(p.id, { t: 'turnin', code, items });
    this.saveNeeded = true;
    this.dirty = true;
  }

  gmResolve(code, approve) {
    const ti = this.turnins.find(t => t.code === code && t.status === 'open');
    if (!ti) return false;
    ti.status = approve ? 'paid' : 'returned';
    ti.resolvedAt = Date.now();
    const p = this.players.get(ti.pid);
    if (p) {
      if (approve) this.msg(p, `Inlevering ${code} is uitbetaald.`, 'good');
      else { this.give(p, ti.items); this.msg(p, `Inlevering ${code} is teruggezet in je tas.`); }
    }
    this.saveNeeded = true;
    this.dirty = true;
    return true;
  }

  gmSetRole(id, role, on) {
    const p = this.players.get(id);
    if (!p || !this.cfg.roles[role]) return false;
    if (on) p.roles.add(role); else p.roles.delete(role);
    this.msg(p, on ? `Een SL maakte je ${this.roleLabel(role).toLowerCase()}.` : `Je bent geen ${this.roleLabel(role).toLowerCase()} meer.`);
    this.sendMe(p);
    this.saveNeeded = true;
    return true;
  }

  gmResetWorld() {
    // Huidige kudde per hok bewaren, dan alles opnieuw neerzetten
    this.savedHerd = this.herdCounts();
    this.spawnWorld();
    this.event('gm', 'De hokken zijn opnieuw ingericht.');
  }

  herdCounts() {
    const out = {};
    for (const pen of this.pens) out[pen.id] = {};
    for (const a of this.animals) out[a.pen][a.type] = (out[a.pen][a.type] || 0) + 1;
    return out;
  }

  // ------------------------------------------------- hokken (GM)
  gmSetPenActive(penId, on) {
    const pen = this.penById[penId];
    if (!pen || pen.active === !!on) return false;
    pen.active = !!on;
    if (on) {
      pen.cond = 'goed';
      this.event('pen', `${cap1(pen.naam)} is gebouwd.`, { pen: pen.id });
    } else {
      const n = this.animals.filter(a => a.pen === pen.id).length;
      this.animals = this.animals.filter(a => a.pen !== pen.id);
      this.event('pen', `${cap1(pen.naam)} is afgebroken${n ? ` (${n} dieren weg)` : ''}.`, { pen: pen.id });
    }
    this.saveNeeded = true; this.dirty = true;
    return true;
  }

  gmAddAnimal(penId, sp) {
    const pen = this.penById[penId];
    if (!pen || !pen.active || !pen.species.includes(sp)) return null;
    if (this.animals.filter(a => a.pen === pen.id).length >= (pen.capacity || 99)) return null;
    const a = this.addAnimal(pen, sp);
    this.event('pen', `Er is een ${this.speciesLabel(sp)} bij in ${pen.naam}.`, { pen: pen.id });
    this.saveNeeded = true; this.dirty = true;
    return a;
  }

  gmRemoveAnimal(penId, sp) {
    const mine = this.animals.filter(a => a.pen === penId && a.type === sp);
    if (!mine.length) return false;
    const a = mine.find(x => x.state === 'GRAZE') || mine[0];
    this.animals = this.animals.filter(x => x !== a);
    this.saveNeeded = true; this.dirty = true;
    return true;
  }

  gmSetCondition(penId, cond) {
    // Oude aanroep zonder hok: geldt voor het eerste gebouwde hok
    if (cond === undefined) { cond = penId; penId = (this.activePens()[0] || {}).id; }
    const pen = this.penById[penId];
    if (!pen || !CONDITIONS.includes(cond) || cond === pen.cond) return false;
    pen.cond = cond;
    const Hok = cap1(pen.naam);
    const txt = { goed: `${Hok} is hersteld.`, beschadigd: `${Hok} is beschadigd — het vee wordt onrustig.`, kapot: `${Hok} is kapot! Het vee kan overal uit.` }[cond];
    this.event('paddock', txt, { condition: cond, pen: pen.id });
    if (this.R.announceCondition) {
      const key = { goed: 'conditionGoed', beschadigd: 'conditionBeschadigd', kapot: 'conditionKapot' }[cond];
      this.radio('pen-' + pen.id, fill(pick(TEXTS[key]), { hok: pen.naam, Hok }), `${Hok} is nu ${cond}.`, { force: true });
    }
    this.saveNeeded = true;
    this.dirty = true;
    return true;
  }

  // Start een uitbraak. type = soort of '' (willekeurig); penId = hok of '' (alle).
  triggerEscape(type = '', count = 1, byGm = false, penId = '') {
    const candidates = this.animals.filter(a => {
      const pen = this.penById[a.pen];
      return a.canEscape && a.state === 'GRAZE' && pen && pen.active && this.inPen(pen, a.x, a.z) &&
        (!type || a.type === type) && (!penId || a.pen === penId) && (byGm || this.t >= a.immuneUntil);
    });
    let n = 0;
    while (n < count && candidates.length) {
      const a = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
      this.startEscape(a);
      n++;
    }
    return n;
  }

  startEscape(a) {
    const pen = this.penById[a.pen];
    a.state = 'ESCAPE';
    a.escapeLeg = 0;
    if (pen.cond === 'kapot') {
      // Door een gat in het hek: recht naar buiten, de kant op waar het toch al stond
      let dx = a.x - pen.x, dz = a.z - pen.z;
      const l = Math.hypot(dx, dz);
      if (l < 0.3) { const r = G.rand(0, 6.28); dx = Math.cos(r); dz = Math.sin(r); } else { dx /= l; dz /= l; }
      const reach = Math.max(pen.width, pen.depth) / 2 + 4;
      a.escapeLeg = 1;
      a.target = { x: pen.x + dx * reach, z: pen.z + dz * reach };
    } else {
      a.target = { ...pen.gateInside };
    }
  }

  outsideCount() {
    return this.animals.filter(a => a.state !== 'GRAZE').length;
  }

  randomEscapes(dt) {
    if (this.outsideCount() >= (this.P.maxOutside || 3)) return;
    for (const pen of this.pens) {
      if (!pen.active) continue;
      const every = (this.P.escapeEveryMinutes || {})[pen.cond] || 0;
      if (every > 0 && Math.random() < dt / (every * 60)) this.triggerEscape('', 1, false, pen.id);
    }
  }

  // ------------------------------------------------------- wildstand
  depleteAt(x, z, byHunter) {
    const W = this.W, s = this.sectorAt(x, z);
    const w = (W.killWeight || {})[byHunter ? 'jager' : 'anders'] ?? 1;
    s.stock = G.clamp(s.stock - (W.depletionPerKill ?? 0.15) * w, 0, 1);
    s.kills++;
    this.saveNeeded = true;
    if (s.stock < (W.minStockToSpawn ?? 0.1) && !s.depletedSaid) {
      s.depletedSaid = true;
      this.event('wild', `Het wild aan de ${s.name}kant is op.`);
      if (this.R.announceDepletedSector) this.radio('wild-' + s.name, fill(pick(TEXTS.depleted), { richting: s.name }), `Aan de ${s.name}kant van de boerderij is het wild weggejaagd.`);
    }
  }

  gmSetWildMult(m) {
    m = Number(m);
    if (!Number.isFinite(m)) return false;
    this.wildMult = G.clamp(m, 0, 5);
    this.event('gm', `Wildstand ${this.wildMult === 0 ? 'uit' : 'x' + this.wildMult}.`);
    this.saveNeeded = true; this.dirty = true;
    return true;
  }

  gmRestoreWild() {
    for (const s of this.sectors) { s.stock = 1; s.depletedSaid = false; }
    this.event('gm', 'Het wild rond de boerderij is hersteld.');
    this.saveNeeded = true; this.dirty = true;
  }

  // ------------------------------------------------------------ radio
  inQuietHours() {
    const q = this.R.quietHours;
    if (!q || !q.from || !q.to) return false;
    const d = this.clock(), now = d.getHours() * 60 + d.getMinutes();
    const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
    const a = toMin(q.from), b = toMin(q.to);
    return a <= b ? (now >= a && now < b) : (now >= a || now < b);
  }

  radio(kind, text, facts, { force = false } = {}) {
    if (!this.R.enabled) return null;
    if (!force && this.inQuietHours()) return null;
    const last = this.radioLast[kind];
    if (!force && last != null && this.t - last < (this.R.repeatMinutes || 15) * 60) return null;
    this.radioLast[kind] = this.t;
    const b = { id: ++this.radioSeq, kind, text, at: Date.now(), prompt: `${TEXTS.promptIntro} ${facts}`, delivered: false };
    this.radioQueue = this.radioQueue.filter(o => o.delivered || o.kind !== kind);
    this.radioQueue.push(b);
    if (this.radioQueue.length > 100) this.radioQueue = this.radioQueue.slice(-100);
    this.event('radio', `Radio: ${text}`);
    this.saveNeeded = true;
    this.dirty = true;
    return b;
  }

  radioNext() {
    const b = this.radioQueue.find(o => !o.delivered);
    if (!b) return null;
    b.delivered = true;
    b.deliveredAt = Date.now();
    this.saveNeeded = true;
    this.dirty = true;
    return b;
  }

  gmRadio(text) {
    text = String(text || '').trim().slice(0, 400);
    if (!text) return null;
    return this.radio('gm-' + Date.now(), text, `Bericht van de spelleiding: ${text}`, { force: true });
  }

  radioChecks() {
    if (!this.R.enabled) return;
    const lim = (this.R.escapeUnattendedMinutes || 5) * 60;
    const loose = this.animals.filter(a => a.state === 'WANDER_OUTSIDE' && a.outSince != null && this.t - a.outSince >= lim);
    if (loose.length === 1) {
      const a = loose[0], pen = this.penById[a.pen];
      const min = Math.round((this.t - a.outSince) / 60), dir = this.directionFrom(pen.x, pen.z, a.x, a.z);
      const dier = this.speciesLabel(a.type);
      this.radio('escape', fill(pick(TEXTS.escape), { dier, minuten: min, richting: dir, hok: pen.naam, Hok: cap1(pen.naam) }),
        `Er loopt al ${min} minuten een ${dier} los bij ${pen.naam}, aan de ${dir}kant, en niemand reageert. Wie hem door de poort terugbrengt krijgt kroonkurken.`);
    } else if (loose.length > 1) {
      const min = Math.round(Math.max(...loose.map(a => this.t - a.outSince)) / 60);
      this.radio('escape', fill(pick(TEXTS.escapeMany), { aantal: loose.length, minuten: min }),
        `Er lopen ${loose.length} dieren los rond de hokken, de eerste al ${min} minuten, en niemand reageert.`);
    }
    if (this.inQuietHours()) { this.lastActive = this.t; return; }
    if (this.t - this.lastActive >= (this.R.idleMinutes || 45) * 60) {
      const ripe = this.fields.filter(f => this.fieldProgress(f) >= 1).map(f => this.label(f.cfg.crop).toLowerCase());
      const out = this.animals.filter(a => a.state !== 'GRAZE').length;
      const broken = this.activePens().filter(p => p.cond !== 'goed');
      const bits = [];
      if (ripe.length) bits.push(`De ${ripe.join(' en de ')} ${ripe.length > 1 ? 'staan' : 'staat'} rijp te verpieteren.`);
      if (out) bits.push(`Er ${out > 1 ? 'lopen' : 'loopt'} ${out} ${out > 1 ? 'dieren' : 'dier'} buiten het hek.`);
      for (const p of broken) bits.push(`${cap1(p.naam)} is ${p.cond}.`);
      const min = Math.round((this.t - this.lastActive) / 60);
      this.radio('idle', fill(pick(TEXTS.idle), { minuten: min, details: bits.join(' ') }).replace(/\s+/g, ' ').trim(),
        `Al ${min} minuten is niemand bij de hokken geweest. ${bits.join(' ')}`.trim());
    }
  }

  markActive() {
    const near = (this.R.nearMeters || 60);
    for (const p of this.onlinePosed()) {
      if (G.dist(p.pose.x, p.pose.z, this.center.x, this.center.z) <= near) { this.lastActive = this.t; return; }
    }
  }

  // ------------------------------------------------------------- tick
  tick(dt) {
    this.t += dt;
    this.randomEscapes(dt);
    for (const a of this.animals) this.tickAnimal(a, dt);
    this.markActive();
    const regen = ((this.W && this.W.regenPerHour) ?? 0.5) / 3600 * dt;
    for (const sct of this.sectors) {
      sct.stock = Math.min(1, sct.stock + regen);
      if (sct.stock > 0.4) sct.depletedSaid = false;
    }
    this.radioAcc = (this.radioAcc || 0) + dt;
    if (this.radioAcc >= 5) { this.radioAcc = 0; this.radioChecks(); }
    this.tickWildlife(dt);
    for (const f of this.fields) {
      const ripe = this.fieldProgress(f) >= 1;
      if (ripe && !f.wasRipe) this.event('ripe', `De ${this.label(f.cfg.crop).toLowerCase()} is rijp`, { field: f.idx });
      f.wasRipe = ripe;
    }
  }

  onlinePosed() { return [...this.players.values()].filter(p => p.online && p.pose); }

  luredBy(a, angle) {
    let best = null, bestD = Infinity;
    for (const p of this.onlinePosed()) {
      const d = G.dist(p.pose.x, p.pose.z, a.x, a.z);
      if (d > this.B.lureRangeMeters || d >= bestD) continue;
      if (G.flatAngleTo(p.pose, a.x, a.z) <= angle) { best = p; bestD = d; }
    }
    return best;
  }

  tickAnimal(a, dt) {
    const B = this.B, pen = this.penById[a.pen];
    if (!pen) return;
    const home = () => pen.active && this.inPen(pen, a.x, a.z);
    switch (a.state) {
      case 'GRAZE': {
        if (this.t < a.pauseUntil) break;
        if (!a.target || this.step(a, B.grazeSpeed, dt)) {
          a.target = this.randomInPen(pen);
          a.pauseUntil = this.t + G.rand(1, 3);
        }
        break;
      }
      case 'ESCAPE': {
        const arrived = this.step(a, B.escapeSpeed * a.speed, dt);
        if (a.escapeLeg === 0 && (arrived || a.blocked)) { a.escapeLeg = 1; a.target = { ...pen.gateOutside }; }
        if (!home() && !this.isInside(a.x, a.z)) {
          a.state = 'WANDER_OUTSIDE'; a.target = null; a.outSince = this.t;
          this.event('escape', `Een ${this.speciesLabel(a.type)} is uitgebroken bij ${pen.naam}!`, { animal: a.id, pen: pen.id });
        } else if (arrived && a.escapeLeg === 1) {
          a.target = this.outsideTarget(a);   // nog in een ander hok of tegen een hek: verder zoeken
        }
        break;
      }
      case 'WANDER_OUTSIDE': {
        if (home()) {   // vanzelf teruggelopen (kan bij een kapot hek)
          a.state = 'GRAZE'; a.target = null; a.outSince = null;
          a.immuneUntil = this.t + (B.reEscapeSeconds || 90) * 0.5;
          break;
        }
        const p = this.luredBy(a, B.lureAngleDeg);
        if (p) {
          a.state = 'FOLLOW'; a.followBy = p.id; a.lostFor = 0; a.hinted = false;
          a.outSince = this.t;
          this.msg(p, `De ${this.speciesLabel(a.type)} volgt je. Leid 'm door de poort terug in ${pen.naam}.`, 'good');
          break;
        }
        if (!a.target || this.step(a, B.grazeSpeed * a.speed, dt) || a.blocked) a.target = this.outsideTarget(a);
        break;
      }
      case 'FOLLOW': {
        const p = this.players.get(a.followBy);
        const ok = p && p.online && p.pose &&
          G.dist(p.pose.x, p.pose.z, a.x, a.z) <= B.lureRangeMeters &&
          G.flatAngleTo(p.pose, a.x, a.z) <= (B.lureKeepAngleDeg || B.lureAngleDeg * 2);
        a.lostFor = ok ? 0 : a.lostFor + dt;
        if (a.lostFor > (B.lureLoseSeconds || 3)) {
          if (p) this.msg(p, `Je bent de ${this.speciesLabel(a.type)} kwijt.`);
          a.state = 'WANDER_OUTSIDE'; a.followBy = null; a.target = null; a.outSince = this.t;
          break;
        }
        if (p && p.pose) {
          const g = G.gazeGround(p.pose, B.lureRangeMeters);
          if (g.hit) a.target = { x: g.x, z: g.z };
          else {
            const f = G.forward(p.pose);
            a.target = { x: p.pose.x + f.x * B.lureFollowDistance, z: p.pose.z + f.z * B.lureFollowDistance };
          }
        }
        this.step(a, B.followSpeed, dt);
        if (a.blocked && !a.hinted && p) {
          a.hinted = true;
          this.msg(p, `De ${this.speciesLabel(a.type)} staat tegen een hek — leid 'm naar de poort van ${pen.naam}.`);
        }
        const other = this.penAt(a.x, a.z);
        if (other && other !== pen && !a.wrongHinted && p) {
          a.wrongHinted = true;
          this.msg(p, `Dit is niet het goede hok — de ${this.speciesLabel(a.type)} hoort in ${pen.naam}.`);
        }
        if (home()) {
          a.state = 'GRAZE'; a.target = null; a.pauseUntil = this.t + 1; a.wrongHinted = false;
          a.immuneUntil = this.t + (B.reEscapeSeconds || 90) * G.rand(0.8, 1.5);
          a.outSince = null;
          this.radioLast.escape = null;
          this.returnedTotal++;
          const by = a.followBy; a.followBy = null;
          if (p && this.hasRole(p, this.cfg.rules.returnRole)) {
            this.give(p, this.cfg.rewards.returnAnimal || {});
            this.msg(p, `De ${this.speciesLabel(a.type)} is terug: ${this.itemsText(this.cfg.rewards.returnAnimal || {})}.`, 'good');
          }
          this.event('return', `${p ? p.name : 'Iemand'} bracht een ${this.speciesLabel(a.type)} terug in ${pen.naam}`, { by });
        }
        break;
      }
    }
  }

  // Dwaaldoel buiten alle hokken, in de buurt van het eigen hok
  outsideTarget(a) {
    const pen = this.penById[a.pen];
    const far = Math.max(pen.width, pen.depth) / 2 + this.B.wanderRadiusOutside;
    for (let i = 0; i < 40; i++) {
      const ang = G.rand(0, Math.PI * 2), r = G.rand(2, 6);
      const x = a.x + Math.cos(ang) * r, z = a.z + Math.sin(ang) * r;
      if (this.isInside(x, z)) continue;
      if (G.dist(x, z, pen.x, pen.z) > far) continue;
      // Niet dwars door een hok dwalen (anders loopt het via de poort vanzelf weer naar binnen)
      let through = false;
      for (let k = 1; k <= 6 && !through; k++) {
        if (this.isInside(a.x + (x - a.x) * k / 7, a.z + (z - a.z) * k / 7)) through = true;
      }
      if (through) continue;
      return { x, z };
    }
    const dx = a.x - pen.x, dz = a.z - pen.z, l = Math.hypot(dx, dz) || 1;
    return { x: a.x + dx / l * 2, z: a.z + dz / l * 2 };
  }

  // ------------------------------------------------------------- wild
  wildSpot(sector = null) {
    const c = this.center, W = this.W, n = this.sectors.length;
    for (let i = 0; i < 60; i++) {
      let a;
      if (sector) {
        const mid = sector.i * 2 * Math.PI / n, half = Math.PI / n;
        const compass = mid + G.rand(-half, half);
        a = Math.atan2(-Math.cos(compass), Math.sin(compass));
      } else a = G.rand(0, Math.PI * 2);
      const r = G.rand(W.spawnMinRadius, W.spawnMaxRadius);
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (!this.isInside(x, z)) return { x, z };
    }
    return { x: c.x + W.spawnMaxRadius, z: c.z };
  }

  wildCapacity() {
    const avg = this.sectors.reduce((s, x) => s + x.stock, 0) / (this.sectors.length || 1);
    return { max: Math.round(this.W.maxAlive * this.wildMult * avg), avg };
  }

  pickSpawnSector() {
    const min = this.W.minStockToSpawn ?? 0.1;
    const open = this.sectors.filter(s => s.stock >= min);
    if (!open.length) return null;
    const tot = open.reduce((a, s) => a + s.stock, 0);
    let r = Math.random() * tot;
    for (const s of open) { r -= s.stock; if (r <= 0) return s; }
    return open[open.length - 1];
  }

  flee(c, pose) {
    let dx = c.x - pose.x, dz = c.z - pose.z;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const x = c.x + dx * 8 + G.rand(-3, 3), z = c.z + dz * 8 + G.rand(-3, 3);
    const ok = !this.isInside(x, z) && G.dist(x, z, this.center.x, this.center.z) < this.W.spawnMaxRadius + 4;
    c.target = ok ? { x, z } : this.wildSpot();
    c.state = 'FLEE';
    c.fleeUntil = this.t + 3;
    c.pauseUntil = 0;
  }

  tickWildlife(dt) {
    const W = this.W;
    if (!W || !W.types || !W.types.length) return;
    this.critters = this.critters.filter(c => !(c.state === 'DEAD' && this.t - c.deadAt > 4));
    const alive = this.critters.filter(c => c.state !== 'DEAD');
    const cap = this.wildCapacity();
    const sector = (alive.length < cap.max && this.t >= this.nextSpawn) ? this.pickSpawnSector() : null;
    if (sector) {
      const total = W.types.reduce((s, t) => s + (t.weight || 1), 0);
      let r = Math.random() * total, def = W.types[0];
      for (const t of W.types) { r -= (t.weight || 1); if (r <= 0) { def = t; break; } }
      const s = this.wildSpot(sector);
      this.critters.push({ id: 'c' + this.nextId++, type: def.type, def, x: s.x, z: s.z, yaw: 0,
        state: 'WANDER', target: null, pauseUntil: 0, fleeUntil: 0 });
      const speed = Math.max(0.15, this.wildMult * cap.avg);
      this.nextSpawn = this.t + W.respawnSeconds * G.rand(0.6, 1.4) / speed;
    }
    const posed = this.onlinePosed();
    for (const c of alive) {
      if (c.state === 'WANDER') {
        for (const p of posed) {
          if (G.dist(p.pose.x, p.pose.z, c.x, c.z) < (c.def.skittishRange || 0)) { this.flee(c, p.pose); break; }
        }
      }
      if (c.state === 'FLEE' && this.t > c.fleeUntil) { c.state = 'WANDER'; c.target = null; }
      if (this.t < c.pauseUntil) continue;
      const v = c.state === 'FLEE' ? c.def.speed : c.def.speed * 0.35;
      if (!c.target || this.step(c, v, dt, false) || c.blocked) {
        c.target = this.wildSpot();
        if (c.state === 'WANDER') c.pauseUntil = this.t + G.rand(0.5, 2.5);
      }
    }
  }

  // ------------------------------------------------------------- uitvoer
  layout() {
    const c = this.cfg;
    return {
      anchor: c.anchor, fields: c.fields,
      pens: this.pens.map(p => ({ id: p.id, label: p.label, naam: p.naam, style: p.style, x: p.x, z: p.z,
        width: p.width, depth: p.depth, gate: p.gateSide, gateWidth: p.gateWidth || 2,
        coop: !!p.coop, pond: !!p.pond, hutch: !!p.hutch, species: p.species })),
      species: Object.fromEntries(Object.entries(this.S).map(([k, s]) => [k,
        { label: s.label, level: s.level || 1, color: s.color, scale: s.scale || 1, model: s.model || '' }])),
      wildTypes: Object.fromEntries((c.wildlife.types || []).map(t => [t.type,
        { label: t.label, color: t.color, scale: t.scale || 1, radius: t.radius, aimHeight: t.aimHeight }])),
      items: c.items,
      roles: Object.fromEntries(Object.entries(c.roles).map(([k, r]) => [k, { label: r.label, group: r.group || null, level: r.level || null }])),
      rules: c.rules,
      behavior: { maxShotRange: c.behavior.maxShotRange, lureRangeMeters: c.behavior.lureRangeMeters,
        actionRangeMeters: c.behavior.actionRangeMeters },
      turnIn: { buttonLabel: c.turnIn.buttonLabel, help: c.turnIn.help },
      theme: c.theme,
    };
  }

  snapshot() {
    return {
      t: 'snap',
      a: this.animals.map(a => {
        const ready = this.readyProducts(a);
        return { id: a.id, type: a.type, pen: a.pen, x: r2(a.x), z: r2(a.z), yaw: r2(a.yaw),
          s: STATE_CODE[a.state], f: a.followBy, m: ready.length ? ready : 0 };
      }),
      c: this.critters.map(c => ({ id: c.id, type: c.type, x: r2(c.x), z: r2(c.z), yaw: r2(c.yaw),
        d: c.state === 'DEAD' ? 1 : 0 })),
      f: this.fields.map(f => Math.floor(this.fieldProgress(f) * 100) / 100),
      p: this.onlinePosed().map(p => ({ id: p.id, name: p.name, x: r2(p.pose.x), z: r2(p.pose.z),
        yaw: r2(Math.atan2(p.pose.dx, p.pose.dz)), r: [...p.roles] })),
      pens: this.pens.map(p => ({ id: p.id, on: p.active ? 1 : 0, cond: p.cond })),
      st: {
        outside: this.animals.filter(a => a.state !== 'GRAZE').length,
        returned: this.returnedTotal,
        bad: this.activePens().filter(p => p.cond !== 'goed').map(p => ({ label: p.label, cond: p.cond })),
      },
    };
  }

  gmState() {
    const counts = this.herdCounts();
    return {
      t: 'gm-state',
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, online: p.online,
        roles: [...p.roles], inv: p.inv })).sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name)),
      turnins: this.turnins.slice(-100).reverse(),
      feed: this.feed.slice(-40).reverse(),
      roles: Object.fromEntries(Object.entries(this.cfg.roles).map(([k, r]) => [k, { label: r.label, code: r.code }])),
      items: this.cfg.items,
      species: Object.fromEntries(Object.entries(this.S).map(([k, s]) => [k, { label: s.label, level: s.level || 1 }])),
      pens: this.pens.map(p => ({
        id: p.id, label: p.label, style: p.style, active: p.active, cond: p.cond,
        capacity: p.capacity || 99, species: p.species, counts: counts[p.id],
        everyMin: (this.P.escapeEveryMinutes || {})[p.cond] || 0,
      })),
      animals: this.animals.filter(a => a.state !== 'GRAZE').map(a => ({ id: a.id, type: a.type,
        pen: (this.penById[a.pen] || {}).label, state: a.state,
        outFor: a.outSince != null ? Math.round(this.t - a.outSince) : null,
        followBy: a.followBy ? (this.players.get(a.followBy) || {}).name : null })),
      wild: {
        mult: this.wildMult,
        alive: this.critters.filter(c => c.state !== 'DEAD').length,
        max: this.wildCapacity().max,
        sectors: this.sectors.map(s => ({ name: s.name, stock: r2(s.stock), kills: s.kills })),
      },
      radio: {
        enabled: !!this.R.enabled,
        quiet: this.inQuietHours(),
        idleFor: Math.round(this.t - this.lastActive),
        queue: this.radioQueue.slice(-30).reverse(),
      },
    };
  }

  toJSON() {
    const counts = this.herdCounts();
    return {
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, roles: [...p.roles], inv: p.inv })),
      turnins: this.turnins,
      pens: this.pens.map(p => ({ id: p.id, active: p.active, cond: p.cond, animals: counts[p.id] })),
      wildMult: this.wildMult,
      sectors: this.sectors.map(s => ({ name: s.name, stock: s.stock, kills: s.kills })),
      radioQueue: this.radioQueue.slice(-50),
    };
  }
}

module.exports = { World };
