/*
 * Vault 25 AR Farm — het dier zelf (gedrag + lokken)
 *
 * Toestanden:
 *   GRAZE          rustig grazen binnen het hek
 *   ESCAPE         loopt richting de poort en naar buiten
 *   WANDER_OUTSIDE dwaalt buiten rond, wacht tot je 'm lokt
 *   FOLLOW         je richt je camera erop -> loopt met je mee
 *   (terug binnen) -> weer GRAZE
 */
(function () {
  const U = V25.utils;
  const CFG = window.VAULT25_CONFIG;
  const B = CFG.behavior;

  AFRAME.registerComponent('animal', {
    schema: {
      type: { type: 'string', default: 'brahmin' },
      color: { type: 'color', default: '#caa472' },
      scale: { type: 'number', default: 1 },
      model: { type: 'string', default: '' },
      canEscape: { type: 'boolean', default: false },
    },

    init() {
      this.sys = this.el.sceneEl.systems.farm;
      this.state = 'GRAZE';
      this.age = 0;             // levensduur in seconden
      this.target = null;       // {x,z} waar het dier heen loopt
      this.pauseUntil = 0;      // grazen: pauzemoment
      this.lostLureFor = 0;     // hoelang we de lok-lijn kwijt zijn
      this.bobPhase = Math.random() * Math.PI * 2;

      // Verspreid de uitbraken over de tijd zodat ze niet tegelijk ontsnappen
      if (this.data.canEscape) {
        const slot = this.sys.escapeSlot = (this.sys.escapeSlot || 0) + 1;
        this.escapeAt = B.escapeAfterSeconds + (slot - 1) * B.escapeIntervalSeconds;
      } else {
        this.escapeAt = Infinity;
      }

      this.buildModel();
      this.el.object3D.scale.setScalar(this.data.scale);
    },

    isOutside() {
      const p = this.el.object3D.position;
      return !U.pointInPolygon(p.x, p.z, this.sys.enclosure);
    },

    // -----------------------------------------------------------------
    // Visueel: eigen .glb model OF ingebouwde placeholder-vorm
    // -----------------------------------------------------------------
    buildModel() {
      if (this.data.model) {
        const m = document.createElement('a-entity');
        m.setAttribute('gltf-model', this.data.model);
        this.el.appendChild(m);
        return;
      }
      const builders = {
        brahmin: this.buildBrahmin,
        radstag: this.buildRadstag,
        molerat: this.buildMolerat,
      };
      (builders[this.data.type] || this.buildBrahmin).call(this);
    },

    _box(w, h, d, x, y, z, color) {
      const e = document.createElement('a-box');
      e.setAttribute('width', w); e.setAttribute('height', h); e.setAttribute('depth', d);
      e.setAttribute('position', `${x} ${y} ${z}`);
      e.setAttribute('material', `color: ${color || this.data.color}; roughness: 1`);
      this.el.appendChild(e);
      return e;
    },
    _cyl(r, h, x, y, z, color) {
      const e = document.createElement('a-cylinder');
      e.setAttribute('radius', r); e.setAttribute('height', h);
      e.setAttribute('position', `${x} ${y} ${z}`);
      e.setAttribute('material', `color: ${color || this.data.color}; roughness: 1`);
      this.el.appendChild(e);
      return e;
    },

    // Brahmin = de iconische tweekoppige koe
    buildBrahmin() {
      this._box(1.4, 0.8, 0.7, 0, 0.95, 0);            // romp
      const legs = [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]];
      for (const [lx, lz] of legs) this._cyl(0.08, 0.55, lx, 0.28, lz, '#5b4a30');
      // twee nekken + twee koppen
      for (const off of [-0.18, 0.18]) {
        this._cyl(0.1, 0.5, 0.75, 1.25, off, this.data.color);
        this._box(0.35, 0.3, 0.3, 0.95, 1.5, off, this.data.color);
        this._box(0.08, 0.12, 0.08, 1.1, 1.6, off + 0.08, '#3a2f1f'); // hoorntje
        this._box(0.08, 0.12, 0.08, 1.1, 1.6, off - 0.08, '#3a2f1f');
      }
    },

    buildRadstag() {
      this._box(1.0, 0.6, 0.5, 0, 0.85, 0);
      const legs = [[-0.4, -0.18], [0.4, -0.18], [-0.4, 0.18], [0.4, 0.18]];
      for (const [lx, lz] of legs) this._cyl(0.05, 0.6, lx, 0.3, lz, '#5b4a30');
      this._cyl(0.08, 0.5, 0.5, 1.2, 0, this.data.color);  // nek
      this._box(0.3, 0.25, 0.25, 0.65, 1.45, 0, this.data.color);
      // gewei
      for (const s of [-1, 1]) {
        const a = document.createElement('a-cone');
        a.setAttribute('radius-bottom', 0.04); a.setAttribute('radius-top', 0);
        a.setAttribute('height', 0.4);
        a.setAttribute('position', `0.6 1.7 ${0.12 * s}`);
        a.setAttribute('rotation', `0 0 ${20 * s}`);
        a.setAttribute('material', 'color: #cfc6b0; roughness: 1');
        this.el.appendChild(a);
      }
    },

    buildMolerat() {
      this._box(0.9, 0.45, 0.5, 0, 0.3, 0);
      this._box(0.3, 0.3, 0.35, 0.55, 0.3, 0, this.data.color); // snuit
      const legs = [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]];
      for (const [lx, lz] of legs) this._cyl(0.05, 0.25, lx, 0.13, lz, '#5b4a30');
    },

    // -----------------------------------------------------------------
    // Hoofdlus
    // -----------------------------------------------------------------
    tick(time, dtMs) {
      const dt = Math.min(dtMs / 1000, 0.1); // seconden, met vangnet
      this.age += dt;

      switch (this.state) {
        case 'GRAZE': this.tickGraze(dt); break;
        case 'ESCAPE': this.tickEscape(dt); break;
        case 'WANDER_OUTSIDE': this.tickWander(dt); break;
        case 'FOLLOW': this.tickFollow(dt); break;
      }

      // Subtiele loop-/ademhalingsbeweging
      this.bobPhase += dt * 6;
      const baseY = this.data.type === 'molerat' ? 0 : 0;
      this.el.object3D.position.y = baseY + Math.sin(this.bobPhase) * 0.03;
    },

    // Beweeg richting this.target met snelheid v (m/s). Geeft true bij aankomst.
    moveTo(v, dt) {
      if (!this.target) return true;
      const p = this.el.object3D.position;
      const d = U.dist2D(p.x, p.z, this.target.x, this.target.z);
      if (d < 0.25) return true;
      const step = Math.min(v * dt, d);
      const nx = (this.target.x - p.x) / d;
      const nz = (this.target.z - p.z) / d;
      p.x += nx * step;
      p.z += nz * step;
      // Draai naar de looprichting (model kijkt langs +x, dus offset 90 graden)
      const yaw = Math.atan2(nx, nz);
      this.el.object3D.rotation.y = yaw - Math.PI / 2;
      return false;
    },

    tickGraze(dt) {
      if (this.age >= this.escapeAt) { this.startEscape(); return; }
      if (this.age < this.pauseUntil) return;
      if (!this.target || this.moveTo(B.grazeSpeed, dt)) {
        this.target = U.randomPointInPolygon(this.sys.enclosure);
        this.pauseUntil = this.age + U.rand(1, 3);
      }
    },

    startEscape() {
      // Mik op een punt net buiten de poort
      const g = CFG.enclosure.gate;
      const pts = this.sys.enclosure;
      const a = pts[g.sideIndex], b = pts[(g.sideIndex + 1) % pts.length];
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const c = this.sys.center;
      // richting van centrum door de poort naar buiten
      const dx = mid.x - c.x, dz = mid.z - c.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      this.target = { x: mid.x + (dx / len) * 4, z: mid.z + (dz / len) * 4 };
      this.state = 'ESCAPE';
    },

    tickEscape(dt) {
      this.moveTo(B.escapeSpeed, dt);
      if (this.isOutside()) {
        this.state = 'WANDER_OUTSIDE';
        this.target = null;
        this.sys.notifyEscaped();
        this.el.emit('animal-escaped', { type: this.data.type }, true);
      }
    },

    tickWander(dt) {
      // Check of de speler 'm lokt
      if (this.checkLure()) { this.state = 'FOLLOW'; this.lostLureFor = 0; return; }
      // Anders rustig buiten rondscharrelen rond het centrum
      if (!this.target || this.moveTo(B.grazeSpeed, dt)) {
        const c = this.sys.center;
        this.target = {
          x: c.x + U.rand(-B.wanderRadiusOutside, B.wanderRadiusOutside),
          z: c.z + U.rand(-B.wanderRadiusOutside, B.wanderRadiusOutside),
        };
      }
    },

    // Staat het cameravizier op dit dier en is het dichtbij genoeg?
    checkLure() {
      const cam = this.sys.getCameraGround();
      const p = this.el.object3D.position;
      const d = U.dist2D(cam.x, cam.z, p.x, p.z);
      if (d > B.lureRangeMeters) return false;
      const toAnimal = { x: (p.x - cam.x) / (d || 1), z: (p.z - cam.z) / (d || 1) };
      const fwd = this.sys.getCameraForward();
      const angle = U.angleBetweenDeg(fwd.x, fwd.z, toAnimal.x, toAnimal.z);
      return angle <= B.lureAngleDeg;
    },

    tickFollow(dt) {
      const stillLured = this.checkLure();
      if (!stillLured) {
        this.lostLureFor += dt;
        if (this.lostLureFor > 2.5) { // 2,5s uit beeld -> raakt 'm kwijt
          this.state = 'WANDER_OUTSIDE';
          this.target = null;
          return;
        }
      } else {
        this.lostLureFor = 0;
      }

      // Loop naar een punt vlak voor de speler, zodat hij/zij het hek in trekt
      const cam = this.sys.getCameraGround();
      const fwd = this.sys.getCameraForward();
      this.target = {
        x: cam.x + fwd.x * B.lureFollowDistance,
        z: cam.z + fwd.z * B.lureFollowDistance,
      };
      this.moveTo(B.followSpeed, dt);

      // Binnen het hek? Dan is 'ie terug.
      if (!this.isOutside()) {
        this.state = 'GRAZE';
        this.target = null;
        this.pauseUntil = this.age + 1;
        this.sys.notifyReturned();
        this.el.emit('animal-returned', { type: this.data.type }, true);
      }
    },
  });
})();
