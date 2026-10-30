/*
 * Vault 25 — blok-modellen. Alles kijkt langs +x; de code draait het mee.
 * Eigen .glb-modellen: zie assets/README.md.
 */
(function () {
  window.V25 = window.V25 || {};

  function box(p, w, h, d, x, y, z, color) {
    const e = document.createElement('a-box');
    e.setAttribute('width', w); e.setAttribute('height', h); e.setAttribute('depth', d);
    e.setAttribute('position', `${x} ${y} ${z}`);
    e.setAttribute('material', `color: ${color}; roughness: 1`);
    p.appendChild(e);
    return e;
  }
  function cyl(p, r, h, x, y, z, color) {
    const e = document.createElement('a-cylinder');
    e.setAttribute('radius', r); e.setAttribute('height', h);
    e.setAttribute('position', `${x} ${y} ${z}`);
    e.setAttribute('material', `color: ${color}; roughness: 1`);
    p.appendChild(e);
    return e;
  }
  const LEG = '#5b4a30';

  const livestock = {
    // De iconische tweekoppige koe
    brahmin(p, c) {
      box(p, 1.4, 0.8, 0.7, 0, 0.95, 0, c);
      for (const [x, z] of [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]]) cyl(p, 0.08, 0.55, x, 0.28, z, LEG);
      for (const off of [-0.18, 0.18]) {
        cyl(p, 0.1, 0.5, 0.75, 1.25, off, c);
        box(p, 0.35, 0.3, 0.3, 0.95, 1.5, off, c);
        box(p, 0.08, 0.12, 0.08, 1.1, 1.6, off + 0.08, '#3a2f1f');
        box(p, 0.08, 0.12, 0.08, 1.1, 1.6, off - 0.08, '#3a2f1f');
      }
    },
    radstag(p, c) {
      box(p, 1.0, 0.6, 0.5, 0, 0.85, 0, c);
      for (const [x, z] of [[-0.4, -0.18], [0.4, -0.18], [-0.4, 0.18], [0.4, 0.18]]) cyl(p, 0.05, 0.6, x, 0.3, z, LEG);
      cyl(p, 0.08, 0.5, 0.5, 1.2, 0, c);
      box(p, 0.3, 0.25, 0.25, 0.65, 1.45, 0, c);
      for (const s of [-1, 1]) {
        const a = document.createElement('a-cone');
        a.setAttribute('radius-bottom', 0.04); a.setAttribute('radius-top', 0); a.setAttribute('height', 0.4);
        a.setAttribute('position', `0.6 1.7 ${0.12 * s}`);
        a.setAttribute('rotation', `0 0 ${20 * s}`);
        a.setAttribute('material', 'color: #cfc6b0; roughness: 1');
        p.appendChild(a);
      }
    },
    molerat(p, c) {
      box(p, 0.9, 0.45, 0.5, 0, 0.3, 0, c);
      box(p, 0.3, 0.3, 0.35, 0.55, 0.3, 0, c);
      for (const [x, z] of [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]]) cyl(p, 0.05, 0.25, x, 0.13, z, LEG);
    },
  };

  const wild = {
    radroach(p, c) {
      box(p, 0.55, 0.14, 0.32, 0, 0.12, 0, c);
      box(p, 0.16, 0.10, 0.20, 0.33, 0.12, 0, '#3a2412');
      box(p, 0.30, 0.02, 0.02, 0.52, 0.17, 0.06, '#2a1a0c');
      box(p, 0.30, 0.02, 0.02, 0.52, 0.17, -0.06, '#2a1a0c');
      for (const x of [-0.15, 0, 0.15]) box(p, 0.03, 0.08, 0.46, x, 0.04, 0, '#2a1a0c');
    },
    molerat(p, c) {
      box(p, 0.70, 0.30, 0.35, 0, 0.24, 0, c);
      box(p, 0.25, 0.20, 0.25, 0.45, 0.22, 0, c);
      box(p, 0.04, 0.10, 0.12, 0.58, 0.10, 0, '#f2ead8');
      for (const [x, z] of [[-0.25, 0.15], [0.25, 0.15], [-0.25, -0.15], [0.25, -0.15]]) box(p, 0.07, 0.12, 0.07, x, 0.06, z, LEG);
    },
    gecko(p, c) {
      box(p, 0.70, 0.22, 0.26, 0, 0.26, 0, c);
      box(p, 0.30, 0.20, 0.24, 0.48, 0.32, 0, c);
      box(p, 0.60, 0.10, 0.10, -0.62, 0.22, 0, c);
      box(p, 0.05, 0.05, 0.05, 0.62, 0.38, 0.08, '#ffcf3c');
      box(p, 0.05, 0.05, 0.05, 0.62, 0.38, -0.08, '#ffcf3c');
      for (const [x, z] of [[-0.25, 0.16], [0.25, 0.16], [-0.25, -0.16], [0.25, -0.16]]) box(p, 0.07, 0.16, 0.07, x, 0.08, z, '#4a5a2a');
    },
  };

  // Naambordje als sprite (geen a-text: dat haalt een lettertype van internet)
  function nameTag(text, color) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(3,21,11,0.8)';
    g.fillRect(0, 8, 256, 48);
    g.strokeStyle = color; g.lineWidth = 3;
    g.strokeRect(2, 10, 252, 44);
    g.fillStyle = color;
    g.font = 'bold 28px Courier New, monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(text).slice(0, 14), 128, 33);
    const tex = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(1.6, 0.4, 1);
    return s;
  }

  // Spelerfiguur: lijf + hoofd + vizierstreep in de kijkrichting
  function avatar(p, name, roles) {
    const color = roles.includes('jager') ? '#ff6b4a' : roles.includes('boer') ? '#ffd23c' : '#3cff8e';
    cyl(p, 0.22, 1.1, 0, 0.55, 0, color);
    const head = document.createElement('a-sphere');
    head.setAttribute('radius', 0.18);
    head.setAttribute('position', '0 1.32 0');
    head.setAttribute('material', `color: ${color}; roughness: 1`);
    p.appendChild(head);
    box(p, 0.5, 0.04, 0.04, 0.3, 1.32, 0, '#ffffff');   // kijkrichting
    const tag = nameTag(name, color);
    tag.position.set(0, 1.85, 0);
    p.object3D.add(tag);
    return { color };
  }

  V25.models = { livestock, wild, avatar, nameTag };
})();
