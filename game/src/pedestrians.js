// pedestrians.js — pejalan kaki di trotoar Porto Sol.
// Berjalan menuju target acak; lari menjauh bila mobil pemain mendekat.

import * as THREE from 'three';
import { WORLD } from './config.js';
import * as RND from './random.js';

const W = {
  bound: 355,
  roadSpacing: 60,
  roadWidth: 12,
  ...(WORLD || {}),
};

const FLEE_DIST = 3.5;
const FLEE_SPEED = 4;

// ---- util rng (lihat vehicles.js: rng = fungsi () => [0,1)) ----
function rf(rng) {
  if (typeof rng === 'function') return rng;
  if (rng && typeof rng.next === 'function') return () => rng.next();
  return Math.random;
}

function rr(rng, a, b) {
  return a + rf(rng)() * (b - a);
}

// RND diimpor sesuai kontrak; helper lokal di atas selalu tersedia.
void RND;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

// Pejalan kaki sederhana: body capsule + kepala.
export function makePedMesh(THREE, color) {
  const g = new THREE.Group();

  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.7 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.85 });

  for (const sx of [-0.13, 0.13]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.22), pants);
    leg.position.set(sx, 0.28, 0);
    g.add(leg);
  }

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 4, 10), cloth);
  body.position.y = 0.95;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), skin);
  head.position.y = 1.55;
  g.add(head);

  return g;
}

// Titik acak di trotoar: di samping garis jalan, offset setengah lebar jalan + 1.5 m.
function randomSidewalkPoint(rng) {
  const lines = [];
  for (let c = -300; c <= 300; c += W.roadSpacing) lines.push(c);
  const line = lines[Math.floor(rf(rng)() * lines.length)];
  const along = rr(rng, -320, 320);
  const side = (rf(rng)() < 0.5 ? -1 : 1) * (W.roadWidth / 2 + 1.5);
  if (rf(rng)() < 0.5) return { x: line + side, z: along };
  return { x: along, z: line + side };
}

const SHIRT_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0xfd79a8];

export function spawnPeds(G, rng, n) {
  for (let i = 0; i < n; i++) {
    const pos = randomSidewalkPoint(rng);
    const tgt = randomSidewalkPoint(rng);
    const color = SHIRT_COLORS[Math.floor(rf(rng)() * SHIRT_COLORS.length)];
    const walkSpeed = rr(rng, 1, 2);
    const mesh = makePedMesh(THREE, color);
    mesh.position.set(pos.x, 0, pos.z);
    G.scene.add(mesh);
    G.peds.push({
      mesh,
      x: pos.x,
      z: pos.z,
      heading: 0,
      speed: walkSpeed,
      walkSpeed,
      targetX: tgt.x,
      targetZ: tgt.z,
    });
  }
}

export function updatePeds(G, dt) {
  const pv = G.player && G.player.vehicle;

  for (const p of G.peds) {
    // Lari menjauh bila mobil pemain mendekat.
    let fleeing = false;
    if (pv) {
      const dCar = Math.hypot(pv.x - p.x, pv.z - p.z);
      if (dCar < FLEE_DIST) {
        fleeing = true;
        const ax = p.x - pv.x;
        const az = p.z - pv.z;
        const l = Math.hypot(ax, az) || 1;
        p.targetX = clamp(p.x + (ax / l) * 25, -W.bound, W.bound);
        p.targetZ = clamp(p.z + (az / l) * 25, -W.bound, W.bound);
        p.speed = FLEE_SPEED;
      }
    }
    if (!fleeing) p.speed = p.walkSpeed;

    const dx = p.targetX - p.x;
    const dz = p.targetZ - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 1) {
      // Sampai: pilih target trotoar baru.
      const tgt = randomSidewalkPoint(Math.random);
      p.targetX = tgt.x;
      p.targetZ = tgt.z;
    } else {
      const nx = dx / d;
      const nz = dz / d;
      p.x += nx * p.speed * dt;
      p.z += nz * p.speed * dt;
      p.heading = Math.atan2(nx, nz);
    }

    p.x = clamp(p.x, -W.bound, W.bound);
    p.z = clamp(p.z, -W.bound, W.bound);
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;
  }
}
