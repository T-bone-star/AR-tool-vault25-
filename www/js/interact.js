/*
 * Vault 25 — richten, de actieknop en je blik doorgeven aan de server
 *
 * De telefoon kiest WAT je wilt doen (op basis van je vizier) en vraagt het
 * de server. De server beslist of het mag (rol, afstand, al geoogst door een
 * ander…) en stuurt het resultaat terug.
 */
(function () {
  const net = V25.net;
  const CFG = window.VAULT25_CONFIG;

  AFRAME.registerSystem('interact', {
    init() {
      this.aim = null;
      this.key = '';
      this.acc = 0;
      this.poseAcc = 0;
      this.lastShot = 0;
    },

    tick(time, dtMs) {
      const farm = this.el.systems.farm;
      if (!farm || !farm.farmEl || !farm.layout) return;

      // Blik doorgeven (lokken, afstandscontrole, figuurtje bij anderen)
      this.poseAcc += dtMs;
      if (this.poseAcc >= (CFG.poseIntervalMs || 150)) {
        this.poseAcc = 0;
        net.send({ t: 'pose', ...farm.pose() });
      }

      this.acc += dtMs;
      if (this.acc < 100) return;
      this.acc = 0;
      this.aim = this.findAim(farm);
      const a = this.aim;
      const key = a ? `${a.kind}:${a.id}:${a.locked ? 1 : 0}` : '';
      if (key !== this.key) {
        this.key = key;
        this.el.emit('aim-change', a ? { kind: a.kind, label: a.label, locked: !!a.locked } : null);
      }
    },

    findAim(farm) {
      const L = farm.layout, R = L.rules || {}, B = L.behavior || {};
      let best = null;

      // 1. Wild (iedereen mag schieten; alleen jagers krijgen buit)
      for (const [id, el] of farm.critters) {
        const n = el.__net, c = el.components['critter-view'];
        if (!n || n.d || !c) continue;
        const p = el.object3D.position;
        const a = farm.aimAt(p.x, c.aimHeight, p.z, c.radius);
        if (a.hit && a.d <= (B.maxShotRange || 25) && (!best || a.ang < best.ang)) {
          const noLoot = !net.hasRole(R.huntLootRole);
          best = { kind: 'jacht', id, ang: a.ang, label: c.T.label + (noLoot ? ' · geen jager: geen buit' : '') };
        }
      }
      if (best) return best;

      // 2. Vee om te melken
      for (const [id, el] of farm.animals) {
        const n = el.__net, c = el.components['herd-animal'];
        if (!n || !n.m || !c) continue;
        const p = el.object3D.position;
        const a = farm.aimAt(p.x, c.aimHeight, p.z, c.radius);
        if (a.hit && a.d <= (B.actionRangeMeters || 22) && (!best || a.ang < best.ang)) {
          const locked = !net.hasRole(R.milkRole);
          best = { kind: 'melk', id, ang: a.ang, locked,
            label: locked ? `Alleen ${net.roleLabel(R.milkRole).toLowerCase()}en kunnen melken` : `${c.data.type} melken` };
        }
      }
      if (best) return best;

      // 3. Akkers (alleen als je echt naar de grond kijkt)
      const g = farm.gazeGround(B.lureRangeMeters || 18);
      if (!g.hit || g.clamped) return null;
      for (let i = 0; i < farm.fields.length; i++) {
        const f = farm.fields[i], c = f.cfg;
        if (Math.abs(g.x - c.x) > c.width / 2 || Math.abs(g.z - c.z) > c.depth / 2) continue;
        const name = net.label(c.crop);
        if (f.stage !== 2) return { kind: 'groei', id: 'g' + i + f.stage, label: `${name}: ${f.stage === 0 ? 'net opgekomen' : 'bijna rijp'}` };
        const locked = !net.hasRole(R.harvestRole);
        return { kind: 'oogst', id: i, locked,
          label: locked ? `Alleen ${net.roleLabel(R.harvestRole).toLowerCase()}en kunnen oogsten` : `${name} oogsten` };
      }
      return null;
    },

    doAction() {
      const a = this.aim;
      if (a && a.kind === 'groei') { this.el.emit('action-info', { msg: 'Nog niet rijp — kom later terug.' }); return; }
      if (a && a.locked) { this.el.emit('action-info', { msg: a.label + '.' }); return; }
      if (a && a.kind === 'oogst') { net.send({ t: 'act', kind: 'harvest', target: a.id }); return; }
      if (a && a.kind === 'melk') { net.send({ t: 'act', kind: 'milk', target: a.id }); return; }
      // Vuren (op wild of in het niets). Directe feedback; de server bepaalt raak/mis.
      const now = performance.now();
      if (now - this.lastShot < 700) return;
      this.lastShot = now;
      this.el.emit('shot-local');
      net.send({ t: 'act', kind: 'shoot', target: a && a.kind === 'jacht' ? a.id : null });
    },
  });
})();
