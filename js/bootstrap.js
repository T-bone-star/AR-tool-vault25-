/*
 * Vault 25 AR Farm — bouwt de A-Frame scene op, per testmodus.
 *
 *   ?mode=sim      gewone 3D, geen camera/GPS (pc of telefoon)
 *   ?mode=kamer    camerabeeld + gyroscoop, geen GPS; boerderij verkleind voor je
 *   ?mode=hier     GPS-AR, boerderij wordt neergezet waar jij nu staat
 *   ?mode=terrein  GPS-AR op het vaste anker uit config.js (het event)
 *   &schaal=0.3    optioneel: overschrijft de schaal van de modus
 */
(function () {
  const CFG = window.VAULT25_CONFIG;
  const params = new URLSearchParams(location.search);
  const MODES = ['sim', 'kamer', 'hier', 'terrein'];
  let mode = params.get('mode');
  if (!MODES.includes(mode)) mode = CFG.demoMode ? 'sim' : 'terrein';
  const MC = (CFG.modes && CFG.modes[mode]) || {};
  const scale = parseFloat(params.get('schaal')) || MC.scale || 1;
  V25.mode = mode;
  V25.scale = scale;

  let farm = null;

  function baseScene() {
    const scene = document.createElement('a-scene');
    scene.setAttribute('vr-mode-ui', 'enabled: false');
    // We vragen zelf toestemming (startknop); A-Frame's eigen popup uit.
    scene.setAttribute('device-orientation-permission-ui', 'enabled: false');
    scene.setAttribute('renderer', 'antialias: true; alpha: true; logarithmicDepthBuffer: true');

    const light1 = document.createElement('a-entity');
    light1.setAttribute('light', 'type: ambient; intensity: 0.9');
    const light2 = document.createElement('a-entity');
    light2.setAttribute('light', 'type: directional; intensity: 0.7');
    light2.setAttribute('position', '1 4 2');
    scene.appendChild(light1);
    scene.appendChild(light2);

    farm = document.createElement('a-entity');
    farm.setAttribute('farm-builder', '');
    farm.setAttribute('scale', `${scale} ${scale} ${scale}`);
    return scene;
  }

  // Zet de boerderij recht voor de camera neer (modi kamer + hier).
  // De speler staat dan aan de akker-kant, kijkend naar het hek — net als in sim.
  function placeInFront() {
    const camEl = document.querySelector('[camera]');
    if (!camEl || !farm) return;
    const o = camEl.object3D;
    const p = new THREE.Vector3(), d = new THREE.Vector3();
    o.getWorldPosition(p);
    o.getWorldDirection(d);
    d.multiplyScalar(-1);
    d.y = 0;
    if (d.lengthSq() < 1e-6) d.set(0, 0, -1);
    d.normalize();
    const dist = (MC.viewDistance ?? 14) * scale;
    const camH = mode === 'kamer'
      ? (MC.cameraHeight ?? 1.4)
      : -(CFG.anchor.groundOffsetMeters ?? -1.6);
    farm.object3D.position.set(p.x + d.x * dist, p.y - camH, p.z + d.z * dist);
    farm.object3D.rotation.y = Math.atan2(-d.x, -d.z);
    farm.setAttribute('visible', true);
    document.dispatchEvent(new CustomEvent('farm-placed'));
  }

  // --- sim: overal, direct ------------------------------------------------
  function buildSim(scene) {
    scene.setAttribute('background', 'color: #0b1a12');
    const sky = document.createElement('a-sky');
    sky.setAttribute('color', '#0d2417');
    scene.appendChild(sky);

    const camera = document.createElement('a-camera');
    camera.setAttribute('position', `0 1.6 ${(MC.viewDistance ?? 14) * scale}`);
    // Telefoon: slepen om rond te kijken (geen gyro, zodat je op de bank kunt testen)
    camera.setAttribute('look-controls', 'pointerLockEnabled: false; magicWindowTrackingEnabled: false');
    camera.setAttribute('wasd-controls', 'acceleration: 25; fly: false');
    scene.appendChild(camera);
    scene.appendChild(farm);
  }

  // --- kamer: camerabeeld + gyro, geen GPS -------------------------------
  function buildRoom(scene) {
    document.body.classList.add('cam-mode');
    const camera = document.createElement('a-camera');
    camera.setAttribute('position', `0 ${MC.cameraHeight ?? 1.4} 0`);
    camera.setAttribute('look-controls', 'pointerLockEnabled: false; magicWindowTrackingEnabled: true');
    camera.setAttribute('wasd-controls', 'enabled: false');
    scene.appendChild(camera);
    farm.setAttribute('visible', false);
    scene.appendChild(farm);
    // Even wachten tot de gyro een richting heeft, dan neerzetten.
    scene.addEventListener('loaded', () => setTimeout(placeInFront, 800));
  }

  async function startCameraFeed() {
    const v = document.createElement('video');
    v.id = 'camfeed';
    v.setAttribute('playsinline', '');
    v.setAttribute('autoplay', '');
    v.muted = true;
    document.body.prepend(v);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false,
      });
      v.srcObject = stream;
      await v.play();
    } catch (e) {
      V25.camError = (e && e.message) || 'geen camera';
    }
  }

  // --- hier: GPS-AR, boerderij waar je nu staat ---------------------------
  function buildHere(scene) {
    const camera = arCamera(scene);
    farm.setAttribute('visible', false);
    scene.appendChild(farm);
    let placed = false;
    camera.addEventListener('gps-camera-update-position', () => {
      if (placed) return;
      placed = true;
      setTimeout(placeInFront, 500);
    });
    document.dispatchEvent(new CustomEvent('gps-waiting'));
  }

  // --- terrein: het echte event, vast anker -------------------------------
  function buildSite(scene) {
    arCamera(scene);
    const anchorEl = document.createElement('a-entity');
    anchorEl.setAttribute('gps-new-entity-place',
      `latitude: ${CFG.anchor.latitude}; longitude: ${CFG.anchor.longitude}`);
    farm.setAttribute('position', `0 ${CFG.anchor.groundOffsetMeters ?? -1.6} 0`);
    farm.setAttribute('rotation', `0 ${CFG.anchor.rotationDeg ?? 0} 0`);
    anchorEl.appendChild(farm);
    scene.appendChild(anchorEl);
  }

  function arCamera(scene) {
    const AR = CFG.ar || {};
    scene.setAttribute('arjs', 'sourceType: webcam; videoTexture: true; debugUIEnabled: false');
    const camera = document.createElement('a-camera');
    camera.setAttribute('look-controls-enabled', 'false');
    camera.setAttribute('arjs-device-orientation-controls',
      `smoothingFactor: ${AR.smoothingFactor ?? 0.1}`);
    camera.setAttribute('gps-new-camera', `gpsMinDistance: ${AR.gpsMinDistance ?? 1}`);
    scene.appendChild(camera);
    return camera;
  }

  function build() {
    const scene = baseScene();
    ({ sim: buildSim, kamer: buildRoom, hier: buildHere, terrein: buildSite })[mode](scene);
    document.body.appendChild(scene);
  }

  async function requestOrientation() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission();
      }
    } catch (e) { /* niet fataal */ }
  }

  V25.placeInFront = (mode === 'kamer' || mode === 'hier') ? placeInFront : null;

  function start() {
    // Kamer/hier hebben een tik nodig (iOS: sensor-toestemming + camera).
    if (mode === 'kamer' || mode === 'hier') {
      const ov = document.getElementById('tapstart');
      const info = document.getElementById('tapstart-info');
      const loader = document.getElementById('loader');
      if (loader) loader.classList.add('hidden');
      if (info) {
        info.textContent = mode === 'kamer'
          ? 'Houd je telefoon recht voor je. De paddock verschijnt verkleind voor je neus; draai rond om wild te zoeken.'
          : 'Ga op een open plek staan (park, grasveld). De paddock wordt recht voor je neergezet zodra de GPS je gevonden heeft.';
      }
      ov.hidden = false;
      document.getElementById('tapstart-btn').addEventListener('click', async () => {
        ov.hidden = true;
        if (loader) loader.classList.remove('hidden');
        await requestOrientation();
        if (mode === 'kamer') await startCameraFeed();
        build();
      }, { once: true });
    } else {
      build();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else { start(); }
})();
