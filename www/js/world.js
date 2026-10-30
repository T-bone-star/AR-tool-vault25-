/*
 * Vault 25 — de gedeelde wereld tekenen
 *
 * De server beslist alles; deze telefoon tekent wat de server zegt en laat
 * het soepel bewegen tussen de updates (10x per seconde).
 *
 *   system "farm"         : camera-wiskunde (richten, blikpunt) + bijhouden
 *                           van alle entiteiten uit de snapshots
 *   component farm-builder: hek + akkers uit de layout van de server
 *   herd-animal / critter-view / avatar-view: één vee-dier / beest / speler
 */
(function () {
  const U = V25.utils;
  const net = V25.net;
  const _pos = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _quat = new THREE.Quaternion();
  const ease = (dt, k = 10) => 1 - Math.exp(-dt * k);
  function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return a + d * t;
  }

  AFRAME.registerSystem('farm', {
    init() {
      this.layout = null;
      this.farmEl = null;
      this.cameraEl = null;
      this.animals = new Map();
      this.critters = new Map();
      this.avatars = new Map();
      this.fields = [];
      this.followCount = 0;
      this.stats = { outside: -1, returned: -1 };
      document.addEventListener('net-snap', (e) => this.applySnap(e.detail));
    },

    // ---------------------------------------------- camera-wiskunde
    getCameraEl() {
      if (!this.cameraEl) this.cameraEl = document.querySelector('[camera]');
      return this.cameraEl;
    },
    // Camera in farm-lokale ruimte (incl. schaal en draaiing). Alleen uitlezen.
    getCameraGround() {
      const c = this.getCameraEl();
      _pos.set(0, 0, 0);
      if (c) c.object3D.getWorldPosition(_pos);
      if (this.farmEl) this.farmEl.object3D.worldToLocal(_pos);
      return _pos;
    },
    getCameraDir3() {
      const c = this.getCameraEl();
      _dir.set(0, 0, -1);
      if (c) { c.object3D.getWorldDirection(_dir); _dir.multiplyScalar(-1); }
      if (this.farmEl) { this.farmEl.object3D.getWorldQuaternion(_quat); _dir.applyQuaternion(_quat.invert()); }
      return _dir.normalize();
    },
    getCameraForward() {
      const d = this.getCameraDir3();
      const l = Math.hypot(d.x, d.z);
      return l < 1e-6 ? { x: 0, z: -1 } : { x: d.x / l, z: d.z / l };
    },
    gazeGround(maxDist) {
      const c = this.getCameraGround();
      const cx = c.x, cy = c.y, cz = c.z;
      const d = this.getCameraDir3();
      let x, z, hit = false, clamped = false;
      if (d.y < -0.03 && cy > 0) { const t = cy / -d.y; x = cx + d.x * t; z = cz + d.z * t; hit = true; }
      else { const f = this.getCameraForward(); x = cx + f.x * maxDist; z = cz + f.z * maxDist; }
      const h = U.dist2D(cx, cz, x, z);
      if (h > maxDist) { x = cx + (x - cx) * maxDist / h; z = cz + (z - cz) * maxDist / h; clamped = true; }
      return { x, z, hit, clamped };
    },
    aimAt(px, py, pz, radius) {
      const c = this.getCameraGround();
      const vx = px - c.x, vy = py - c.y, vz = pz - c.z;
      const d = Math.hypot(vx, vy, vz) || 1e-6;
      const dir = this.getCameraDir3();
      const dot = U.clamp((vx * dir.x + vy * dir.y + vz * dir.z) / d, -1, 1);
      const ang = Math.acos(dot) * 180 / Math.PI;
      const tol = Math.max(2.5, Math.atan(radius / d) * 180 / Math.PI * 1.3);
      return { d: Math.hypot(vx, vz), ang, hit: ang <= tol };
    },
    // Pose voor de server: positie + kijkrichting in farm-meters
    pose() {
      const c = this.getCameraGround();
      const x = c.x, y = c.y, z = c.z;
      const d = this.getCameraDir3();
      return { x, y, z, dx: d.x, dy: d.y, dz: d.z };
    },

    // ---------------------------------------------- snapshots toepassen
    applySnap(s) {
      if (!this.farmEl || !this.layout) return;
      const L = this.layout;

      this.sync(this.animals, s.a, (a) => {
        const el = document.createElement('a-entity');
        el.setAttribute('herd-animal', { type: a.type });
        return el;
      });
      this.sync(this.critters, s.c, (c) => {
        const el = document.createElement('a-entity');
        el.setAttribute('critter-view', { type: c.type });
        return el;
      });
      this.sync(this.avatars, s.p.filter(p => p.id !== net.id), (p) => {
        const el = document.createElement('a-entity');
        el.setAttribute('avatar-view', { name: p.name, roles: (p.r || []).join(',') });
        return el;
      });

      s.f.forEach((p, i) => { if (this.fields[i]) this.fields[i].progress = p; });

      // Volgt er een dier mij? (vizier amber)
      const mine = s.a.filter(a => a.f === net.id).length;
      if (mine !== this.followCount) {
        this.followCount = mine;
        document.dispatchEvent(new CustomEvent('follow-count', { detail: mine }));
      }
      if (s.st && (s.st.outside !== this.stats.outside || s.st.returned !== this.stats.returned)) {
        this.stats = s.st;
        document.dispatchEvent(new CustomEvent('farm-stats', { detail: s.st }));
      }
    },

    // Entiteiten aanmaken/bijwerken/weghalen op basis van de lijst van de server
    sync(map, list, make) {
      const seen = new Set();
      for (const d of list) {
        seen.add(d.id);
        let el = map.get(d.id);
        if (!el) {
          el = make(d);
          el.object3D.position.set(d.x, 0, d.z);
          el.object3D.rotation.y = d.yaw || 0;
          el.__net = d;
          this.farmEl.appendChild(el);
          map.set(d.id, el);
        }
        el.__net = d;
      }
      for (const [id, el] of map) {
        if (!seen.has(id)) { map.delete(id); if (el.parentNode) el.parentNode.removeChild(el); }
      }
    },
  });

  // ---------------------------------------------------------------- bouw
  AFRAME.registerComponent('farm-builder', {
    init() {
      const sys = this.el.sceneEl.systems.farm;
      sys.farmEl = this.el;
      sys.layout = net.layout;
      this.L = net.layout;
      this.buildGround();
      this.buildFence();
      this.buildFields(sys);
      setTimeout(() => this.el.sceneEl.emit('farm-ready'), 0);
    },

    buildGround() {
      const g = document.createElement('a-entity');
      g.setAttribute('geometry', 'primitive: circle; radius: 40');
      g.setAttribute('rotation', '-90 0 0');
      g.setAttribute('material', 'color: #2a2418; opacity: 0.18; transparent: true; side: double');
      g.setAttribute('position', '0 0.01 0');
      this.el.appendChild(g);
    },

    buildFence() {
      const E = this.L.enclosure, pts = E.points, h = E.postHeight || 1.1, sp = E.postSpacing || 2, gate = E.gate;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const isGate = gate && gate.sideIndex === i;
        const len = U.dist2D(a.x, a.z, b.x, b.z);
        const n = Math.max(1, Math.round(len / sp));
        for (let s = 1; s <= n; s++) {
          const t = s / n;
          if (isGate) { const gw = gate.widthMeters / len; if (t > 0.5 - gw / 2 && t < 0.5 + gw / 2) continue; }
          this.post(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, h);
        }
        for (const y of [h * 0.9, h * 0.5]) this.rope(a, b, y, isGate ? gate.widthMeters : 0);
      }
    },
    post(x, z, h) {
      const p = document.createElement('a-cylinder');
      p.setAttribute('radius', 0.05); p.setAttribute('height', h);
      p.setAttribute('position', `${x} ${h / 2} ${z}`);
      p.setAttribute('material', 'color: #6b4f2e; roughness: 1');
      this.el.appendChild(p);
    },
    rope(a, b, y, gap) {
      const make = (x1, z1, x2, z2) => {
        const r = document.createElement('a-cylinder');
        r.setAttribute('radius', 0.015);
        r.setAttribute('height', U.dist2D(x1, z1, x2, z2));
        r.setAttribute('material', 'color: #b8a06a; roughness: 1');
        r.setAttribute('position', `${(x1 + x2) / 2} ${y} ${(z1 + z2) / 2}`);
        r.setAttribute('rotation', `90 ${THREE.MathUtils.radToDeg(Math.atan2(x2 - x1, z2 - z1))} 0`);
        this.el.appendChild(r);
      };
      if (!gap) { make(a.x, a.z, b.x, b.z); return; }
      const len = U.dist2D(a.x, a.z, b.x, b.z), gw = gap / len;
      const lerp = (t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      const g1 = lerp(0.5 - gw / 2), g2 = lerp(0.5 + gw / 2);
      make(a.x, a.z, g1.x, g1.z);
      make(g2.x, g2.z, b.x, b.z);
    },

    buildFields(sys) {
      const colors = { tato: '#5a6e2f', mutfruit: '#7a2f4a', mais: '#9a8a2f', default: '#4f6b35' };
      this.L.fields.forEach((f) => {
        const soil = document.createElement('a-entity');
        soil.setAttribute('geometry', `primitive: plane; width: ${f.width}; height: ${f.depth}`);
        soil.setAttribute('rotation', '-90 0 0');
        soil.setAttribute('material', 'color: #3a2c1c; roughness: 1; side: double');
        soil.setAttribute('position', `${f.x} 0.02 ${f.z}`);
        this.el.appendChild(soil);
        const color = colors[f.crop] || colors.default;
        const rows = [];
        const n = f.rows || 5;
        for (let r = 0; r < n; r++) {
          const row = document.createElement('a-box');
          row.setAttribute('width', f.width * 0.92); row.setAttribute('height', 0.25); row.setAttribute('depth', 0.12);
          row.setAttribute('position', `${f.x} 0.14 ${f.z - f.depth / 2 + (f.depth / n) * (r + 0.5)}`);
          row.setAttribute('material', `color: ${color}; roughness: 1`);
          this.el.appendChild(row);
          rows.push(row);
        }
        sys.fields.push({ cfg: f, rows, color, progress: 0, stage: -1 });
      });
    },

    // Gewassen laten meegroeien met wat de server zegt
    tick() {
      for (const f of this.el.sceneEl.systems.farm.fields) {
        const s = 0.15 + 0.85 * f.progress;
        for (const r of f.rows) { r.object3D.scale.y = s; r.object3D.position.y = 0.02 + 0.125 * s; }
        const stage = f.progress >= 1 ? 2 : f.progress >= 0.5 ? 1 : 0;
        if (stage !== f.stage) {
          f.stage = stage;
          for (const r of f.rows) {
            r.setAttribute('material', {
              color: stage === 0 ? '#3d4a2a' : f.color,
              emissive: stage === 2 ? f.color : '#000000',
              emissiveIntensity: stage === 2 ? 0.45 : 0,
            });
          }
        }
      }
    },
  });

  // ---------------------------------------------------------------- vee
  AFRAME.registerComponent('herd-animal', {
    schema: { type: { type: 'string', default: 'brahmin' } },
    init() {
      const T = (net.layout.animalTypes || {})[this.data.type] || {};
      this.scale = T.scale || 1;
      this.aimHeight = 0.9 * this.scale;
      this.radius = 0.8 * this.scale;
      if (T.model) {
        const m = document.createElement('a-entity');
        m.setAttribute('gltf-model', T.model);
        this.el.appendChild(m);
      } else {
        (V25.models.livestock[this.data.type] || V25.models.livestock.brahmin)(this.el, T.color || '#caa472');
      }
      this.el.object3D.scale.setScalar(this.scale);
      this.bob = Math.random() * 6;
    },
    tick(t, dtMs) {
      const n = this.el.__net; if (!n) return;
      const dt = Math.min(dtMs / 1000, 0.1), o = this.el.object3D, k = ease(dt);
      o.position.x += (n.x - o.position.x) * k;
      o.position.z += (n.z - o.position.z) * k;
      o.rotation.y = lerpAngle(o.rotation.y, n.yaw, k);
      this.bob += dt * 6;
      o.position.y = Math.sin(this.bob) * 0.03;
    },
  });

  // ---------------------------------------------------------------- wild
  AFRAME.registerComponent('critter-view', {
    schema: { type: { type: 'string', default: 'radroach' } },
    init() {
      const T = (net.layout.wildTypes || {})[this.data.type] || {};
      this.T = T;
      const s = T.scale || 1;
      this.radius = (T.radius || 0.4) * s;
      this.aimHeight = (T.aimHeight || 0.2) * s;
      (V25.models.wild[this.data.type] || V25.models.wild.radroach)(this.el, T.color || '#5a3a1e');
      this.el.object3D.scale.setScalar(s);
      this.t = Math.random() * 6;
      this.deadFor = 0;
    },
    tick(t, dtMs) {
      const n = this.el.__net; if (!n) return;
      const dt = Math.min(dtMs / 1000, 0.1), o = this.el.object3D;
      if (n.d) {
        this.deadFor += dt;
        o.rotation.x = Math.PI / 2;
        o.position.y = this.deadFor > 2.5 ? this.aimHeight - (this.deadFor - 2.5) * 0.25 : this.aimHeight;
        return;
      }
      const k = ease(dt, 12);
      o.position.x += (n.x - o.position.x) * k;
      o.position.z += (n.z - o.position.z) * k;
      o.rotation.y = lerpAngle(o.rotation.y, n.yaw, k);
      this.t += dt;
      o.position.y = Math.abs(Math.sin(this.t * 14)) * 0.03;
    },
  });

  // ---------------------------------------------------------------- spelers
  AFRAME.registerComponent('avatar-view', {
    schema: { name: { type: 'string' }, roles: { type: 'string' } },
    init() {
      V25.models.avatar(this.el, this.data.name, this.data.roles.split(',').filter(Boolean));
      this.flash = document.createElement('a-sphere');
      this.flash.setAttribute('radius', 0.15);
      this.flash.setAttribute('position', '0.6 1.32 0');
      this.flash.setAttribute('material', 'color: #fff3c4; emissive: #fff3c4; emissiveIntensity: 1');
      this.flash.setAttribute('visible', false);
      this.el.appendChild(this.flash);
      this.flashUntil = 0;
      this.onShot = (e) => {
        if (this.el.__net && e.detail.by === this.el.__net.id) {
          this.flashUntil = performance.now() + 150;
          this.flash.setAttribute('visible', true);
        }
      };
      document.addEventListener('net-shot', this.onShot);
    },
    remove() { document.removeEventListener('net-shot', this.onShot); },
    tick(t, dtMs) {
      const n = this.el.__net; if (!n) return;
      const dt = Math.min(dtMs / 1000, 0.1), o = this.el.object3D, k = ease(dt, 8);
      o.position.x += (n.x - o.position.x) * k;
      o.position.z += (n.z - o.position.z) * k;
      o.rotation.y = lerpAngle(o.rotation.y, n.yaw - Math.PI / 2, k);
      if (this.flashUntil && performance.now() > this.flashUntil) {
        this.flashUntil = 0;
        this.flash.setAttribute('visible', false);
      }
    },
  });
})();
