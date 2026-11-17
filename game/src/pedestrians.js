// Porto Sol — pejalan kaki: bangun warga low-poly, jalan di trotoar, lari
// menjauh dari tembakan dan mobil ngebut, bisa tertabrak lalu bangkit lagi.
import * as THREE from 'three';

// Tuning (kontrak modul AKTOR).
const PED_COUNT = 26;
const PED_SPEED = 1.7;   // kecepatan jalan kaki
const FLEE_SPEED = 2.4;  // pengali kecepatan saat lari
const DOWN_TIME = 3;     // detik tergeletak sebelum bangkit
const PITCH = 80;        // jarak antar garis tengah jalan
const HALF = 360;        // setengah lebar kota

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function hitsBuilding(city, x, z, r) {
  if (city && typeof city.collidesWithBuildings === 'function') {
    return city.collidesWithBuildings(city, x, z, r);
  }
  for (const c of city?.colliders ?? []) {
    if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return true;
  }
  return false;
}

function nearRoadLine(v, tol) {
  const line = Math.round((v + HALF) / PITCH) * PITCH - HALF;
  return Math.abs(v - line) <= tol;
}

// Putar sudut `a` menuju `target` maksimal `maxStep` radian, jalur terpendek.
function turnToward(a, target, maxStep) {
  let d = target - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + clamp(d, -maxStep, maxStep);
}

const MATS = new Map();
function mat(color) {
  let m = MATS.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 }); MATS.set(color, m); }
  return m;
}
const GEOS = new Map();
function boxGeo(w, h, d) {
  const k = w + 'x' + h + 'x' + d;
  let g = GEOS.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); GEOS.set(k, g); }
  return g;
}
function part(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
}
function joint(x, y) {
  const g = new THREE.Group();
  g.position.set(x, y, 0);
  return g;
}

const SHIRTS = [0xd95f4b, 0x4b7fd9, 0x53b06a, 0xe0b13c, 0x9b59d0, 0xe8e4da];
const SKINS = [0xc98d64, 0x8a5a3b, 0xe8b98d, 0x6e4426];

export function createPedestrian(scene, x, z) {
  const shirt = SHIRTS[(Math.random() * SHIRTS.length) | 0];
  const skin = SKINS[(Math.random() * SKINS.length) | 0];
  const pants = Math.random() < 0.5 ? 0x2b3242 : 0x5a4632;
  const group = new THREE.Group();

  const armL = joint(-0.33, 1.28);
  armL.add(part(0.13, 0.55, 0.13, shirt, 0, -0.26, 0));
  const armR = joint(0.33, 1.28);
  armR.add(part(0.13, 0.55, 0.13, shirt, 0, -0.26, 0));
  const legL = joint(-0.13, 0.72);
  legL.add(part(0.17, 0.68, 0.17, pants, 0, -0.33, 0));
  const legR = joint(0.13, 0.72);
  legR.add(part(0.17, 0.68, 0.17, pants, 0, -0.33, 0));

  group.add(
    part(0.5, 0.62, 0.28, shirt, 0, 1.02, 0), // badan
    part(0.3, 0.3, 0.28, skin, 0, 1.52, 0),   // kepala
    part(0.32, 0.1, 0.3, 0x1c1410, 0, 1.7, 0), // rambut/topi
    armL, armR, legL, legR,
  );
  group.userData.limbs = { armL, armR, legL, legR };
  group.position.set(x, 0, z);
  const heading = ((Math.random() * 4) | 0) * Math.PI / 2; // hadap searah jalan
  group.rotation.y = heading;
  scene.add(group);

  const ped = {
    group, pos: group.position, heading,
    speed: PED_SPEED * (0.8 + Math.random() * 0.4),
    state: 'walk', waitT: Math.random() * 2, downT: 0, fleeT: 0,
    phase: Math.random() * 6, wasFleeing: false,
  };
  ped.knockDown = () => knockDownPed(ped);
  return ped;
}

// Jatuhkan pejalan kaki: tergeletak (group direbahkan), bangkit setelah DOWN_TIME.
// Pemulihan posisi tegak ditangani updatePedestrians saat downT habis.
export function knockDownPed(ped) {
  if (!ped || ped.downT > 0) return;
  ped.downT = DOWN_TIME;
  ped.state = 'down';
  ped.fleeT = 0;
  ped.group.rotation.x = -Math.PI / 2 * 0.9; // rebah ke belakang
}

// Titik acak di trotoar: 8 m dari garis tengah jalan.
function sidewalkPoint(G) {
  const city = G.city ?? {};
  if (typeof city.randomRoadPoint === 'function') {
    try {
      const p = city.randomRoadPoint(city, Math.random);
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
        return nearRoadLine(p.x, 0.01) ? { x: p.x + 8, z: p.z } : { x: p.x, z: p.z + 8 };
      }
    } catch { /* jatuh ke grid */ }
  }
  const street = -HALF + ((Math.random() * 10) | 0) * PITCH;
  const along = (Math.random() * 2 - 1) * (HALF - 30);
  if (Math.random() < 0.5) return { x: street + 8, z: along };
  return { x: along, z: street + 8 };
}

// Titik trotoar di sekitar pemain, untuk me-respawn pejalan kaki yang jauh.
function sidewalkPointNear(px, pz) {
  const a = Math.random() * Math.PI * 2;
  const d = 25 + Math.random() * 90;
  const x = px + Math.cos(a) * d;
  const z = pz + Math.sin(a) * d;
  const snap = (v) => Math.round((v + HALF) / PITCH) * PITCH - HALF + 8;
  if (Math.random() < 0.5) return { x: snap(x), z };
  return { x, z: snap(z) };
}

function removePed(G, ped) {
  G.scene?.remove(ped.group);
  const i = G.peds.indexOf(ped);
  if (i >= 0) G.peds.splice(i, 1);
}

export function spawnPedestrians(G) {
  if (!G.scene) return;
  G.peds = G.peds ?? [];
  while (G.peds.length < PED_COUNT) {
    const s = sidewalkPoint(G);
    G.peds.push(createPedestrian(G.scene, s.x, s.z));
  }
}

// Majukan pejalan kaki searah heading; belok kalau menabrak gedung atau di ujung kota.
function movePed(G, ped, speed, dt) {
  const city = G.city ?? {};
  const nx = ped.pos.x + Math.sin(ped.heading) * speed * dt;
  const nz = ped.pos.z + Math.cos(ped.heading) * speed * dt;
  if (hitsBuilding(city, nx, nz, 0.4)) {
    ped.heading += Math.PI / 2;
    return;
  }
  ped.pos.x = nx;
  ped.pos.z = nz;
  // Di persimpangan trotoar, kadang belok kiri/kanan.
  if (((nearRoadLine(ped.pos.x, 8) && nearRoadLine(ped.pos.z, 2.5)) ||
    (nearRoadLine(ped.pos.x, 2.5) && nearRoadLine(ped.pos.z, 8))) &&
    Math.random() < dt * 0.5) {
    ped.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
  }
  const s = Math.sin(ped.heading);
  const c = Math.cos(ped.heading);
  if ((ped.pos.x > HALF && s > 0) || (ped.pos.x < -HALF && s < 0) ||
    (ped.pos.z > HALF && c > 0) || (ped.pos.z < -HALF && c < 0)) ped.heading += Math.PI;
}

// Tembakan terakhir yang tercatat; dipakai untuk memicu lari menjauh sekali saja.
let _lastShotSeen = null;

export function updatePedestrians(G, dt) {
  const peds = G.peds ?? [];
  const player = G.player;
  const px = player?.pos.x ?? 0;
  const pz = player?.pos.z ?? 0;
  const pCar = player?.inCar ?? null;
  dt = Math.min(dt, 0.05);

  // Tembakan baru: warga dalam radius 26 m lari menjauh.
  const shotAt = G.lastShotPos;
  if (shotAt && shotAt !== _lastShotSeen) {
    _lastShotSeen = shotAt;
    for (const ped of peds) {
      if (Math.hypot(ped.pos.x - shotAt.x, ped.pos.z - shotAt.z) < 26) ped.fleeT = 1.2;
    }
  }

  for (let i = peds.length - 1; i >= 0; i--) {
    const ped = peds[i];
    const dx = ped.pos.x - px;
    const dz = ped.pos.z - pz;
    const distP = Math.hypot(dx, dz);

    // Terlalu jauh dari pemain: ganti dengan warga baru di dekat pemain.
    if (distP > 240) {
      removePed(G, ped);
      const s = sidewalkPointNear(px, pz);
      G.peds.push(createPedestrian(G.scene, s.x, s.z));
      continue;
    }

    const L = ped.group.userData.limbs;

    // Tergeletak: hitung mundur, lalu bangkit dan berdiri tegak lagi.
    if (ped.downT > 0) {
      ped.downT -= dt;
      ped.group.rotation.x += (-Math.PI / 2 * 0.9 - ped.group.rotation.x) * Math.min(1, dt * 6);
      if (ped.downT <= 0) {
        ped.state = 'walk';
        ped.group.rotation.x = 0;
      }
      continue;
    }

    // Lari kalau: wanted aktif dan pemain dekat, atau mobil pemain ngebut mendekat.
    const fleeing = (G.wanted > 0 && distP < 28) ||
      (pCar && Math.abs(pCar.speed) > 8 && distP < 9);
    if (fleeing) ped.fleeT = 1.2;

    if (ped.fleeT > 0) {
      ped.fleeT -= dt;
      // Hadap menjauhi pemain, lalu lari.
      ped.heading = turnToward(ped.heading, Math.atan2(dx, dz), dt * 6);
      movePed(G, ped, ped.speed * FLEE_SPEED, dt);
      ped.wasFleeing = true;
    } else {
      // Selesai lari: luruskan arah ke sumbu jalan terdekat.
      if (ped.wasFleeing) {
        ped.heading = Math.round(ped.heading / (Math.PI / 2)) * (Math.PI / 2);
        ped.wasFleeing = false;
      }
      // Jalan santai, kadang berhenti sebentar.
      if (ped.waitT > 0) {
        ped.waitT -= dt;
      } else {
        movePed(G, ped, ped.speed, dt);
        if (Math.random() < dt * 0.05) ped.waitT = 0.5 + Math.random() * 2.5;
      }
    }

    // Ayunan lengan/kaki mengikuti langkah (lebih cepat saat lari).
    ped.phase += (ped.fleeT > 0 ? ped.speed * FLEE_SPEED : ped.speed) * dt * 3.2;
    const sw = Math.sin(ped.phase) * 0.5;
    if (L) {
      L.armL.rotation.x = sw;
      L.armR.rotation.x = -sw;
      L.legL.rotation.x = -sw;
      L.legR.rotation.x = sw;
    }
    ped.group.rotation.y = ped.heading;
  }
}
