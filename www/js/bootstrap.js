/*
 * Vault 25 — scene opbouwen per modus, NA verbinding met de server
 *
 *   ?mode=sim      gewone 3D, geen camera/GPS
 *   ?mode=kamer    camera + gyro, geen GPS; paddock verkleind voor je
 *   ?mode=hier     GPS, paddock waar jij nu staat
 *   ?mode=terrein  GPS op het anker dat de server meestuurt (het event)
 *   &schaal=0.3    optioneel
 *
 * Camerabeeld: een eigen <video> achter de transparante 3D-laag (geen AR.js
 * "arjs"-systeem). Zo werkt alles zonder internet.
 */
(function () {
  const CFG = window.VAULT25_CONFIG;
  const net = V25.net;
  const params = new URLSearchParams(location.search);
  const MODES = ['sim', 'kamer', 'hier', 'terrein'];
  let mode = params.get('mode');
  if (!MODES.includes(mode)) mode = 'sim';
  const MC = (CFG.modes && CFG.modes[mode]) || {};
  const scale = parseFloat(params.get('schaal')) || MC.scale || 1;
  V25.mode = mode;
  V25.scale = scale;
  const needsTap = mode !== 'sim';

  let farm = null, built = false, tapped = !needsTap;
  const $ = (id) => document.getElementById(id);

  function baseScene() {
    const scene = document.createElement('a-scene');
    scene.setAttribute('vr-mode-ui', 'enabled: false');
    scene.setAttribute('device-orientation-permission-ui', 'enabled: false');
    scene.setAttribute('renderer', 'antialias: true; alpha: true; logarithmicDepthBuffer: true');
    const l1 = document.createElement('a-entity');
    l1.setAttribute('light', 'type: ambient; intensity: 0.9');
    const l2 = document.createElement('a-entity');
    l2.setAttribute('light', 'type: directional; intensity: 0.7');
    l2.setAttribute('position', '1 4 2');
    scene.appendChild(l1); scene.appendChild(l2);
    farm = document.createElement('a-entity');
    farm.setAttribute('farm-builder', '');
    farm.setAttribute('scale', `${scale} ${scale} ${scale}`);
    return scene;
  }

  function placeInFront() {
    const camEl = document.querySelector('[camera]');
    if (!camEl || !farm) return;
    const o = camEl.object3D, p = new THREE.Vector3(), d = new THREE.Vector3();
    o.getWorldPosition(p); o.getWorldDirection(d);
    d.multiplyScalar(-1); d.y = 0;
    if (d.lengthSq() < 1e-6) d.set(0, 0, -1);
    d.normalize();
    const dist = (MC.viewDistance ?? 14) * scale;
    const camH = mode === 'kamer' ? (MC.cameraHeight ?? 1.4) : -(net.layout.anchor.groundOffsetMeters ?? -1.6);
    farm.object3D.position.set(p.x + d.x * dist, p.y - camH, p.z + d.z * dist);
    farm.object3D.rotation.y = Math.atan2(-d.x, -d.z);
    farm.setAttribute('visible', true);
    document.dispatchEvent(new CustomEvent('farm-placed'));
  }

  function buildSim(scene) {
    scene.setAttribute('background', 'color: #0b1a12');
    const sky = document.createElement('a-sky'); sky.setAttribute('color', '#0d2417'); scene.appendChild(sky);
    const cam = document.createElement('a-camera');
    cam.setAttribute('position', `0 1.6 ${(MC.viewDistance ?? 14) * scale}`);
    cam.setAttribute('look-controls', 'pointerLockEnabled: false; magicWindowTrackingEnabled: false');
    cam.setAttribute('wasd-controls', 'acceleration: 25; fly: false');
    scene.appendChild(cam);
    scene.appendChild(farm);
  }

  function buildRoom(scene) {
    const cam = document.createElement('a-camera');
    cam.setAttribute('position', `0 ${MC.cameraHeight ?? 1.4} 0`);
    cam.setAttribute('look-controls', 'pointerLockEnabled: false; magicWindowTrackingEnabled: true');
    cam.setAttribute('wasd-controls', 'enabled: false');
    scene.appendChild(cam);
    farm.setAttribute('visible', false);
    scene.appendChild(farm);
    scene.addEventListener('loaded', () => setTimeout(placeInFront, 800));
  }

  function gpsCamera(scene) {
    const AR = CFG.ar || {};
    const cam = document.createElement('a-camera');
    cam.setAttribute('look-controls-enabled', 'false');
    cam.setAttribute('arjs-device-orientation-controls', `smoothingFactor: ${AR.smoothingFactor ?? 0.1}`);
    cam.setAttribute('gps-new-camera', `gpsMinDistance: ${AR.gpsMinDistance ?? 1}`);
    scene.appendChild(cam);
    return cam;
  }

  function buildHere(scene) {
    const cam = gpsCamera(scene);
    farm.setAttribute('visible', false);
    scene.appendChild(farm);
    let placed = false;
    cam.addEventListener('gps-camera-update-position', () => {
      if (!placed) { placed = true; setTimeout(placeInFront, 500); }
    });
    document.dispatchEvent(new CustomEvent('gps-waiting'));
  }

  function buildSite(scene) {
    gpsCamera(scene);
    const A = net.layout.anchor;
    const anchorEl = document.createElement('a-entity');
    anchorEl.setAttribute('gps-new-entity-place', `latitude: ${A.latitude}; longitude: ${A.longitude}`);
    farm.setAttribute('position', `0 ${A.groundOffsetMeters ?? -1.6} 0`);
    farm.setAttribute('rotation', `0 ${A.rotationDeg ?? 0} 0`);
    anchorEl.appendChild(farm);
    scene.appendChild(anchorEl);
    document.dispatchEvent(new CustomEvent('gps-waiting'));
    scene.querySelector('[gps-new-camera]').addEventListener('gps-camera-update-position', () => {
      document.dispatchEvent(new CustomEvent('farm-placed'));
    }, { once: true });
  }

  async function startCameraFeed() {
    if (document.getElementById('camfeed')) return;
    document.body.classList.add('cam-mode');
    const v = document.createElement('video');
    v.id = 'camfeed';
    v.setAttribute('playsinline', ''); v.setAttribute('autoplay', '');
    v.muted = true;
    document.body.prepend(v);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      v.srcObject = s;
      await v.play();
    } catch (e) {
      V25.camError = (e && e.message) || 'geen camera';
    }
  }

  async function requestOrientation() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission();
      }
    } catch (e) { /* niet fataal */ }
  }

  function build() {
    if (built || !tapped || !net.layout) return;
    built = true;
    const scene = baseScene();
    ({ sim: buildSim, kamer: buildRoom, hier: buildHere, terrein: buildSite })[mode](scene);
    document.body.appendChild(scene);
  }

  V25.placeInFront = (mode === 'kamer' || mode === 'hier') ? placeInFront : null;

  function start() {
    const loader = $('loader');
    document.addEventListener('net-hello', build);
    net.connect();

    if (needsTap) {
      if (loader) loader.classList.add('hidden');
      const info = $('tapstart-info');
      if (info) {
        info.textContent = {
          kamer: 'Houd je telefoon recht voor je. De paddock verschijnt verkleind voor je neus.',
          hier: 'Ga op een open plek staan. De paddock komt recht voor je zodra de GPS je gevonden heeft.',
          terrein: 'Loop naar de paddock op het terrein. Houd je telefoon rechtop.',
        }[mode];
      }
      $('tapstart').hidden = false;
      $('tapstart-btn').addEventListener('click', async () => {
        $('tapstart').hidden = true;
        if (loader) loader.classList.remove('hidden');
        await requestOrientation();
        await startCameraFeed();
        tapped = true;
        build();
      }, { once: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
