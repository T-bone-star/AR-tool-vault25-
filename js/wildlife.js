/*
 * Vault 25 AR Farm — wild om op te jagen
 *
 *   system "wildlife"  : laat wild verschijnen rond de boerderij (buiten het hek)
 *   component "critter": één beest — dwaalt, schrikt, vlucht, sneuvelt, levert buit
 *
 * Schieten zelf gebeurt via interact.js (richten + actieknop).
 */
(function () {
  const U = V25.utils;
  const CFG = window.VAULT25_CONFIG;
  const B = CFG.behavior;
  const W = CFG.wildlife;
  if (!W || !W.types || !W.types.length) return;

  function box(parent, w, h, d, x, y, z, color) {
    const e = document.createElement('a-box');
    e.setAttribute('width', w); e.setAttribute('height', h); e.setAttribute('depth', d);
    e.setAttribute('position', `${x} ${y} ${z}`);
    e.setAttribute('material', `color: ${color}; roughness: 1`);
    parent.appendChild(e);
  }

  // Blok-modellen; kijken langs +x (net als het vee).
  const MODELS = {
    radroach(el, c) {
      box(el, 0.55, 0.14, 0.32, 0, 0.12, 0, c);              // schild
      box(el, 0.16, 0.10, 0.20, 0.33, 0.12, 0, '#3a2412');   // kop
      box(el, 0.30, 0.02, 0.02, 0.52, 0.17, 0.06, '#2a1a0c'); // voelsprieten
      box(el, 0.30, 0.02, 0.02, 0.52, 0.17, -0.06, '#2a1a0c');
      for (const x of [-0.15, 0, 0.15]) box(el, 0.03, 0.08, 0.46, x, 0.04, 0, '#2a1a0c'); // poten
    },
    molerat(el, c) {
      box(el, 0.70, 0.30, 0.35, 0, 0.24, 0, c);
      box(el, 0.25, 0.20, 0.25, 0.45, 0.22, 0, c);           // snuit
      box(el, 0.04, 0.10, 0.12, 0.58, 0.10, 0, '#f2ead8');   // tanden
      for (const [x, z] of [[-0.25, 0.15], [0.25, 0.15], [-0.25, -0.15], [0.25, -0.15]])
        box(el, 0.07, 0.12, 0.07, x, 0.06, z, '#5b4a30');
    },
    gecko(el, c) {
      box(el, 0.70, 0.22, 0.26, 0, 0.26, 0, c);
      box(el, 0.30, 0.20, 0.24, 0.48, 0.32, 0, c);           // kop
      box(el, 0.60, 0.10, 0.10, -0.62, 0.22, 0, c);          // staart
      box(el, 0.05, 0.05, 0.05, 0.62, 0.38, 0.08, '#ffcf3c'); // ogen
      box(el, 0.05, 0.05, 0.05, 0.62, 0.38, -0.08, '#ffcf3c');
      for (const [x, z] of [[-0.25, 0.16], [0.25, 0.16], [-0.25, -0.16], [0.25, -0.16]])
        box(el, 0.07, 0.16, 0.07, x, 0.08, z, '#4a5a2a');
    },
  };

  // Willekeurige plek in de "wildring" rond de boerderij, buiten het hek.
  function wildSpot(sys) {
    const c = sys.center;
    for (let i = 0; i < 40; i++) {
      const a = U.rand(0, Math.PI * 2);
      const r = U.rand(W.spawnMinRadius, W.spawnMaxRadius);
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (!sys.isInside(x, z)) return { x, z };
    }
    return { x: c.x + W.spawnMaxRadius, z: c.z };
  }

  AFRAME.registerComponent('critter', {
    schema: { type: { type: 'string', default: 'radroach' } },

    init() {
      this.sys = this.el.sceneEl.systems.farm;
      this.def = W.types.find(t => t.type === this.data.type) || W.types[0];
      this.state = 'WANDER';   // WANDER | FLEE | DEAD
      this.target = null;
      this.t = 0;
      this.pauseUntil = 0;
      this.fleeUntil = 0;
      this.deadFor = 0;
      (MODELS[this.def.model || this.def.type] || MODELS.radroach)(this.el, this.def.color);
      const s = this.def.scale || 1;
      this.el.object3D.scale.setScalar(s);
      this.radius = (this.def.radius || 0.4) * s;
      this.aimHeight = (this.def.aimHeight || 0.2) * s;
      this.sys.critters.push(this);
    },

    remove() {
      const i = this.sys.critters.indexOf(this);
      if (i >= 0) this.sys.critters.splice(i, 1);
    },

    tick(time, dtMs) {
      const dt = Math.min(dtMs / 1000, 0.1);
      this.t += dt;
      const p = this.el.object3D.position;

      if (this.state === 'DEAD') {
        this.deadFor += dt;
        if (this.deadFor > 2.5) p.y -= dt * 0.25;        // zakt weg in de grond
        if (this.deadFor > 4 && this.el.parentNode) this.el.parentNode.removeChild(this.el);
        return;
      }

      const cam = this.sys.getCameraGround();
      const camDist = U.dist2D(cam.x, cam.z, p.x, p.z);
      if (this.state === 'WANDER' && camDist < (this.def.skittishRange || 0)) this.flee();
      if (this.state === 'FLEE' && this.t > this.fleeUntil) {
        this.state = 'WANDER'; this.target = null;
      }

      // Kriebelende loopbeweging
      p.y = Math.abs(Math.sin(this.t * 14)) * 0.03;

      if (this.t < this.pauseUntil) return;
      const speed = this.state === 'FLEE' ? this.def.speed : this.def.speed * 0.35;
      if (!this.target || this.moveTo(speed, dt)) {
        if (this.state === 'FLEE') { this.flee(); return; }
        this.target = wildSpot(this.sys);
        this.pauseUntil = this.t + U.rand(0.5, 2.5);
      }
    },

    // Weg van de speler, maar niet het hek in en niet de wereld uit.
    flee() {
      const p = this.el.object3D.position;
      const cam = this.sys.getCameraGround();
      let dx = p.x - cam.x, dz = p.z - cam.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      const x = p.x + dx * 8 + U.rand(-3, 3), z = p.z + dz * 8 + U.rand(-3, 3);
      const c = this.sys.center;
      const ok = !this.sys.isInside(x, z) &&
        U.dist2D(x, z, c.x, c.z) < W.spawnMaxRadius + 4;
      this.target = ok ? { x, z } : wildSpot(this.sys);
      this.state = 'FLEE';
      this.fleeUntil = this.t + 3;
      this.pauseUntil = 0;
    },

    moveTo(v, dt) {
      const p = this.el.object3D.position;
      const d = U.dist2D(p.x, p.z, this.target.x, this.target.z);
      if (d < 0.25) return true;
      const step = Math.min(v * dt, d);
      const nx = (this.target.x - p.x) / d, nz = (this.target.z - p.z) / d;
      const x1 = p.x + nx * step, z1 = p.z + nz * step;
      if (this.sys.isInside(x1, z1)) { this.target = null; return false; } // wild blijft buiten
      p.x = x1; p.z = z1;
      this.el.object3D.rotation.y = Math.atan2(nx, nz) - Math.PI / 2;
      return false;
    },

    // Wordt aangeroepen door interact.js. d = afstand in farm-meters.
    takeShot(d) {
      if (this.state === 'DEAD') return false;
      const base = this.def.hitChance != null ? this.def.hitChance : 0.85;
      const chance = d > B.maxShotRange ? 0 : base * (1 - 0.4 * d / B.maxShotRange);
      if (Math.random() < chance) { this.die(); return true; }
      this.flee();
      this.el.emit('critter-missed', { label: this.def.label }, true);
      return false;
    },

    die() {
      this.state = 'DEAD';
      this.deadFor = 0;
      this.el.object3D.rotation.x = Math.PI / 2;   // valt om
      this.el.object3D.position.y = this.aimHeight;
      const loot = this.def.loot || {};
      for (const k in loot) V25.inv.add(k, loot[k]);
      this.el.emit('critter-killed', { label: this.def.label, loot }, true);
    },
  });

  AFRAME.registerSystem('wildlife', {
    init() {
      this.next = performance.now() / 1000 + (W.firstSpawnSeconds || 3);
    },
    tick() {
      const sys = this.el.systems.farm;
      if (!sys || !sys.farmEl) return;
      const t = performance.now() / 1000;
      const alive = sys.critters.filter(c => c.state !== 'DEAD').length;
      if (alive < W.maxAlive && t >= this.next) {
        this.spawn(sys);
        this.next = t + W.respawnSeconds * U.rand(0.6, 1.4);
      }
    },
    spawn(sys) {
      const total = W.types.reduce((a, t) => a + (t.weight || 1), 0);
      let r = Math.random() * total, def = W.types[0];
      for (const t of W.types) { r -= (t.weight || 1); if (r <= 0) { def = t; break; } }
      const s = wildSpot(sys);
      const el = document.createElement('a-entity');
      el.setAttribute('position', `${s.x} 0 ${s.z}`);
      el.setAttribute('critter', { type: def.type });
      sys.farmEl.appendChild(el);
    },
  });
})();
