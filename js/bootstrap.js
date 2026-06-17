/*
 * Vault 25 AR Farm — bouwt de A-Frame scene op basis van de config.
 *
 * Twee modi:
 *   - GPS/AR (standaard): camera-passthrough + plaatsing op echte GPS-locatie.
 *   - demoMode: gewone 3D-weergave om binnen te testen (sleep/kijk met muis,
 *     of beweeg met de pijltjes/WASD-toetsen).
 */
(function () {
  const CFG = window.VAULT25_CONFIG;

  function build() {
    const scene = document.createElement('a-scene');
    scene.setAttribute('vr-mode-ui', 'enabled: false');
    scene.setAttribute('renderer', 'antialias: true; alpha: true; logarithmicDepthBuffer: true');

    // Wortel-entiteit die de hele boerderij bevat (farm-builder vult 'm).
    const farm = document.createElement('a-entity');
    farm.setAttribute('farm-builder', '');

    // Wat licht zodat de modellen niet pikzwart zijn.
    const light1 = document.createElement('a-entity');
    light1.setAttribute('light', 'type: ambient; intensity: 0.9');
    const light2 = document.createElement('a-entity');
    light2.setAttribute('light', 'type: directional; intensity: 0.7');
    light2.setAttribute('position', '1 4 2');
    scene.appendChild(light1);
    scene.appendChild(light2);

    if (CFG.demoMode) {
      buildDemo(scene, farm);
    } else {
      buildAR(scene, farm);
    }

    document.body.appendChild(scene);
  }

  // --- Echte AR met GPS ---------------------------------------------------
  function buildAR(scene, farm) {
    scene.setAttribute('arjs',
      'sourceType: webcam; videoTexture: true; debugUIEnabled: false');

    // Camera die de GPS van de speler volgt.
    const camera = document.createElement('a-camera');
    camera.setAttribute('gps-new-camera',
      'gpsMinDistance: 0.5; simulateAltitude: 0');
    scene.appendChild(camera);

    // Plaats de boerderij-wortel op het GPS-anker; kinderen staan in
    // lokale meters daaromheen.
    farm.setAttribute('gps-new-entity-place',
      `latitude: ${CFG.anchor.latitude}; longitude: ${CFG.anchor.longitude}`);
    scene.appendChild(farm);
  }

  // --- Demo / binnen testen ----------------------------------------------
  function buildDemo(scene, farm) {
    scene.setAttribute('background', 'color: #0b1a12');

    const sky = document.createElement('a-sky');
    sky.setAttribute('color', '#0d2417');
    scene.appendChild(sky);

    const camera = document.createElement('a-camera');
    // Begin een stukje "ten zuiden" van het centrum, kijkend naar het hek.
    camera.setAttribute('position', '0 1.6 14');
    camera.setAttribute('look-controls', 'pointerLockEnabled: false');
    camera.setAttribute('wasd-controls', 'acceleration: 25; fly: false');
    scene.appendChild(camera);
    scene.appendChild(farm);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else { build(); }
})();
