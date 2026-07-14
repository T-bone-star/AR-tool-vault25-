/*
 * Vault 25 AR Farm — HUD / meldingen
 *
 * Belangrijk: we luisteren op `document` en NIET op de <a-scene>, want die
 * bestaat nog niet als dit script laadt (bootstrap.js bouwt 'm pas later).
 * A-Frame events bubbelen standaard omhoog, dus document vangt alles.
 */
(function () {
  const stat = () => document.getElementById('stat-outside');
  const ret = () => document.getElementById('stat-returned');

  let toastTimer = null;
  function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
  }

  function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('hidden');
  }

  document.addEventListener('farm-ready', hideLoader);
  // Vangnet: mocht 'farm-ready' ooit niet aankomen, laat de speler niet
  // eeuwig naar het laadscherm staren.
  setTimeout(hideLoader, 12000);

  document.addEventListener('farm-stats', (e) => {
    const s = e.detail;
    if (stat()) stat().textContent = s.outside;
    if (ret()) ret().textContent = s.returned;
  });

  document.addEventListener('animal-escaped', (e) => {
    showToast(`⚠ Een ${e.detail.type} is uitgebroken! Richt je vizier erop om 'm terug te lokken.`);
  });

  document.addEventListener('animal-returned', (e) => {
    showToast(`✓ De ${e.detail.type} is terug in de paddock.`);
  });

  // Vizier-feedback: licht op zolang een dier je volgt.
  let following = 0;
  function updateReticle() {
    const r = document.getElementById('reticle');
    if (r) r.classList.toggle('lock', following > 0);
  }
  document.addEventListener('animal-follow-start', () => { following++; updateReticle(); });
  document.addEventListener('animal-follow-end', () => {
    following = Math.max(0, following - 1); updateReticle();
  });
})();
