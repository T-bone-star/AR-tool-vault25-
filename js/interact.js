/*
 * Vault 25 AR Farm — richten + de ene actieknop
 *
 * Eén knop die doet wat past bij waar je vizier op staat:
 *   wild        -> VUUR
 *   vee (melk)  -> MELKEN
 *   rijpe akker -> OOGSTEN
 *   niets       -> VUUR (een schot in het niets; maakt wel herrie)
 *
 * Ook hier: het laten groeien van de gewassen.
 */
(function () {
  const U = V25.utils;
  const CFG = window.VAULT25_CONFIG;
  const B = CFG.behavior;
  const now = () => performance.now() / 1000;
  const CROP_YOUNG = '#3d4a2a';

  AFRAME.registerSystem('interact', {
    init() {
      this.aim = null;
      this.key = '';
      this.lastShot = -99;
      this.acc = 0;
    },

    tick(time, dtMs) {
      const farm = this.el.systems.farm;
      if (!farm || !farm.farmEl) return;
      this.growCrops(farm);

      // Richten 10x per seconde is ruim genoeg en spaart de telefoon.
      this.acc += dtMs;
      if (this.acc < 100) return;
      this.acc = 0;
      this.aim = this.findAim(farm);
      const key = this.aim ? this.aim.kind + ':' + this.aim.id : '';
      if (key !== this.key) {
        this.key = key;
        this.el.emit('aim-change', this.aim ? { kind: this.aim.kind, label: this.aim.label } : null);
      }
    },

    growCrops(farm) {
      const t = now();
      for (const f of farm.fields) {
        const grow = f.cfg.growSeconds || 90;
        const p = U.clamp((t - f.plantedAt) / grow, 0, 1);
        f.progress = p;
        const s = 0.15 + 0.85 * p;
        for (const r of f.rows) {
          r.object3D.scale.y = s;
          r.object3D.position.y = 0.02 + 0.125 * s;
        }
        const stage = p >= 1 ? 2 : p >= 0.5 ? 1 : 0;
        if (stage !== f.stage) {
          const first = f.stage === -1;
          f.stage = stage;
          const col = stage === 0 ? CROP_YOUNG : f.color;
          for (const r of f.rows) {
            r.setAttribute('material', {
              color: col,
              emissive: stage === 2 ? f.color : '#000000',
              emissiveIntensity: stage === 2 ? 0.45 : 0,
            });
          }
          if (stage === 2 && !first) {
            this.el.emit('crop-ripe', { label: V25.inv.label(f.cfg.crop) });
          }
        }
      }
    },

    findAim(farm) {
      let best = null;

      // 1. Wild
      for (const c of farm.critters) {
        if (c.state === 'DEAD') continue;
        const p = c.el.object3D.position;
        const a = farm.aimAt(p.x, c.aimHeight, p.z, c.radius);
        if (a.hit && a.d <= B.maxShotRange && (!best || a.ang < best.ang)) {
          best = { kind: 'jacht', id: c.el.object3D.id, label: c.def.label, comp: c, d: a.d, ang: a.ang };
        }
      }
      if (best) return best;

      // 2. Vee om te melken
      const t = now();
      for (const el of farm.animals) {
        const an = el.components.animal;
        if (!an || !an.canMilk(t)) continue;
        const p = el.object3D.position;
        const a = farm.aimAt(p.x, an.aimHeight, p.z, an.radius);
        if (a.hit && a.d <= B.lureRangeMeters && (!best || a.ang < best.ang)) {
          best = { kind: 'melk', id: el.object3D.id, label: `${an.data.type} melken`, comp: an, ang: a.ang };
        }
      }
      if (best) return best;

      // 3. Akkers (alleen als je echt naar de grond kijkt)
      const g = farm.gazeGround(B.lureRangeMeters);
      if (!g.hit || g.clamped) return null;
      for (let i = 0; i < farm.fields.length; i++) {
        const f = farm.fields[i], c = f.cfg;
        if (Math.abs(g.x - c.x) <= c.width / 2 && Math.abs(g.z - c.z) <= c.depth / 2) {
          const name = V25.inv.label(c.crop);
          if (f.stage === 2) return { kind: 'oogst', id: 'f' + i, label: `${name} oogsten`, field: f };
          return {
            kind: 'groei', id: 'g' + i + '-' + f.stage,
            label: `${name}: ${f.stage === 0 ? 'net opgekomen' : 'bijna rijp'}`,
          };
        }
      }
      return null;
    },

    doAction() {
      const a = this.aim;
      const t = now();
      if (a && a.kind === 'oogst') {
        const f = a.field;
        const n = f.cfg.yield || f.rows.length;
        V25.inv.add(f.cfg.crop, n);
        f.plantedAt = t;
        this.el.emit('harvested', { label: V25.inv.label(f.cfg.crop), n });
      } else if (a && a.kind === 'melk') {
        a.comp.milk(t);
      } else if (a && a.kind === 'groei') {
        this.el.emit('action-info', { msg: 'Nog niet rijp — kom later terug.' });
      } else {
        if (t - this.lastShot < B.shotCooldownSeconds) return;
        this.lastShot = t;
        this.el.emit('shot');
        if (a && a.kind === 'jacht') a.comp.takeShot(a.d);
      }
      // Meteen opnieuw richten, zodat de knop direct klopt.
      this.key = '';
      this.acc = 100;
    },
  });
})();
