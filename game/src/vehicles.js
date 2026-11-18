// vehicles.js — mobil traffic + mobil pemain.
// Jalan kota mengikuti grid: garis jalan tiap 60 m pada x dan z.
// Heading: forward = (sin h, 0, cos h). Depan mobil lokal = +z.

import * as THREE from 'three';
import { WORLD, PLAYER } from './config.js';
import * as RND from './random.js';

const W = {
  bound: 355,
  roadSpacing: 60,
  roadWidth: 12,
  ...(WORLD || {}),
};
const P = {
  driveAccel: 20,
  maxSpeed: 42,
  reverseSpeed: 12,
  turnRate: 2.0,
  ...(PLAYER || {}),
};

// ---- util rng ----
// rng yang dilewatkan pemanggil adalah fungsi () => [0,1).
// Bila pemanggil memberi objek dengan .next(), pakai itu; bila tidak ada, Math.random.
function rf(rng) {
  if (typeof rng === 'function') return rng;
  if (rng && typeof rng.next === 'function') return () => rng.next();
  return Math.random;
}

function rr(rng, a, b) {
  return a + rf(rng)() * (b - a);
}

function pick(rng, arr) {
  return arr[Math.floor(rf(rng)() * arr.length)];
}

// RND diimpor sesuai kontrak (dipakai bila modul random menyediakan helper
// bernama sama); fallback lokal di atas selalu tersedia.
void RND;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function approach(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  if (v > target) return Math.max(target, v - step);
  return v;
}

// Garis tengah jalan: -300..300 tiap 60 m (di dalam batas kota).
export function roadLines() {
  const lines = [];
  for (let c = -300; c <= 300; c += W.roadSpacing) lines.push(c);
  return lines;
}

function nearestLine(v) {
  return Math.round(v / W.roadSpacing) * W.roadSpacing;
}

// Mobil sederhana: body + kabin + 4 roda + lampu depan/taillight.
export function makeCarMesh(THREE, color) {
  const g = new THREE.Group();

  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.15, metalness: 0.8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, 4.4), paint);
  body.position.y = 0.65;
  g.add(body);

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

  // Lampu depan (emissive) di +z.
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff6c9, emissive: 0xffedb5, emissiveIntensity: 1.2,
  });
  for (const lx of [-0.65, 0.65]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.08), headMat);
    l.position.set(lx, 0.7, 2.21);
    g.add(l);
  }

  // Lampu belakang merah di -z.
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x550000, emissive: 0xcc0000, emissiveIntensity: 0.8,
  });
  for (const lx of [-0.65, 0.65]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.08), tailMat);
    t.position.set(lx, 0.7, -2.21);
    g.add(t);
  }

  return g;
}

const PALETTE = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x7d3c98, 0x1abc9c, 0xecf0f1, 0x2c3e50, 0xe67e22];

export function spawnTraffic(G, rng, n) {
  const lines = roadLines();
  for (let i = 0; i < n; i++) {
    const vertical = rf(rng)() < 0.5; // jalan membujur (sejajar z) atau melintang (sejajar x)
    const line = pick(rng, lines);
    const along = rr(rng, -300, 300);
    const lane = (rf(rng)() < 0.5 ? -1 : 1) * 2.5; // lajur kanan/kiri
    let x;
    let z;
    let heading;
    if (vertical) {
      x = line + lane;
      z = along;
      heading = pick(rng, [0, Math.PI]); // selatan / utara
    } else {
      x = along;
      z = line + lane;
      heading = pick(rng, [Math.PI / 2, -Math.PI / 2]); // timur / barat
    }
    const color = pick(rng, PALETTE);
    const mesh = makeCarMesh(THREE, color);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    G.scene.add(mesh);
    G.vehicles.push({
      mesh,
      x,
      z,
      heading,
      speed: rr(rng, 8, 14),
      color,
      kind: 'traffic',
      maxSpeed: 16,
    });
  }
}

function moveForward(v, dt) {
  v.x += Math.sin(v.heading) * v.speed * dt;
  v.z += Math.cos(v.heading) * v.speed * dt;
}

// Belok di persimpangan: pilih lurus / kiri / kanan (tanpa putar balik).
// Dipanggil hanya saat mobil tepat di persimpangan dan belum belok di titik itu.
function maybeTurnAtIntersection(v, rng) {
  const gx = Math.abs(v.x - nearestLine(v.x));
  const gz = Math.abs(v.z - nearestLine(v.z));
  if (gx > 2.5 || gz > 2.5) return;
  if (v._ix !== undefined && Math.hypot(v.x - v._ix, v.z - v._iz) < 20) return;
  v._ix = v.x;
  v._iz = v.z;
  const r = rf(rng)();
  if (r < 0.35) {
    v.heading += Math.PI / 2; // kiri
  } else if (r < 0.7) {
    v.heading -= Math.PI / 2; // kanan
  }
  // Normalisasi heading ke (-PI, PI].
  while (v.heading > Math.PI) v.heading -= Math.PI * 2;
  while (v.heading <= -Math.PI) v.heading += Math.PI * 2;
}

// Bila mobil mengarah keluar kota, arahkan ke persimpangan terdekat menuju pusat.
function steerInside(v) {
  if (Math.abs(v.x) < 335 && Math.abs(v.z) < 335) return;
  const toCenter = Math.atan2(-v.x, -v.z);
  const options = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  let best = options[0];
  let bestDot = -Infinity;
  for (const h of options) {
    const d = Math.sin(h) * Math.sin(toCenter) + Math.cos(h) * Math.cos(toCenter);
    if (d > bestDot) { bestDot = d; best = h; }
  }
  v.heading = best;
}

function driveTrafficCar(v, dt, rng) {
  v.speed = approach(v.speed, v.maxSpeed * 0.75, 4 * dt);
  maybeTurnAtIntersection(v, rng);
  steerInside(v);
  moveForward(v, dt);
}

function drivePlayerCar(v, keys, dt) {
  let throttle = 0;
  if (keys.has('KeyW')) throttle += 1;
  if (keys.has('KeyS')) throttle -= 1;

  if (throttle > 0) {
    v.speed += P.driveAccel * dt;
  } else if (throttle < 0) {
    // S: rem dulu bila maju, lalu mundur.
    if (v.speed > 0.5) v.speed -= P.driveAccel * 1.6 * dt;
    else v.speed -= P.driveAccel * 0.6 * dt;
  } else {
    v.speed = approach(v.speed, 0, 8 * dt); // gesekan mesin
  }
  if (keys.has('Space')) v.speed = approach(v.speed, 0, 30 * dt); // rem tangan

  v.speed = clamp(v.speed, -P.reverseSpeed, P.maxSpeed);

  // Setir: A = kiri (heading bertambah), D = kanan. Makin pelan makin kecil efek.
  const steer = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
  const spd = Math.abs(v.speed);
  if (steer !== 0 && spd > 0.1) {
    const dir = v.speed >= 0 ? 1 : -1;
    v.heading += steer * P.turnRate * dir * Math.min(1, spd / 10) * dt;
  }

  moveForward(v, dt);
}

export function updateVehicles(G, dt) {
  const keys = (G.input && G.input.keys) || new Set();
  const rng = Math.random; // belok traffic tidak butuh seed deterministik

  for (const v of G.vehicles) {
    if (v.kind === 'police') continue; // dikemudikan updatePolice
    if (v.kind === 'player' && G.player && G.player.vehicle === v) {
      drivePlayerCar(v, keys, dt);
    } else if (v.kind === 'traffic') {
      driveTrafficCar(v, dt, rng);
    } else {
      // Mobil pemain yang sedang parkir: melambat sampai berhenti.
      v.speed = approach(v.speed, 0, 20 * dt);
      moveForward(v, dt);
    }
    v.x = clamp(v.x, -W.bound, W.bound);
    v.z = clamp(v.z, -W.bound, W.bound);
    v.mesh.position.set(v.x, 0, v.z);
    v.mesh.rotation.y = v.heading;
  }

  // Tabrakan sederhana antar mobil non-polisi: dorong menjauh, kurangi speed.
  const cars = G.vehicles;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (a.kind === 'police' || b.kind === 'police') continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d < 4 && d > 0.01) {
        const push = (4 - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        a.speed *= 0.6;
        b.speed *= 0.6;
      }
    }
  }
}

export function nearestVehicle(G, x, z, maxD) {
  let best = null;
  let bestD = maxD;
  for (const v of G.vehicles) {
    const d = Math.hypot(v.x - x, v.z - z);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}
