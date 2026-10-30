/*
 * Vault 25 — HUD, nieuwsregel, tas, codes, meldingen en geluid
 */
(function () {
  const net = V25.net;
  const $ = (id) => document.getElementById(id);
  const on = (ev, fn) => document.addEventListener(ev, fn);

  // ------------------------------------------------------------ meldingen
  let toastTimer = null;
  function toast(msg, ms = 3200, tone = 'info') {
    const t = $('toast'); if (!t) return;
    t.textContent = msg;
    t.className = 'show tone-' + tone;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, ms);
  }

  let lootHide = null;
  function lootPill(diff) {
    const el = $('loot'); if (!el || !diff.length) return;
    el.textContent = diff.map(([k, n]) => `+${n} ${net.label(k)}`).join('   ');
    el.classList.add('show');
    clearTimeout(lootHide);
    lootHide = setTimeout(() => el.classList.remove('show'), 1800);
  }

  // Nieuwsregel: wat anderen (en jij) doen, zichtbaar voor iedereen
  function feedLine(text, mine) {
    const box = $('feed'); if (!box) return;
    const line = document.createElement('div');
    line.className = 'feedline' + (mine ? ' mine' : '');
    line.textContent = text;
    box.prepend(line);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => line.classList.add('fade'), 7000);
    setTimeout(() => line.remove(), 8000);
  }

  // ------------------------------------------------------------------ geluid
  let ac = null;
  function audio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function sfxShot(vol = 0.7) {
    const a = audio(); if (!a) return;
    const len = Math.floor(0.2 * a.sampleRate), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = vol < 0.5 ? 900 : 1600;
    const g = a.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination); src.start();
  }
  function beep(freq, dur = 0.08, when = 0, type = 'square', vol = 0.07) {
    const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, a.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + when + dur);
    o.connect(g).connect(a.destination);
    o.start(a.currentTime + when); o.stop(a.currentTime + when + dur + 0.02);
  }
  const sfxGood = () => { beep(660); beep(990, 0.1, 0.09); };
  const sfxBad = () => beep(150, 0.18, 0, 'sawtooth');
  function flash() { const f = $('flash'); if (!f) return; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }

  // ---------------------------------------------------------- verbinding
  on('net-status', (e) => {
    const dot = $('conn'); if (!dot) return;
    dot.className = 'conn ' + e.detail.state;
    dot.title = { online: 'Verbonden', connecting: 'Verbinden…', offline: 'Geen verbinding' }[e.detail.state];
    const ov = $('offline');
    if (ov) ov.hidden = e.detail.state === 'online' || !net.layout;
  });

  function hideLoader() { const l = $('loader'); if (l) l.classList.add('hidden'); }
  on('farm-ready', hideLoader);
  setTimeout(() => { if (!net.layout) { const l = $('loader-text'); if (l) l.textContent = `Geen server op ${net.defaultServer()}… blijft proberen`; } }, 5000);

  on('net-hello', (e) => {
    const label = $('theme-label');
    if (label) label.textContent = (e.detail.theme && e.detail.theme.label) || 'VAULT 25';
    $('btn-turnin').textContent = e.detail.turnIn.buttonLabel;
  });

  // ---------------------------------------------------------- ik + tas
  let lastInv = null;
  on('net-me', (e) => {
    const me = e.detail;
    if (lastInv) {
      const diff = Object.entries(me.inv).map(([k, n]) => [k, n - (lastInv[k] || 0)]).filter(([, d]) => d > 0);
      lootPill(diff);
    }
    lastInv = { ...me.inv };
    $('stat-inv').textContent = Object.values(me.inv).reduce((a, b) => a + b, 0);
    const roles = $('roles');
    roles.innerHTML = me.roles.length
      ? me.roles.map(r => `<span class="role role-${r}">${net.roleLabel(r).toUpperCase()}</span>`).join('')
      : '<span class="role role-none">GEEN ROL</span>';
    if (!$('bag').hidden) renderBag();
  });

  function renderBag() {
    const me = net.me, L = net.layout;
    if (!me || !L) return;
    const keys = Object.keys(L.items).filter(k => me.inv[k] > 0);
    $('bag-list').innerHTML = keys.length
      ? keys.map(k => `<li><span>${net.label(k)}</span><b>${me.inv[k]}</b></li>`).join('')
      : '<li class="empty">Nog leeg. Jaag, oogst of breng vee terug.</li>';
    $('btn-turnin').disabled = !keys.length;
    $('bag-roles').textContent = me.roles.length ? 'Jouw rollen: ' + me.roles.map(r => net.roleLabel(r)).join(', ') : 'Je hebt nog geen rol.';
  }

  on('net-turnin', (e) => {
    $('turnin-code').textContent = e.detail.code;
    $('turnin-help').textContent = net.layout.turnIn.help;
    $('turnin-box').hidden = false;
    sfxGood();
  });

  // --------------------------------------------- berichten van de server
  on('net-msg', (e) => {
    const tone = e.detail.tone || 'info';
    toast(e.detail.text, 3500, tone);
    if (tone === 'good') sfxGood(); else if (tone === 'bad') sfxBad();
  });
  on('net-event', (e) => {
    const ev = e.detail;
    const mine = ev.by === net.id;
    if (ev.kind === 'escape') { sfxBad(); toast('⚠ ' + ev.text + ' Houd het in je vizier en leid het door de opening terug.', 4500, 'bad'); }
    feedLine(ev.text, mine);
  });
  on('net-shot', (e) => { if (e.detail.by !== net.id) sfxShot(0.25); });

  // ------------------------------------------------------- vizier/knop
  on('follow-count', (e) => { const r = $('reticle'); if (r) r.classList.toggle('lock', e.detail > 0); });
  on('farm-stats', (e) => { $('stat-outside').textContent = e.detail.outside; $('stat-returned').textContent = e.detail.returned; });
  on('shot-local', () => { sfxShot(); flash(); });
  on('action-info', (e) => { sfxBad(); toast(e.detail.msg, 2200); });

  const ACTION = {
    jacht: { text: 'VUUR', cls: 'k-jacht' }, melk: { text: 'MELK', cls: 'k-melk' },
    oogst: { text: 'OOGST', cls: 'k-oogst' }, groei: { text: '…', cls: 'k-groei' },
  };
  on('aim-change', (e) => {
    const a = e.detail, conf = a ? ACTION[a.kind] : null;
    $('btn-action').className = 'actionbtn ' + (a && a.locked ? 'k-locked' : conf ? conf.cls : 'k-none');
    $('action-label').textContent = a && a.locked ? '🔒' : conf ? conf.text : 'VUUR';
    const info = $('aim-info');
    info.textContent = a ? a.label : '';
    info.classList.toggle('show', !!a);
    $('reticle').classList.toggle('aim', !!a && a.kind !== 'groei');
  });

  function act() {
    audio();
    const scene = document.querySelector('a-scene');
    if (scene && scene.systems && scene.systems.interact) scene.systems.interact.doAction();
  }

  on('gps-waiting', () => { const g = $('gpsstatus'); g.textContent = '📡 Wachten op GPS… (open lucht)'; g.hidden = false; });
  on('farm-placed', () => {
    $('gpsstatus').hidden = true;
    if (V25.camError) toast('⚠ Geen camerabeeld (' + V25.camError + ') — speelt verder zonder.', 4000, 'bad');
  });

  // ----------------------------------------------------------- bedrading
  function wire() {
    $('btn-action').addEventListener('click', act);
    document.addEventListener('keydown', (e) => {
      if (!$('bag').hidden || e.target.tagName === 'INPUT') return;
      if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') { e.preventDefault(); act(); }
    });
    $('btn-bag').addEventListener('click', () => { $('turnin-box').hidden = true; renderBag(); $('bag').hidden = false; });
    $('btn-bag-close').addEventListener('click', () => { $('bag').hidden = true; });
    $('btn-turnin').addEventListener('click', () => {
      if (confirm('Alles inleveren? Je tas wordt leeggemaakt en je krijgt een code voor de handelspost.')) net.send({ t: 'turnin' });
    });
    $('btn-code').addEventListener('click', () => {
      const v = $('code-in').value.trim();
      if (!v) return;
      if (net.send({ t: 'code', code: v })) $('code-in').value = '';
      else toast('Geen verbinding.', 2000, 'bad');
    });
    if (V25.placeInFront) {
      const r = $('btn-recenter');
      r.hidden = false;
      r.addEventListener('click', () => { V25.placeInFront(); toast('Paddock opnieuw voor je neergezet.', 1500); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
