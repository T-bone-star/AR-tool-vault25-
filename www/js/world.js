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

      // Hek laten zien zoals de server zegt: goed / beschadigd / kapot
      const fb = this.farmEl.components && this.farmEl.components['farm-builder'];
      if (fb && fb.setPens && s.pens) fb.setPens(s.pens);

      // Volgt er een dier mij? (vizier amber)
      const mine = s.a.filter(a => a.f === net.id).length;
      if (mine !== this.followCount) {
        this.followCount = mine;
        document.dispatchEvent(new CustomEvent('follow-count', { detail: mine }));
      }
      if (s.st && (s.st.outside !== this.stats.outside || s.st.returned !== this.stats.returned || JSON.stringify(s.st.bad) !== JSON.stringify(this.stats.bad))) {
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
      this.buildPens();
      this.buildFields(sys);
      setTimeout(() => this.el.sceneEl.emit('farm-ready'), 0);
    },

    // Per hok: zichtbaar als het gebouwd is, gaten in het hek bij schade
    setPens(list) {
      if (!this.penGroups) return;
      for (const st of list || []) {
        const g = this.penGroups[st.id];
        if (!g) continue;
        const on = !!st.on;
        if (g.on !== on) { g.on = on; g.el.object3D.visible = on; }
        if (g.cond !== st.cond) {
          g.cond = st.cond;
          const gone = st.cond === 'kapot' ? 0.66 : st.cond === 'beschadigd' ? 0.25 : 0;
          for (const seg of g.segs) seg.object3D.visible = seg.__break >= gone;
        }
      }
    },

    buildGround() {
      const g = document.createElement('a-entity');
      g.setAttribute('geometry', 'primitive: circle; radius: 45');
      g.setAttribute('rotation', '-90 0 0');
      g.setAttribute('material', 'color: #2a2418; opacity: 0.18; transparent: true; side: double');
      g.setAttribute('position', '0 0.01 0');
      this.el.appendChild(g);
    },

    // Hektypes: hoogte paal, afstand tussen palen, en wat er tussen de palen hangt
    buildPens() {
      this.penGroups = {};
      for (const pen of this.L.pens || []) {
        const el = document.createElement('a-entity');
        el.object3D.visible = false;           // pas zichtbaar als de server zegt dat het gebouwd is
        this.el.appendChild(el);
        const g = { el, segs: [], on: false, cond: null, pen };
        this.penGroups[pen.id] = g;
        this.buildPenFence(pen, g);
        if (pen.coop) this.buildCoop(pen, el);
        if (pen.pond) this.buildPond(pen, el);
        if (pen.hutch) this.buildHutch(pen, el);
      }
    },

    buildPenFence(pen, g) {
      const STY = {
        touw: { h: 1.1, sp: 2.0, post: '#6b4f2e', r: 0.05 },
        hek:  { h: 1.0, sp: 2.0, post: '#5e4428', r: 0.06 },
        gaas: { h: 1.2, sp: 1.5, post: '#7a6a55', r: 0.04 },
        ren:  { h: 0.6, sp: 1.0, post: '#7a6a55', r: 0.03 },
        hoog: { h: 2.2, sp: 2.5, post: '#4f3c24', r: 0.06 },
      }[pen.style] || { h: 1.1, sp: 2, post: '#6b4f2e', r: 0.05 };
      const x0 = pen.x - pen.width / 2, x1 = pen.x + pen.width / 2, z0 = pen.z - pen.depth / 2, z1 = pen.z + pen.depth / 2;
      const sides = { noord: [[x0, z0], [x1, z0]], oost: [[x1, z0], [x1, z1]], zuid: [[x1, z1], [x0, z1]], west: [[x0, z1], [x0, z0]] };
      for (const [side, [[ax, az], [bx, bz]]] of Object.entries(sides)) {
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.round(len / STY.sp));
        const gw = side === pen.gate ? (pen.gateWidth || 2) / len : 0;
        const skip = (t0, t1) => gw && t1 > 0.5 - gw / 2 && t0 < 0.5 + gw / 2;
        for (let s = 1; s <= n; s++) {
          const t = s / n;
          if (gw && t > 0.5 - gw / 2 && t < 0.5 + gw / 2) continue;
          this.post(g.el, ax + (bx - ax) * t, az + (bz - az) * t, STY.h, STY.r, STY.post);
        }
        if (gw) {   // poortpalen
          for (const t of [0.5 - gw / 2, 0.5 + gw / 2]) this.post(g.el, ax + (bx - ax) * t, az + (bz - az) * t, STY.h + 0.1, STY.r * 1.4, STY.post);
        }
        for (let s = 0; s < n; s++) {
          const t0 = s / n, t1 = (s + 1) / n;
          // Stukken links en rechts van de poortopening laten staan
          const pieces = !skip(t0, t1) ? [[t0, t1]]
            : [[t0, Math.min(t1, 0.5 - gw / 2)], [Math.max(t0, 0.5 + gw / 2), t1]].filter(([u, v]) => v - u > 0.02);
          for (const [u, v] of pieces) {
            const p0 = { x: ax + (bx - ax) * u, z: az + (bz - az) * u }, p1 = { x: ax + (bx - ax) * v, z: az + (bz - az) * v };
            g.segs.push(this.span(g.el, pen.style, p0, p1, STY.h, g.segs.length));
          }
        }
      }
    },

    post(parent, x, z, h, r, color) {
      const p = document.createElement('a-cylinder');
      p.setAttribute('radius', r); p.setAttribute('height', h);
      p.setAttribute('position', `${x} ${h / 2} ${z}`);
      p.setAttribute('material', `color: ${color}; roughness: 1`);
      parent.appendChild(p);
    },

    // Eén stuk hek tussen twee palen, als groep (zodat het in z'n geheel kan "breken")
    span(parent, style, a, b, h, idx) {
      const seg = document.createElement('a-entity');
      parent.appendChild(seg);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const yaw = THREE.MathUtils.radToDeg(Math.atan2(b.z - a.z, b.x - a.x));
      const bar = (y, thick, color, height = thick) => {
        const e = document.createElement('a-box');
        e.setAttribute('width', len); e.setAttribute('height', height); e.setAttribute('depth', thick);
        e.setAttribute('position', `${mx} ${y} ${mz}`);
        e.setAttribute('rotation', `0 ${-yaw} 0`);
        e.setAttribute('material', `color: ${color}; roughness: 1`);
        seg.appendChild(e);
      };
      const mesh = (hh, color) => {
        const e = document.createElement('a-plane');
        e.setAttribute('width', len); e.setAttribute('height', hh);
        e.setAttribute('position', `${mx} ${hh / 2} ${mz}`);
        e.setAttribute('rotation', `0 ${-yaw} 0`);
        e.setAttribute('material', `color: ${color}; opacity: 0.28; transparent: true; side: double`);
        seg.appendChild(e);
      };
      if (style === 'hek') { for (const y of [0.3, 0.6, 0.9]) bar(y, 0.04, '#8a6a42', 0.1); }
      else if (style === 'gaas') { mesh(h, '#c9d0d0'); bar(h, 0.03, '#7a6a55'); }
      else if (style === 'ren') { mesh(h, '#c9d0d0'); bar(h, 0.03, '#7a6a55'); }
      else if (style === 'hoog') { for (const y of [0.4, 0.9, 1.4, 1.9]) bar(y, 0.015, '#a8a8a0'); }
      else { for (const y of [h * 0.9, h * 0.5]) bar(y, 0.03, '#b8a06a'); }    // touw
      seg.__break = (idx * 0.618034) % 1;   // vaste breekvolgorde
      return seg;
    },

    // Kippenhok-huisje in de hoek, met loopplank
    buildCoop(pen, parent) {
      const x = pen.x - pen.width / 2 + 1.0, z = pen.z - pen.depth / 2 + 0.9;
      const add = (tag, attrs) => { const e = document.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
      add('a-box', { width: 1.6, height: 1.0, depth: 1.2, position: `${x} 0.75 ${z}`, material: 'color: #8a5a3a; roughness: 1' });
      add('a-box', { width: 1.8, height: 0.08, depth: 1.4, position: `${x} 1.32 ${z}`, rotation: '0 0 8', material: 'color: #5a3a28; roughness: 1' });
      for (const [dx, dz] of [[-0.7, -0.5], [0.7, -0.5], [-0.7, 0.5], [0.7, 0.5]]) add('a-cylinder', { radius: 0.04, height: 0.25, position: `${x + dx} 0.12 ${z + dz}`, material: 'color: #4a3020' });
      add('a-box', { width: 0.22, height: 0.3, depth: 0.04, position: `${x + 0.3} 0.6 ${z + 0.61}`, material: 'color: #1a120a' });
      add('a-box', { width: 0.24, height: 0.04, depth: 0.7, position: `${x + 0.3} 0.22 ${z + 0.9}`, rotation: '-35 0 0', material: 'color: #8a6a42' });
    },

    // Vijvertje voor de eenden
    buildPond(pen, parent) {
      const e = document.createElement('a-circle');
      e.setAttribute('radius', Math.min(pen.width, pen.depth) * 0.22);
      e.setAttribute('rotation', '-90 0 0');
      e.setAttribute('position', `${pen.x + pen.width * 0.22} 0.03 ${pen.z + pen.depth * 0.12}`);
      e.setAttribute('material', 'color: #3a6f8f; opacity: 0.8; transparent: true; roughness: 0.3');
      parent.appendChild(e);
    },

    // Konijnenhok op pootjes
    buildHutch(pen, parent) {
      const x = pen.x + pen.width / 2 - 0.9, z = pen.z;
      const add = (tag, attrs) => { const e = document.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
      add('a-box', { width: 1.2, height: 0.6, depth: 0.8, position: `${x} 0.7 ${z}`, material: 'color: #9a7048; roughness: 1' });
      add('a-box', { width: 1.3, height: 0.06, depth: 0.95, position: `${x} 1.03 ${z}`, material: 'color: #5a3a28' });
      add('a-plane', { width: 0.5, height: 0.4, position: `${x - 0.2} 0.7 ${z + 0.41}`, material: 'color: #c9d0d0; opacity: 0.35; transparent: true; side: double' });
      for (const [dx, dz] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]]) add('a-cylinder', { radius: 0.03, height: 0.4, position: `${x + dx} 0.2 ${z + dz}`, material: 'color: #4a3020' });
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
      const T = (net.layout.species || {})[this.data.type] || {};
      this.T = T;
      this.scale = T.scale || 1;
      const sz = (V25.models.sizes || {})[this.data.type] || [0.9, 0.8];
      this.aimHeight = sz[0] * this.scale;
      this.radius = sz[1] * this.scale;
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
