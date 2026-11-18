// player.js — Jax, karakter utama Porto Sol.
// Gerak jalan kaki (WASD relatif kamera, Shift lari) + masuk/keluar kendaraan (E).
// Koordinat: x timur, z selatan, y ke atas. Heading: forward = (sin h, 0, cos h).

import * as THREE from 'three';
import { WORLD, PLAYER } from './config.js';

const W = { bound: 355, ...(WORLD || {}) };
const P = {
  walkSpeed: 6,
  runSpeed: 11,
  ...(PLAYER || {}),
};

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

// Putar heading menuju target dengan kecepatan sudut maks (rad/detik),
// menangani wrap-around sudut.
function turnToward(h, target, maxStep) {
  let d = target - h;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return target;
  return h + Math.sign(d) * maxStep;
}

// Figur sederhana Jax: jaket oranye khas, celana gelap, topi.
export function createPlayer(THREE) {
  const g = new THREE.Group();

  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.7 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.6 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.8 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });

  // Kaki (dua kotak).
  for (const sx of [-0.17, 0.17]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.3), pants);
    leg.position.set(sx, 0.35, 0);
    g.add(leg);
  }

  // Badan (capsule = jaket oranye).
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.55, 6, 12), jacket);
  body.position.y = 1.08;
  g.add(body);

  // Lengan.
  for (const sx of [-0.44, 0.44]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.45, 4, 8), jacket);
    arm.position.set(sx, 1.05, 0);
    g.add(arm);
  }

  // Kepala.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), skin);
  head.position.y = 1.78;
  g.add(head);

  // Topi + lidah topi.
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.28, 0.12, 16), capMat);
  cap.position.y = 1.97;
  g.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.28), capMat);
  brim.position.set(0, 1.93, 0.3);
  g.add(brim);

  return { mesh: g, x: 0, z: 0, heading: 0, speed: 0, onFoot: true, vehicle: null };
}

export function enterVehicle(G, v) {
  const p = G.player;
  if (!p || !v) return;
  p.onFoot = false;
  p.vehicle = v;
  v.kind = 'player';
  p.mesh.visible = false;
}

export function exitVehicle(G) {
  const p = G.player;
  if (!p) return;
  const v = p.vehicle;
  p.onFoot = true;
  p.vehicle = null;
  if (v) {
    // Turun di sisi kanan kendaraan (relatif arah hadapnya).
    const sx = Math.cos(v.heading);
    const sz = -Math.sin(v.heading);
    p.x = v.x + sx * 2.4;
    p.z = v.z + sz * 2.4;
    p.heading = v.heading;
  }
  p.x = clamp(p.x, -W.bound, W.bound);
  p.z = clamp(p.z, -W.bound, W.bound);
  p.mesh.visible = true;
}

export function updatePlayer(G, dt) {
  const p = G.player;
  if (!p || !p.mesh) return;
  const keys = (G.input && G.input.keys) || new Set();

  // Tombol E ditangani main.js (tryEnterExitVehicle) — satu-satunya handler,
  // supaya sekali tekan tidak memicu masuk lalu keluar di frame yang sama.

  if (p.onFoot) {
    // Arah maju kamera, diproyeksikan ke bidang tanah.
    let fx = 0;
    let fz = -1;
    if (G.camera) {
      const dx = p.x - G.camera.position.x;
      const dz = p.z - G.camera.position.z;
      const len = Math.hypot(dx, dz) || 1;
      fx = dx / len;
      fz = dz / len;
    }
    // Kanan = maju diputar 90 derajat searah jarum jam (dilihat dari atas).
    const rx = -fz;
    const rz = fx;

    let mx = 0;
    let mz = 0;
    if (keys.has('KeyW')) { mx += fx; mz += fz; }
    if (keys.has('KeyS')) { mx -= fx; mz -= fz; }
    if (keys.has('KeyD')) { mx += rx; mz += rz; }
    if (keys.has('KeyA')) { mx -= rx; mz -= rz; }

    const ml = Math.hypot(mx, mz);
    if (ml > 0.001) {
      mx /= ml;
      mz /= ml;
      const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const sp = running ? P.runSpeed : P.walkSpeed;
      p.x += mx * sp * dt;
      p.z += mz * sp * dt;
      p.speed = sp;
      p.heading = turnToward(p.heading, Math.atan2(mx, mz), 10 * dt);
    } else {
      p.speed = 0;
    }
  } else if (p.vehicle) {
    // Mengendarai: posisi mengikuti kendaraan.
    p.x = p.vehicle.x;
    p.z = p.vehicle.z;
    p.heading = p.vehicle.heading;
    p.speed = p.vehicle.speed || 0;
  }

  p.x = clamp(p.x, -W.bound, W.bound);
  p.z = clamp(p.z, -W.bound, W.bound);
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.heading;
}
