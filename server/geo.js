'use strict';
/*
 * Geometrie in farm-meters (x = oost, z = zuid). Zelfde wiskunde als de client.
 * Een "pose" is de camera van een speler in farm-lokale ruimte:
 *   { x, y, z, dx, dy, dz }  (positie + genormaliseerde kijkrichting)
 */

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi)) inside = !inside;
  }
  return inside;
}

function centroid(poly) {
  let x = 0, z = 0;
  for (const p of poly) { x += p.x; z += p.z; }
  return { x: x / poly.length, z: z / poly.length };
}

function randomPointInPolygon(poly) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  for (let i = 0; i < 50; i++) {
    const x = rand(minX, maxX), z = rand(minZ, maxZ);
    if (pointInPolygon(x, z, poly)) return { x, z };
  }
  return centroid(poly);
}

// Kijkrichting plat op de grond
function forward(pose) {
  const l = Math.hypot(pose.dx, pose.dz);
  return l < 1e-6 ? { x: 0, z: -1 } : { x: pose.dx / l, z: pose.dz / l };
}

// Grondpunt waar het vizier naar wijst (ingekort tot maxDist langs de kijklijn)
function gazeGround(pose, maxDist) {
  let x, z, hit = false;
  if (pose.dy < -0.03 && pose.y > 0) {
    const t = pose.y / -pose.dy;
    x = pose.x + pose.dx * t; z = pose.z + pose.dz * t; hit = true;
  } else {
    const f = forward(pose);
    x = pose.x + f.x * maxDist; z = pose.z + f.z * maxDist;
  }
  const h = dist(pose.x, pose.z, x, z);
  if (h > maxDist) {
    x = pose.x + (x - pose.x) * maxDist / h;
    z = pose.z + (z - pose.z) * maxDist / h;
  }
  return { x, z, hit };
}

// Hoek (graden) tussen de vlakke kijkrichting en de richting naar een punt
function flatAngleTo(pose, px, pz) {
  const d = dist(pose.x, pose.z, px, pz) || 1e-6;
  const f = forward(pose);
  const dot = clamp((f.x * (px - pose.x) + f.z * (pz - pose.z)) / d, -1, 1);
  return Math.acos(dot) * 180 / Math.PI;
}

// 3D-richten op een punt met een trefzone (zelfde regel als de client, iets ruimer
// voor netwerkvertraging)
function aimOk(pose, px, py, pz, radius, slack = 1.6) {
  const vx = px - pose.x, vy = py - pose.y, vz = pz - pose.z;
  const d = Math.hypot(vx, vy, vz) || 1e-6;
  const dot = clamp((vx * pose.dx + vy * pose.dy + vz * pose.dz) / d, -1, 1);
  const ang = Math.acos(dot) * 180 / Math.PI;
  const tol = Math.max(2.5, Math.atan(radius / d) * 180 / Math.PI * 1.3) * slack;
  return ang <= tol;
}

module.exports = { rand, clamp, dist, pointInPolygon, centroid, randomPointInPolygon, forward, gazeGround, flatAngleTo, aimOk };
