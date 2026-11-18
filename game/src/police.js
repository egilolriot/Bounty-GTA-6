// police.js — mobil polisi Porto Sol: kejar pemain saat wanted > 0.
// Jumlah aktif = min(wanted, 3). Saat wanted 0, polisi melambat lalu pergi
// (dihapus setelah 10 detik menjauh).

import * as THREE from 'three';
import { WORLD } from './config.js';

const W = { bound: 355, roadSpacing: 60, ...(WORLD || {}) };

const MAX_COPS = 3;
const CHASE_SPEED = 44; // di antara 40-46
const BUST_DIST = 5;
const RAM_DIST = 4.5;
const LEAVE_AFTER = 10; // detik menjauh sebelum dihapus
const RAM_WANTED_COOLDOWN = 3; // detik antar kenaikan wanted akibat tabrakan

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function approach(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  if (v > target) return Math.max(target, v - step);
  return v;
}

function turnToward(h, target, maxStep) {
  let d = target - h;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return target;
  return h + Math.sign(d) * maxStep;
}

function syncMesh(car) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
}

function removeCar(G, car) {
  G.scene.remove(car.mesh);
  const i = G.vehicles.indexOf(car);
  if (i >= 0) G.vehicles.splice(i, 1);
}

// Mobil polisi: body hitam, pintu/stripe putih, lightbar merah-biru emissive.
function makePoliceMesh(THREE) {
  const g = new THREE.Group();

  const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.35, metalness: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.15, metalness: 0.8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, 4.4), black);
  body.position.y = 0.65;
  g.add(body);

  // Stripe putih di sisi body.
  for (const sx of [-1.01, 1.01]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 3.4), white);
    stripe.position.set(sx, 0.65, 0);
    g.add(stripe);
  }

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.2), glass);
  cabin.position.set(0, 1.3, -0.3);
  g.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 });
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w);
  }

  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff6c9, emissive: 0xffedb5, emissiveIntensity: 1.2,
  });
  for (const lx of [-0.65, 0.65]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.08), headMat);
    l.position.set(lx, 0.7, 2.21);
    g.add(l);
  }

  // Lightbar: merah kiri, biru kanan, di atap kabin.
  const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.4), black);
  barBase.position.set(0, 1.7, -0.3);
  g.add(barBase);
  const redMat = new THREE.MeshStandardMaterial({
    color: 0x880000, emissive: 0xff0000, emissiveIntensity: 2,
  });
  const blueMat = new THREE.MeshStandardMaterial({
    color: 0x000088, emissive: 0x2244ff, emissiveIntensity: 0.2,
  });
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.42), redMat);
  red.position.set(-0.38, 1.78, -0.3);
  g.add(red);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.42), blueMat);
  blue.position.set(0.38, 1.78, -0.3);
  g.add(blue);

  return { group: g, redMat, blueMat };
}

function nearestLine(v) {
  return Math.round(v / W.roadSpacing) * W.roadSpacing;
}

export function spawnPoliceCar(G) {
  const p = G.player || { x: 0, z: 0 };

  // Letakkan di jalan terdekat dari pemain, ~40 m darinya, menghadap pemain.
  const lx = nearestLine(p.x);
  const lz = nearestLine(p.z);
  let x;
  let z;
  if (Math.abs(p.x - lx) <= Math.abs(p.z - lz)) {
    x = clamp(lx, -340, 340);
    z = clamp(p.z + (p.z >= 0 ? -40 : 40), -340, 340);
  } else {
    x = clamp(p.x + (p.x >= 0 ? -40 : 40), -340, 340);
    z = clamp(lz, -340, 340);
  }
  const heading = Math.atan2(p.x - x, p.z - z);

  const built = makePoliceMesh(THREE);
  const mesh = built.group;
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  G.scene.add(mesh);

  const car = {
    mesh,
    x,
    z,
    heading,
    speed: 0,
    color: 0x111111,
    kind: 'police',
    maxSpeed: 46,
    leaving: false,
    leaveT: 0,
    _ramT: -99,
    _redMat: built.redMat,
    _blueMat: built.blueMat,
  };
  G.vehicles.push(car);
  return car;
}

export function policeCount(G) {
  let n = 0;
  for (const v of G.vehicles) if (v.kind === 'police') n++;
  return n;
}

export function setWanted(G, n) {
  const prev = G.wanted || 0;
  G.wanted = clamp(n, 0, 5);
  if (G.wanted >= 1 && G.wanted > prev && policeCount(G) === 0) {
    const target = Math.min(G.wanted, MAX_COPS);
    for (let i = 0; i < target; i++) spawnPoliceCar(G);
  }
}

export function updatePolice(G, dt) {
  const p = G.player;
  const wanted = G.wanted || 0;
  const desired = wanted > 0 ? Math.min(wanted, MAX_COPS) : 0;

  // Tambah bila kurang dari target.
  while (policeCount(G) < desired) spawnPoliceCar(G);

  const cops = G.vehicles.filter((v) => v.kind === 'police');
  const now = G.time || 0;

  cops.forEach((car, idx) => {
    // Mobil di luar kuota aktif (atau semua saat wanted 0) pergi meninggalkan kota.
    car.leaving = idx >= desired;

    if (car.leaving) {
      car.leaveT = (car.leaveT || 0) + dt;
      const px = p ? p.x : 0;
      const pz = p ? p.z : 0;
      const away = Math.atan2(car.x - px, car.z - pz);
      car.heading = turnToward(car.heading, away, 2.5 * dt);
      car.speed = approach(car.speed, 30, 10 * dt);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      car.x = clamp(car.x, -W.bound, W.bound);
      car.z = clamp(car.z, -W.bound, W.bound);
      syncMesh(car);
      if (car.leaveT >= LEAVE_AFTER) removeCar(G, car);
      return;
    }

    car.leaveT = 0;
    if (!p) {
      syncMesh(car);
      return;
    }

    // Kejar pemain.
    const dx = p.x - car.x;
    const dz = p.z - car.z;
    const dist = Math.hypot(dx, dz);
    car.heading = turnToward(car.heading, Math.atan2(dx, dz), 2.2 * dt);
    car.speed = approach(car.speed, CHASE_SPEED, 12 * dt);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    car.x = clamp(car.x, -W.bound, W.bound);
    car.z = clamp(car.z, -W.bound, W.bound);

    // Tangkap pemain jalan kaki: kurangi health.
    if (dist < BUST_DIST && p.onFoot) {
      G.health = Math.max(0, (G.health ?? 100) - 8 * dt);
    }

    // Tabrak mobil pemain: perlambat pemain, naikkan wanted (maks 1x / 3 detik).
    if (!p.onFoot && p.vehicle && dist < RAM_DIST) {
      p.vehicle.speed *= 0.4;
      if (G.wanted < 5 && now - (car._ramT || -99) >= RAM_WANTED_COOLDOWN) {
        car._ramT = now;
        G.wanted = Math.min(5, (G.wanted || 0) + 1);
      }
      car.x -= Math.sin(car.heading) * 2;
      car.z -= Math.cos(car.heading) * 2;
    }

    // Lightbar berkedip bergantian merah/biru (bila mobil punya lightbar).
    const phase = Math.floor(now * 6) % 2 === 0;
    if (car._redMat) car._redMat.emissiveIntensity = phase ? 2.5 : 0.2;
    if (car._blueMat) car._blueMat.emissiveIntensity = phase ? 0.2 : 2.5;

    syncMesh(car);
  });
}
