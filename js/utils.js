/*
 * Vault 25 AR Farm — wiskunde-hulpjes (geen afhankelijkheden)
 */
window.V25 = window.V25 || {};

V25.utils = {
  // Willekeurig getal tussen min en max
  rand(min, max) { return min + Math.random() * (max - min); },

  // Begrens een waarde
  clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },

  // Afstand in het XZ-vlak (grond)
  dist2D(ax, az, bx, bz) {
    const dx = ax - bx, dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  },

  // Punt-in-polygoon test (ray casting). polygon = [{x,z}, ...]
  pointInPolygon(x, z, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, zi = polygon[i].z;
      const xj = polygon[j].x, zj = polygon[j].z;
      const intersect = ((zi > z) !== (zj > z)) &&
        (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi);
      if (intersect) inside = true;
    }
    return inside;
  },

  // Zwaartepunt van een polygoon
  centroid(polygon) {
    let x = 0, z = 0;
    for (const p of polygon) { x += p.x; z += p.z; }
    return { x: x / polygon.length, z: z / polygon.length };
  },

  // Een willekeurig punt binnen de bounding box van de polygoon dat
  // ook echt binnen de polygoon ligt.
  randomPointInPolygon(polygon) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of polygon) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    for (let tries = 0; tries < 50; tries++) {
      const x = this.rand(minX, maxX);
      const z = this.rand(minZ, maxZ);
      if (this.pointInPolygon(x, z, polygon)) return { x, z };
    }
    return this.centroid(polygon);
  },

  // Korte checksum (FNV-1a, 4 tekens) voor de inlevercode.
  // Geen echte beveiliging — genoeg om overtypen/verzinnen te betrappen.
  hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(-4);
  },

  // Hoek (graden) tussen twee genormaliseerde richtingen in het XZ-vlak
  angleBetweenDeg(ax, az, bx, bz) {
    const dot = V25.utils.clamp(ax * bx + az * bz, -1, 1);
    return THREE.MathUtils.radToDeg(Math.acos(dot));
  },
};
