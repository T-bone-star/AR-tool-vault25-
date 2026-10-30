'use strict';
/*
 * De gedeelde wereld. De server is de enige die beslist:
 *   - waar vee en wild zijn, wat ze doen;
 *   - wie iets als EERSTE oogst, melkt of raakt (de rest krijgt "te laat");
 *   - wie welke rol heeft en wat er in elke tas zit.
 * Telefoons sturen alleen hun camera-pose en "ik wil X doen".
 *
 * Geen netwerkcode hier: alles gaat via this.emit(to, msg), zodat dit los
 * te testen is. to = speler-id | 'all' | 'gm'.
 */
const G = require('./geo');

const STATE_CODE = { GRAZE: 'g', ESCAPE: 'e', WANDER_OUTSIDE: 'w', FOLLOW: 'f' };
const CODE_CHARS = 'ACDEFGHJKMNPQRTUVWXY3479';
const r2 = (v) => Math.round(v * 100) / 100;

class World {
  constructor(cfg, saved = {}, emit = () => {}) {
    this.cfg = cfg;
    this.B = cfg.behavior;
    this.W = cfg.wildlife;
    this.emit = emit;
    this.t = 0;
    this.enclosure = cfg.enclosure.points;
    this.center = G.centroid(this.enclosure);
    this.initGate();
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
    this.feed = [];
    this.dirty = true;        // GM-overzicht moet bijgewerkt worden
    this.saveNeeded = false;  // tassen/rollen/inleveringen gewijzigd
    this.spawnWorld();
  }

  // ------------------------------------------------------------- opbouw
  initGate() {
    const g = this.cfg.enclosure.gate;
    if (!g) return;
    const pts = this.enclosure;
    const a = pts[g.sideIndex], b = pts[(g.sideIndex + 1) % pts.length];
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    let dx = this.center.x - mid.x, dz = this.center.z - mid.z;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    this.gateMid = mid;
    this.gateHalf = g.widthMeters / 2;
    this.gateInside = { x: mid.x + dx * 1.5, z: mid.z + dz * 1.5 };
    this.gateOutside = { x: mid.x - dx * 4, z: mid.z - dz * 4 };
  }

  spawnWorld() {
    this.animals = [];
    let slot = 0;
    for (const def of this.cfg.animals) {
      for (let i = 0; i < def.count; i++) {
        const p = G.randomPointInPolygon(this.enclosure);
        const canEscape = i < (def.escapes || 0) && !!this.gateMid;
        this.animals.push({
          id: 'a' + this.nextId++, type: def.type, scale: def.scale || 1, product: def.product || '',
          x: p.x, z: p.z, yaw: G.rand(0, 6.28), state: 'GRAZE', target: null, pauseUntil: 0,
          escapeAt: canEscape ? this.B.escapeAfterSeconds + (slot++) * this.B.escapeIntervalSeconds : Infinity,
          escapeLeg: 0, lastMilk: -1e9, followBy: null, lostFor: 0, blocked: false, hinted: false,
        });
      }
    }
    this.fields = this.cfg.fields.map((f, i) => ({
      idx: i, cfg: f, plantedAt: this.t - (f.growSeconds || 90) * G.rand(0.4, 0.9),
    }));
    this.critters = [];
    this.nextSpawn = this.t + (this.W ? this.W.firstSpawnSeconds || 3 : Infinity);
  }

  // ------------------------------------------------------------- helpers
  isInside(x, z) { return G.pointInPolygon(x, z, this.enclosure); }
  nearGate(x, z) {
    return !!this.gateMid && G.dist(x, z, this.gateMid.x, this.gateMid.z) < this.gateHalf + 0.6;
  }
  fenceAllows(x0, z0, x1, z1) {
    if (this.isInside(x0, z0) === this.isInside(x1, z1)) return true;
    return this.nearGate(x0, z0) || this.nearGate(x1, z1);
  }
  fieldProgress(f) { return G.clamp((this.t - f.plantedAt) / (f.cfg.growSeconds || 90), 0, 1); }
  label(item) { return (this.cfg.items[item] && this.cfg.items[item].label) || item; }
  hasRole(p, role) { return !role || p.roles.has(role); }
  roleLabel(role) { return (this.cfg.roles[role] && this.cfg.roles[role].label) || role; }

  // Beweeg e naar e.target. true = aangekomen. Hek is vast, behalve bij de poort.
  // insideAllowed=false: mag het hek helemaal niet in (wild).
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
    if (kind === 'milk') return this.milk(p, target);
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

  milk(p, animalId) {
    const a = this.animals.find(a => a.id === animalId);
    if (!a) return;
    if (!this.hasRole(p, this.cfg.rules.milkRole)) {
      this.msg(p, `Alleen een ${this.roleLabel(this.cfg.rules.milkRole).toLowerCase()} kan melken.`, 'bad');
      return;
    }
    if (!p.pose || G.dist(p.pose.x, p.pose.z, a.x, a.z) > this.B.actionRangeMeters) {
      this.msg(p, 'Te ver weg om te melken.'); return;
    }
    if (!this.canMilk(a)) { this.msg(p, `Deze ${a.type} is net gemolken.`); return; }
    a.lastMilk = this.t;
    this.give(p, { [a.product]: 1 });
    this.msg(p, `1 ${this.label(a.product).toLowerCase()}.`, 'good');
    this.event('milk', `${p.name} molk een ${a.type}`, { by: p.id });
  }

  canMilk(a) {
    return !!a.product && a.state === 'GRAZE' && this.isInside(a.x, a.z) &&
      this.t - a.lastMilk >= this.B.milkCooldownSeconds;
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
    this.spawnWorld();
    this.event('gm', 'De paddock is opnieuw ingericht.');
  }

  // ------------------------------------------------------------- tick
  tick(dt) {
    this.t += dt;
    for (const a of this.animals) this.tickAnimal(a, dt);
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
    const B = this.B;
    switch (a.state) {
      case 'GRAZE': {
        if (this.t >= a.escapeAt) {
          a.state = 'ESCAPE'; a.escapeLeg = 0; a.target = { ...this.gateInside }; break;
        }
        if (this.t < a.pauseUntil) break;
        if (!a.target || this.step(a, B.grazeSpeed, dt)) {
          a.target = G.randomPointInPolygon(this.enclosure);
          a.pauseUntil = this.t + G.rand(1, 3);
        }
        break;
      }
      case 'ESCAPE': {
        const arrived = this.step(a, B.escapeSpeed, dt);
        if (a.escapeLeg === 0 && (arrived || a.blocked)) { a.escapeLeg = 1; a.target = { ...this.gateOutside }; }
        if (!this.isInside(a.x, a.z)) {
          a.state = 'WANDER_OUTSIDE'; a.target = null;
          this.event('escape', `Een ${a.type} is uitgebroken!`, { animal: a.id });
        }
        break;
      }
      case 'WANDER_OUTSIDE': {
        const p = this.luredBy(a, B.lureAngleDeg);
        if (p) {
          a.state = 'FOLLOW'; a.followBy = p.id; a.lostFor = 0; a.hinted = false;
          this.msg(p, `De ${a.type} volgt je. Leid 'm door de opening terug.`, 'good');
          break;
        }
        if (!a.target || this.step(a, B.grazeSpeed, dt) || a.blocked) a.target = this.outsideTarget(a);
        break;
      }
      case 'FOLLOW': {
        const p = this.players.get(a.followBy);
        const ok = p && p.online && p.pose &&
          G.dist(p.pose.x, p.pose.z, a.x, a.z) <= B.lureRangeMeters &&
          G.flatAngleTo(p.pose, a.x, a.z) <= (B.lureKeepAngleDeg || B.lureAngleDeg * 2);
        a.lostFor = ok ? 0 : a.lostFor + dt;
        if (a.lostFor > (B.lureLoseSeconds || 3)) {
          if (p) this.msg(p, `Je bent de ${a.type} kwijt.`);
          a.state = 'WANDER_OUTSIDE'; a.followBy = null; a.target = null;
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
          this.msg(p, `De ${a.type} staat tegen het hek — leid 'm naar de opening.`);
        }
        if (this.isInside(a.x, a.z)) {
          a.state = 'GRAZE'; a.target = null; a.pauseUntil = this.t + 1;
          a.escapeAt = this.t + (B.reEscapeSeconds || 90) * G.rand(0.8, 1.5);
          this.returnedTotal++;
          const by = a.followBy; a.followBy = null;
          if (p && this.hasRole(p, this.cfg.rules.returnRole)) {
            this.give(p, this.cfg.rewards.returnAnimal || {});
            this.msg(p, `De ${a.type} is terug: ${this.itemsText(this.cfg.rewards.returnAnimal || {})}.`, 'good');
          }
          this.event('return', `${p ? p.name : 'Iemand'} bracht een ${a.type} terug`, { by });
        }
        break;
      }
    }
  }

  outsideTarget(a) {
    for (let i = 0; i < 30; i++) {
      const ang = G.rand(0, Math.PI * 2), r = G.rand(2, 6);
      const x = a.x + Math.cos(ang) * r, z = a.z + Math.sin(ang) * r;
      if (this.isInside(x, z)) continue;
      if (G.dist(x, z, this.center.x, this.center.z) > this.B.wanderRadiusOutside) continue;
      return { x, z };
    }
    const dx = a.x - this.center.x, dz = a.z - this.center.z, l = Math.hypot(dx, dz) || 1;
    return { x: a.x + dx / l * 2, z: a.z + dz / l * 2 };
  }

  // ------------------------------------------------------------- wild
  wildSpot() {
    const c = this.center, W = this.W;
    for (let i = 0; i < 40; i++) {
      const a = G.rand(0, Math.PI * 2), r = G.rand(W.spawnMinRadius, W.spawnMaxRadius);
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (!this.isInside(x, z)) return { x, z };
    }
    return { x: c.x + W.spawnMaxRadius, z: c.z };
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
    if (alive.length < W.maxAlive && this.t >= this.nextSpawn) {
      const total = W.types.reduce((s, t) => s + (t.weight || 1), 0);
      let r = Math.random() * total, def = W.types[0];
      for (const t of W.types) { r -= (t.weight || 1); if (r <= 0) { def = t; break; } }
      const s = this.wildSpot();
      this.critters.push({ id: 'c' + this.nextId++, type: def.type, def, x: s.x, z: s.z, yaw: 0,
        state: 'WANDER', target: null, pauseUntil: 0, fleeUntil: 0 });
      this.nextSpawn = this.t + W.respawnSeconds * G.rand(0.6, 1.4);
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
      anchor: c.anchor, enclosure: c.enclosure, fields: c.fields,
      animalTypes: Object.fromEntries(c.animals.map(a => [a.type, { color: a.color, scale: a.scale || 1, product: a.product || '', model: a.model || '' }])),
      wildTypes: Object.fromEntries((c.wildlife.types || []).map(t => [t.type,
        { label: t.label, color: t.color, scale: t.scale || 1, radius: t.radius, aimHeight: t.aimHeight }])),
      items: c.items,
      roles: Object.fromEntries(Object.entries(c.roles).map(([k, r]) => [k, { label: r.label }])),
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
      a: this.animals.map(a => ({ id: a.id, type: a.type, x: r2(a.x), z: r2(a.z), yaw: r2(a.yaw),
        s: STATE_CODE[a.state], f: a.followBy, m: this.canMilk(a) ? 1 : 0 })),
      c: this.critters.map(c => ({ id: c.id, type: c.type, x: r2(c.x), z: r2(c.z), yaw: r2(c.yaw),
        d: c.state === 'DEAD' ? 1 : 0 })),
      // Naar BENEDEN afronden: 0,995 mag op de telefoon nooit als 'rijp' (1,00) verschijnen
      f: this.fields.map(f => Math.floor(this.fieldProgress(f) * 100) / 100),
      p: this.onlinePosed().map(p => ({ id: p.id, name: p.name, x: r2(p.pose.x), z: r2(p.pose.z),
        yaw: r2(Math.atan2(p.pose.dx, p.pose.dz)), r: [...p.roles] })),
      st: { outside: this.animals.filter(a => !this.isInside(a.x, a.z)).length, returned: this.returnedTotal },
    };
  }

  gmState() {
    return {
      t: 'gm-state',
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, online: p.online,
        roles: [...p.roles], inv: p.inv })).sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name)),
      turnins: this.turnins.slice(-100).reverse(),
      feed: this.feed.slice(-40).reverse(),
      roles: Object.fromEntries(Object.entries(this.cfg.roles).map(([k, r]) => [k, { label: r.label, code: r.code }])),
      items: this.cfg.items,
    };
  }

  toJSON() {
    return {
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, roles: [...p.roles], inv: p.inv })),
      turnins: this.turnins,
    };
  }
}

module.exports = { World };
