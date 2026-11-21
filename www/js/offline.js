/*
 * Vault 25 — doorspelen zonder bereik
 *
 * Bij de paddock is vaak geen wifi. Dan draait de telefoon de wereld zelf
 * (dezelfde spelregels als de server, uit sim-bundle.js), vanaf de laatste
 * stand van de server: dezelfde dieren, akkers en oogstrondes als iedereen.
 * Elke actie wordt een "aanspraak" (deze akker uit die ronde, dit ei, dat
 * beest). Terug in bereik beslist de server wie eerst was; dezelfde buit gaat
 * nooit naar twee spelers.
 *
 * Wat de telefoon bewaart (localStorage):
 *   v25-pack     spelregels + stand van de hokken/wild (van de server, zonder codes)
 *   v25-layout   de plattegrond
 *   v25-inv      jouw tas en rollen zoals de server ze kent
 *   v25-pending  { claims: [...], items } — aanspraken nog niet beoordeeld
 *                (items = alleen voor weergave)
 *
 * Zonder bereik kan NIET: rolcodes invoeren en inleveren (dat moet de server doen).
 * Andere spelers zie je dan niet, en zij jouw acties niet.
 */
(function () {
  const net = V25.net;
  const CFG = window.VAULT25_CONFIG || {};
  const AFTER = CFG.offlineAfterMs != null ? CFG.offlineAfterMs : 8000;
  const fire = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));
  const jget = (k) => { try { return JSON.parse(net.store.get(k) || 'null'); } catch (e) { return null; } };
  const jset = (k, v) => net.store.set(k, v == null ? '' : JSON.stringify(v));

  let world = null, loop = null, timer = null, base = null, warned = false, ticks = 0;

  function sum(a, b) {
    const out = { ...(a || {}) };
    for (const k in (b || {})) out[k] = (out[k] || 0) + b[k];
    return out;
  }

  // ------------------------------------------------------ van de server
  document.addEventListener('net-pack', (e) => {
    const { cfg, seed, layout } = e.detail;
    jset('v25-pack', { cfg, seed });
    jset('v25-layout', layout);
  });
  document.addEventListener('net-seed', (e) => {
    const pack = jget('v25-pack');
    if (pack && !world) { pack.seed = e.detail; jset('v25-pack', pack); }
  });
  document.addEventListener('net-me', (e) => {
    const me = e.detail;
    if (!world) { jset('v25-inv', { name: me.name, roles: me.roles, inv: me.inv }); return; }
    // Lokaal: buit van deze tocht = lokale tas min wat de server al kent
    const items = {};
    for (const k in me.inv) {
      const d = me.inv[k] - ((base.inv || {})[k] || 0);
      if (d > 0) items[k] = d;
    }
    const pend = jget('v25-pending') || { claims: [] };
    pend.items = items;
    jset('v25-pending', pend);
  });
  document.addEventListener('net-claim', (e) => {
    if (!world) return;
    const pend = jget('v25-pending') || { claims: [], items: {} };
    pend.claims.push(e.detail);
    jset('v25-pending', pend);
  });
  document.addEventListener('net-synced', () => { jset('v25-pending', null); });

  // ------------------------------------------------------ status volgen
  document.addEventListener('net-status', (e) => {
    const s = e.detail.state;
    if (s === 'online') {
      clearTimeout(timer); timer = null;
      if (world) stopLocal();
      sendPending();
    } else if (!world && !timer) {
      timer = setTimeout(() => { timer = null; if (net.state !== 'online') startLocal(); }, AFTER);
    }
  });

  function sendPending() {
    const pend = jget('v25-pending');
    if (pend && pend.claims && pend.claims.length) net.send({ t: 'sync', claims: pend.claims });
  }

  // ------------------------------------------------------ lokale wereld
  function startLocal() {
    const pack = jget('v25-pack'), layout = net.layout || jget('v25-layout');
    if (!pack || !layout || !V25.SimWorld || (pack.cfg.offline && pack.cfg.offline.enabled === false)) {
      if (!warned) {
        warned = true;
        fire('net-msg', { text: 'Geen verbinding met de server. Maak eerst één keer verbinding op de wifi, daarna kun je ook zonder bereik spelen.', tone: 'bad' });
      }
      return;
    }
    const name = net.store.get('v25-name', 'Bewoner');
    base = jget('v25-inv') || { name, roles: [], inv: {} };
    const pend = jget('v25-pending');
    const s0 = pack.seed || {};
    // Wereldklok doorrekenen vanaf het moment dat de server de stand stuurde
    const t = (s0.t || 0) + (s0.wall ? Math.max(0, (Date.now() - s0.wall) / 1000) : 0);
    const seed = { ...s0, t, players: [{ id: net.id, name, roles: base.roles || [], inv: sum(base.inv, pend && pend.items) }] };

    world = new V25.SimWorld(pack.cfg, seed, (to, msg) => {
      if (to === 'all' || to === net.id) net.handle(msg);
    }, { offline: true });
    const p = world.join(net.id, name, []);

    net.local = (m) => {
      if (!world) return false;
      if (m.t === 'pose') world.setPose(net.id, m);
      else if (m.t === 'act') world.act(net.id, m.kind, m.target);
      else if (m.t === 'code' || m.t === 'turnin') {
        net.handle({ t: 'msg', text: m.t === 'code' ? 'Rolcodes invoeren kan alleen met bereik.' : 'Inleveren kan alleen met bereik. Loop terug naar de wifi.', tone: 'bad' });
      }
      return true;
    };

    fire('net-reset');
    if (!net.layout) { net.layout = layout; fire('net-hello', layout); }   // app gestart zonder bereik
    world.sendMe(p);
    ticks = 0;
    loop = setInterval(() => {
      if (!world) return;
      world.tick(0.05);
      if (++ticks % 2 === 0) net.handle(world.snapshot());
    }, 50);
    net.handle(world.snapshot());
    fire('net-status', { state: net.state });   // HUD: "lokaal"
    fire('net-msg', { text: 'Geen bereik — je speelt verder. Terug bij de wifi wordt alles bijgeschreven, tenzij iemand je vóór was.', tone: 'info' });
  }

  function stopLocal() {
    clearInterval(loop); loop = null;
    world = null;
    net.local = null;
    fire('net-reset');
  }

  // Ook als de app zonder bereik wordt geopend
  timer = setTimeout(() => { timer = null; if (net.state !== 'online' && !world) startLocal(); }, AFTER);

  V25.offline = {
    get active() { return !!world; },
    get world() { return world; },
    pending() { return jget('v25-pending'); },
    startLocal, stopLocal,
  };
})();
