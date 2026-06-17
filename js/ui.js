/*
 * Vault 25 AR Farm — HUD / meldingen
 */
(function () {
  function ready() {
    const stat = document.getElementById('stat-outside');
    const ret = document.getElementById('stat-returned');
    const toast = document.getElementById('toast');
    const loader = document.getElementById('loader');

    let toastTimer = null;
    function showToast(msg) {
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
    }

    const scene = document.querySelector('a-scene');

    scene.addEventListener('farm-ready', () => {
      if (loader) loader.classList.add('hidden');
    });

    scene.addEventListener('farm-stats', (e) => {
      const s = e.detail;
      if (stat) stat.textContent = s.outside;
      if (ret) ret.textContent = s.returned;
    });

    scene.addEventListener('animal-escaped', (e) => {
      showToast(`⚠ Een ${e.detail.type} is uitgebroken! Richt je camera erop om 'm terug te lokken.`);
    });

    scene.addEventListener('animal-returned', (e) => {
      showToast(`✓ De ${e.detail.type} is terug in de paddock.`);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else { ready(); }
})();
