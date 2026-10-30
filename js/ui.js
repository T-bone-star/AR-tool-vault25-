/*
 * Vault 25 AR Farm — HUD, knoppen, tas, meldingen en geluid
 *
 * We luisteren op `document`: de <a-scene> bestaat nog niet als dit script
 * laadt, en A-Frame events bubbelen omhoog.
 */
(function () {
  const CFG = window.VAULT25_CONFIG;
  const $ = (id) => document.getElementById(id);
  const on = (ev, fn) => document.addEventListener(ev, fn);

  // ---------------------------------------------------------------- toasts
  let toastTimer = null;
  function toast(msg, ms = 3500) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // Buit-melding ("+2 Tato  +1 Vlees"), korte bundeling zodat het één pil wordt.
  let lootPending = {}, lootTimer = null, lootHide = null;
  function lootPill(key, n) {
    if (!key || n <= 0) return;
    lootPending[key] = (lootPending[key] || 0) + n;
    clearTimeout(lootTimer);
    lootTimer = setTimeout(() => {
      const el = $('loot');
      if (!el) return;
      el.textContent = Object.entries(lootPending)
        .map(([k, v]) => `+${v} ${V25.inv.label(k)}`).join('   ');
      lootPending = {};
      el.classList.add('show');
      clearTimeout(lootHide);
      lootHide = setTimeout(() => el.classList.remove('show'), 1800);
    }, 200);
  }

  // ----------------------------------------------------------------- geluid
  let ac = null;
  function audio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function sfxShot() {
    const a = audio(); if (!a) return;
    const len = Math.floor(0.2 * a.sampleRate);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1600;
    const g = a.createGain(); g.gain.value = 0.7;
    src.connect(f).connect(g).connect(a.destination);
    src.start();
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

  function flash() {
    const f = $('flash');
    if (!f) return;
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }

  // ------------------------------------------------------------ status/HUD
  function hideLoader() { const l = $('loader'); if (l) l.classList.add('hidden'); }
  on('farm-ready', hideLoader);
  setTimeout(hideLoader, 12000);

  on('farm-stats', (e) => {
    if ($('stat-outside')) $('stat-outside').textContent = e.detail.outside;
    if ($('stat-returned')) $('stat-returned').textContent = e.detail.returned;
  });

  on('gps-waiting', () => {
    const g = $('gpsstatus');
    if (g) { g.textContent = '📡 Wachten op GPS… (even naar buiten / open lucht)'; g.hidden = false; }
  });
  on('farm-placed', () => {
    const g = $('gpsstatus'); if (g) g.hidden = true;
    if (V25.camError) toast('⚠ Geen camerabeeld (' + V25.camError + ') — draait verder zonder.');
  });

  // ------------------------------------------------------------- vee/wild
  on('animal-escaped', (e) => {
    sfxBad();
    toast(`⚠ Een ${e.detail.type} is uitgebroken! Houd 'm in je vizier en leid 'm terug door de opening.`);
  });
  on('animal-returned', (e) => { sfxGood(); toast(`✓ De ${e.detail.type} is terug in de paddock.`); });
  on('animal-blocked', (e) => toast(`De ${e.detail.type} staat tegen het hek — leid 'm naar de opening.`));
  on('animal-milked', () => sfxGood());
  on('critter-killed', (e) => { sfxGood(); toast(`🎯 ${e.detail.label} geveld.`, 2000); });
  on('critter-missed', (e) => toast(`Mis! De ${e.detail.label.toLowerCase()} vlucht.`, 1800));
  on('crop-ripe', (e) => toast(`🌱 De ${e.detail.label.toLowerCase()} is rijp om te oogsten.`));
  on('harvested', () => sfxGood());
  on('action-info', (e) => { sfxBad(); toast(e.detail.msg, 2000); });
  on('shot', () => { sfxShot(); flash(); });

  // Vizier licht amber op zolang een dier je volgt
  let following = 0;
  function lockReticle() { const r = $('reticle'); if (r) r.classList.toggle('lock', following > 0); }
  on('animal-follow-start', () => { following++; lockReticle(); });
  on('animal-follow-end', () => { following = Math.max(0, following - 1); lockReticle(); });

  // ------------------------------------------------------------ actieknop
  const ACTION = {
    jacht: { text: 'VUUR', cls: 'k-jacht' },
    melk: { text: 'MELK', cls: 'k-melk' },
    oogst: { text: 'OOGST', cls: 'k-oogst' },
    groei: { text: '…', cls: 'k-groei' },
  };
  on('aim-change', (e) => {
    const a = e.detail;
    const btn = $('btn-action'), lab = $('action-label'), info = $('aim-info'), ret = $('reticle');
    const conf = a ? ACTION[a.kind] : null;
    if (btn) btn.className = 'actionbtn ' + (conf ? conf.cls : 'k-none');
    if (lab) lab.textContent = conf ? conf.text : 'VUUR';
    if (info) { info.textContent = a ? a.label : ''; info.classList.toggle('show', !!a); }
    if (ret) ret.classList.toggle('aim', !!a && a.kind !== 'groei');
  });

  function act() {
    audio(); // eerste tik ontgrendelt geluid op iOS
    const scene = document.querySelector('a-scene');
    if (scene && scene.systems && scene.systems.interact) scene.systems.interact.doAction();
  }

  // ------------------------------------------------------------------ tas
  function renderBag() {
    const list = $('bag-list');
    if (!list) return;
    const items = V25.inv.items;
    const keys = Object.keys(CFG.items).filter(k => items[k] > 0);
    list.innerHTML = keys.length
      ? keys.map(k => `<li><span>${V25.inv.label(k)}</span><b>${items[k]}</b></li>`).join('')
      : '<li class="empty">Nog leeg. Jaag, oogst of melk iets.</li>';
    $('btn-turnin').disabled = !keys.length;
  }
  function updateInvCount() { if ($('stat-inv')) $('stat-inv').textContent = V25.inv.total(); }

  on('inv-change', (e) => {
    updateInvCount();
    lootPill(e.detail.key, e.detail.n);
    if (!$('bag').hidden) renderBag();
  });

  function wire() {
    const label = $('theme-label');
    if (label) label.textContent = (CFG.theme && CFG.theme.label) || 'VAULT 25';
    updateInvCount();

    $('btn-action').addEventListener('click', act);
    document.addEventListener('keydown', (e) => {
      if (!$('bag').hidden) return;
      if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') { e.preventDefault(); act(); }
    });

    $('btn-bag').addEventListener('click', () => {
      $('turnin-box').hidden = true;
      $('btn-turnin').textContent = CFG.turnIn.buttonLabel;
      renderBag();
      $('bag').hidden = false;
    });
    $('btn-bag-close').addEventListener('click', () => { $('bag').hidden = true; });

    $('btn-turnin').addEventListener('click', () => {
      const code = V25.inv.makeCode();
      if (!code) return;
      $('turnin-code').textContent = code;
      $('turnin-help').textContent = CFG.turnIn.help;
      $('turnin-box').hidden = false;
    });
    $('btn-clear').addEventListener('click', () => {
      if (confirm('Heeft de SL/handelaar de code gezien? Dan wordt je tas nu leeggemaakt.')) {
        V25.inv.clear();
        $('turnin-box').hidden = true;
        renderBag();
      }
    });

    if (V25.placeInFront) {
      const r = $('btn-recenter');
      r.hidden = false;
      r.addEventListener('click', () => { V25.placeInFront(); toast('Paddock opnieuw voor je neergezet.', 1500); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
