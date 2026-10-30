/*
 * Vault 25 AR Farm — bouwt de wereld op (hek, akkers, dieren)
 *
 * Bevat:
 *   - system "farm"          : gedeelde staat (omheining, camera, tellers)
 *   - component "farm-builder": zet hek + akkers + dieren in de scene
 */
(function () {
  const U = V25.utils;
  const CFG = window.VAULT25_CONFIG;

  // ---------------------------------------------------------------------
  // System: centrale staat die alle dieren delen
  // ---------------------------------------------------------------------
  // Scratch-objecten zodat we niet elk frame nieuwe vectoren aanmaken.
  const _pos = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _quat = new THREE.Quaternion();

  AFRAME.registerSystem('farm', {
    init() {
      this.enclosure = CFG.enclosure.points;
      this.center = U.centroid(this.enclosure);
      this.cameraEl = null;
      this.farmEl = null;   // wordt gezet door farm-builder (de lokale ruimte)
      this.totalEscaped = 0;
      this.totalReturned = 0;
      this.animals = [];
      this.fields = [];     // akkers (groei/oogst), gevuld door farm-builder
      this.critters = [];   // wild (jagen), gevuld door wildlife.js
      this.initGate();
    },

    // Poort: midden, een punt net binnen en een punt buiten.
    initGate() {
      const g = CFG.enclosure.gate;
      if (!g) return;
      const pts = this.enclosure;
      const a = pts[g.sideIndex], b = pts[(g.sideIndex + 1) % pts.length];
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      let dx = this.center.x - mid.x, dz = this.center.z - mid.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      this.gateMid = mid;
      this.gateHalf = g.widthMeters / 2;
      this.gateInside = { x: mid.x + dx * 1.5, z: mid.z + dz * 1.5 };
      this.gateOutside = { x: mid.x - dx * 4, z: mid.z - dz * 4 };
    },

    registerAnimal(el) { this.animals.push(el); },

    isInside(x, z) { return U.pointInPolygon(x, z, this.enclosure); },

    nearGate(x, z) {
      return !!this.gateMid &&
        U.dist2D(x, z, this.gateMid.x, this.gateMid.z) < this.gateHalf + 0.6;
    },

    // Mag iets van (x0,z0) naar (x1,z1)? Het hek oversteken kan alleen
    // via de poortopening — niet dwars door de touwen.
    fenceAllows(x0, z0, x1, z1) {
      if (this.isInside(x0, z0) === this.isInside(x1, z1)) return true;
      return this.nearGate(x0, z0) || this.nearGate(x1, z1);
    },

    getCameraEl() {
      if (!this.cameraEl) this.cameraEl = document.querySelector('[camera]');
      return this.cameraEl;
    },

    // Camerapositie in FARM-LOKALE coordinaten (zelfde ruimte als de dieren).
    // In GPS-modus staat de farm op Spherical Mercator-wereldcoordinaten;
    // daarom altijd omrekenen naar de lokale ruimte (incl. schaal en draaiing).
    // Let op: geeft een gedeelde vector terug — alleen uitlezen.
    getCameraGround() {
      const c = this.getCameraEl();
      _pos.set(0, 0, 0);
      if (c) c.object3D.getWorldPosition(_pos);
      if (this.farmEl) this.farmEl.object3D.worldToLocal(_pos);
      return _pos;
    },

    // Volledige 3D-kijkrichting in farm-lokale ruimte (genormaliseerd).
    getCameraDir3() {
      const c = this.getCameraEl();
      _dir.set(0, 0, -1);
      if (c) {
        c.object3D.getWorldDirection(_dir);
        _dir.multiplyScalar(-1); // getWorldDirection van een entity wijst naar achteren
      }
      if (this.farmEl) {
        this.farmEl.object3D.getWorldQuaternion(_quat);
        _dir.applyQuaternion(_quat.invert());
      }
      return _dir.normalize();
    },

    // Kijkrichting plat op de grond (XZ), genormaliseerd.
    getCameraForward() {
      const d = this.getCameraDir3();
      const l = Math.hypot(d.x, d.z);
      if (l < 1e-6) return { x: 0, z: -1 };
      return { x: d.x / l, z: d.z / l };
    },

    // Het punt op de grond waar je vizier naar wijst.
    //   hit     = je kijkt naar beneden (er is een grondpunt)
    //   clamped = dat punt lag verder dan maxDist en is ingekort langs je
    //             kijklijn (nog steeds de goede richting, alleen dichterbij)
    gazeGround(maxDist) {
      const c = this.getCameraGround();
      const cx = c.x, cy = c.y, cz = c.z;
      const d = this.getCameraDir3();
      let x, z, hit = false, clamped = false;
      if (d.y < -0.03 && cy > 0) {
        const t = cy / -d.y;
        x = cx + d.x * t; z = cz + d.z * t; hit = true;
      } else {
        const f = this.getCameraForward();
        x = cx + f.x * maxDist; z = cz + f.z * maxDist;
      }
      const h = U.dist2D(cx, cz, x, z);
      if (h > maxDist) {
        x = cx + (x - cx) * maxDist / h;
        z = cz + (z - cz) * maxDist / h;
        clamped = true;
      }
      return { x, z, hit, clamped };
    },

    // Richt het vizier op een punt (farm-lokaal)? radius = "trefzone".
    // Werkt schaal-onafhankelijk: de toegestane hoek groeit als iets dichtbij is.
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

    notifyEscaped() {
      this.totalEscaped++;
      this.el.emit('farm-stats', this.stats());
    },
    notifyReturned() {
      this.totalReturned++;
      this.el.emit('farm-stats', this.stats());
    },
    stats() {
      const out = this.animals.filter(a => a.components.animal &&
        a.components.animal.isOutside()).length;
      return { outside: out, escaped: this.totalEscaped, returned: this.totalReturned };
    },
  });

  // ---------------------------------------------------------------------
  // Component: bouw de boerderij
  // ---------------------------------------------------------------------
  AFRAME.registerComponent('farm-builder', {
    init() {
      // Meld deze entity aan als "de lokale ruimte" waarin alles leeft.
      this.el.sceneEl.systems.farm.farmEl = this.el;
      this.buildGround();
      this.buildFence();
      this.buildFields();
      this.spawnAnimals();
      // Geef de scene 1 frame om alles te plaatsen, meld dan klaar.
      setTimeout(() => this.el.sceneEl.emit('farm-ready'), 0);
    },

    buildGround() {
      // Subtiele grondschijf zodat dieren niet "in de lucht" lijken te zweven.
      const ground = document.createElement('a-entity');
      ground.setAttribute('geometry', 'primitive: circle; radius: 40');
      ground.setAttribute('rotation', '-90 0 0');
      ground.setAttribute('material',
        'color: #2a2418; opacity: 0.18; transparent: true; side: double');
      ground.setAttribute('position', '0 0.01 0');
      this.el.appendChild(ground);
    },

    buildFence() {
      const pts = CFG.enclosure.points;
      const h = CFG.enclosure.postHeight;
      const spacing = CFG.enclosure.postSpacing;
      const gate = CFG.enclosure.gate;

      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const isGateSide = gate && gate.sideIndex === i;

        const segLen = U.dist2D(a.x, a.z, b.x, b.z);
        const nSeg = Math.max(1, Math.round(segLen / spacing));

        // Paaltjes langs deze zijde. We beginnen bij s=1: het hoekpaaltje
        // op s=0 wordt al geplaatst door de vorige zijde (s=nSeg), anders
        // staan er twee paaltjes op elke hoek.
        for (let s = 1; s <= nSeg; s++) {
          const t = s / nSeg;
          const px = a.x + (b.x - a.x) * t;
          const pz = a.z + (b.z - a.z) * t;

          // Sla het middendeel over als hier de poort/opening zit
          if (isGateSide) {
            const gw = gate.widthMeters / segLen; // poortbreedte als fractie
            if (t > 0.5 - gw / 2 && t < 0.5 + gw / 2) continue;
          }
          this.makePost(px, pz, h);
        }

        // Touwen (twee hoogtes) tussen begin en eind van de zijde
        if (!isGateSide) {
          this.makeRope(a, b, h * 0.9);
          this.makeRope(a, b, h * 0.5);
        } else {
          // Touw loopt tot aan de poortopening en daarna weer verder
          this.makeRope(a, b, h * 0.9, gate.widthMeters);
          this.makeRope(a, b, h * 0.5, gate.widthMeters);
        }
      }
    },

    makePost(x, z, h) {
      const post = document.createElement('a-cylinder');
      post.setAttribute('radius', 0.05);
      post.setAttribute('height', h);
      post.setAttribute('position', `${x} ${h / 2} ${z}`);
      post.setAttribute('material', 'color: #6b4f2e; roughness: 1');
      this.el.appendChild(post);
    },

    // Touw als dunne cilinder tussen twee punten op hoogte y.
    // gateGap (optioneel) = breedte van opening in het midden om over te slaan.
    makeRope(a, b, y, gateGap) {
      const make = (x1, z1, x2, z2) => {
        const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
        const len = U.dist2D(x1, z1, x2, z2);
        const rope = document.createElement('a-cylinder');
        rope.setAttribute('radius', 0.015);
        rope.setAttribute('height', len);
        rope.setAttribute('material', 'color: #b8a06a; roughness: 1');
        // cilinder staat default verticaal -> kantelen naar horizontaal en draaien
        const angle = Math.atan2(x2 - x1, z2 - z1);
        rope.setAttribute('position', `${mx} ${y} ${mz}`);
        rope.setAttribute('rotation',
          `90 ${THREE.MathUtils.radToDeg(angle)} 0`);
        this.el.appendChild(rope);
      };

      if (!gateGap) { make(a.x, a.z, b.x, b.z); return; }

      // Met poort: maak twee stukken touw met een gat in het midden
      const len = U.dist2D(a.x, a.z, b.x, b.z);
      const gw = gateGap / len;
      const lerp = (t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      const g1 = lerp(0.5 - gw / 2), g2 = lerp(0.5 + gw / 2);
      make(a.x, a.z, g1.x, g1.z);
      make(g2.x, g2.z, b.x, b.z);
    },

    buildFields() {
      const sys = this.el.sceneEl.systems.farm;
      const cropColors = {
        tato: '#5a6e2f', mutfruit: '#7a2f4a', mais: '#9a8a2f', corn: '#9a8a2f',
        default: '#4f6b35',
      };
      const now = performance.now() / 1000;
      for (const f of CFG.fields) {
        // Akkergrond
        const soil = document.createElement('a-entity');
        soil.setAttribute('geometry', `primitive: plane; width: ${f.width}; height: ${f.depth}`);
        soil.setAttribute('rotation', '-90 0 0');
        soil.setAttribute('material', 'color: #3a2c1c; roughness: 1; side: double');
        soil.setAttribute('position', `${f.x} 0.02 ${f.z}`);
        this.el.appendChild(soil);

        // Gewasrijen — hoogte en kleur worden per frame bijgewerkt (interact.js)
        const color = cropColors[f.crop] || cropColors.default;
        const nRows = f.rows || 5;
        const rows = [];
        for (let r = 0; r < nRows; r++) {
          const rz = f.z - f.depth / 2 + (f.depth / nRows) * (r + 0.5);
          const row = document.createElement('a-box');
          row.setAttribute('width', f.width * 0.92);
          row.setAttribute('height', 0.25);
          row.setAttribute('depth', 0.12);
          row.setAttribute('position', `${f.x} 0.14 ${rz}`);
          row.setAttribute('material', `color: ${color}; roughness: 1`);
          this.el.appendChild(row);
          rows.push(row);
        }

        // Begin halfvol gegroeid, zodat er snel iets te oogsten is.
        const grow = f.growSeconds || 90;
        sys.fields.push({
          cfg: f, rows, color, stage: -1, progress: 0,
          plantedAt: now - grow * U.rand(0.4, 0.9),
        });
      }
    },

    spawnAnimals() {
      const sys = this.el.sceneEl.systems.farm;
      for (const def of CFG.animals) {
        for (let i = 0; i < def.count; i++) {
          const el = document.createElement('a-entity');
          const spot = U.randomPointInPolygon(CFG.enclosure.points);
          el.setAttribute('position', `${spot.x} 0 ${spot.z}`);
          el.setAttribute('animal', {
            type: def.type,
            color: def.color || '#caa472',
            scale: def.scale || 1,
            model: def.model || '',
            canEscape: i < (def.escapes || 0),
            product: def.product || '',
          });
          this.el.appendChild(el);
          sys.registerAnimal(el);
        }
      }
    },
  });
})();
