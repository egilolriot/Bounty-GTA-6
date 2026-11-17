// police.js — sistem wanted + AI polisi untuk Porto Sol (bounty make.fun GTA 6).
// Bintang wanted 0-5 dari heat: mencuri mobil, menembak, dan melindas
// menaikkan heat; bersembunyi dari polisi menurunkannya perlahan.
// Polisi mengejar dengan mobil, memblokir, mengirim petugas jalan kaki,
// dan di wanted 5 sebuah helikopter menyorot pemain dari atas.
import * as THREE from 'three';
import { CFG } from './config.js';
import { createCar } from './vehicles.js';

// Tuning — dibaca dari CFG bila ada, dengan fallback sekuat angka tugas.
const CHASE_SPEED = CFG?.police?.chaseSpeed ?? 38;
const SPAWN_DIST = CFG?.police?.spawnDist ?? 55;
const MAX_CARS = CFG?.police?.maxCars ?? 5;
const DECAY = CFG?.wanted?.decay ?? 0.015;

// Heat dasar tiap level wanted: TENGAH tiap pita (bukan batas bawahnya), supaya
// peluruhan sesaat tidak langsung menjatuhkan level — pita 0/1-24/25-49/50-74/
// 75-99/100+; setWanted di batas bawah (50, 100) berarti satu tick peluruhan
// saja sudah menurunkan level dan menghapus mobil/helikopter.
const HEAT_BASE = [0, 12, 37, 62, 87, 112];
// Jumlah mobil polisi per level: 0 = tidak ada, 1-2 = 1 mobil, 3 = 3, 4 = 4, 5 = 5 + heli.
const CARS_FOR_LEVEL = [0, 1, 1, 3, 4, 5];
// Heat hilang 0.015 per frame pada 60 fps saat pemain tak terlihat.
const DECAY_PER_SEC = DECAY * 60;
const EVADE_DIST = 60; // polisi lebih jauh dari ini = pemain tak terlihat
const MAX_OFFICERS = 2; // petugas jalan kaki yang boleh keluar bersamaan

function msg(G, text, ms) {
  try {
    if (typeof G.showMessage === 'function') G.showMessage(G, text, ms || 3500);
    else if (G.hud && typeof G.hud.showMessage === 'function') G.hud.showMessage(G, text, ms || 3500);
  } catch (e) { /* abaikan: pesan hanya kosmetik */ }
}
function sfx(G, name, arg) {
  try { if (G.audio && typeof G.audio[name] === 'function') G.audio[name](arg); } catch (e) { /* abaikan */ }
}
function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
function levelFromHeat(heat) {
  if (heat >= 100) return 5;
  if (heat >= 75) return 4;
  if (heat >= 50) return 3;
  if (heat >= 25) return 2;
  if (heat > 0) return 1;
  return 0;
}
function blocked(G, x, z) {
  try {
    if (G.city && typeof G.city.collidesWithBuildings === 'function') {
      return !!G.city.collidesWithBuildings(x, z, 2);
    }
  } catch (e) { /* abaikan */ }
  return false;
}
function removeGroup(G, grp) {
  if (!grp) return;
  try { G.scene.remove(grp); } catch (e) { /* abaikan */ }
  grp.traverse(function (o) {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.dispose(); });
  });
}
function removeEntry(G, e) {
  if (!e) return;
  if (e.car) removeGroup(G, e.car.group);
  if (e.officer) removeGroup(G, e.officer.group);
}

// Titik spawn: coba titik jalan acak dari kota, kalau gagal pakai sudut acak.
function spawnPoint(G) {
  const p = G.player.pos;
  try {
    if (G.city && typeof G.city.randomRoadPoint === 'function') {
      // Polisi harus muncul DEKAT pemain (40-80 m) agar benar-benar mengejar:
      // titik jalan acak di seluruh kota bisa 200+ m jauhnya, sehingga polisi
      // terdekat > 60 m, heat langsung meluruh, dan level jatuh seketika.
      for (let i = 0; i < 12; i++) {
        const q = G.city.randomRoadPoint(Math.random);
        if (!q || !isFinite(q.x) || !isFinite(q.z)) continue;
        const d = dist2(q.x, q.z, p.x, p.z);
        if (d > SPAWN_DIST * 0.7 && d < SPAWN_DIST + 25) return q;
      }
    }
  } catch (e) { /* abaikan, pakai fallback */ }
  const a = Math.random() * Math.PI * 2;
  const d = SPAWN_DIST + Math.random() * 15;
  const clamp = function (v) { return Math.max(-350, Math.min(350, v)); };
  return { x: clamp(p.x + Math.cos(a) * d), z: clamp(p.z + Math.sin(a) * d) };
}

// Mobil polisi lewat vehicles.createCar; fallback bangun sendiri bila gagal.
function makePoliceCar(G, x, z, heading) {
  try {
    const car = createCar(G.scene, 'police', x, z, heading);
    if (car) {
      car.driver = 'police';
      car.maxSpeed = CHASE_SPEED;
      car.accel = 14;
      return car;
    }
  } catch (e) { /* jatuh ke fallback */ }
  const grp = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.2, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.62, 4.5), paint);
  body.position.y = 0.66;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2), glass);
  cabin.position.set(0, 1.25, -0.2);
  const barR = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.28),
    new THREE.MeshStandardMaterial({ color: 0xd21f2b, emissive: 0xd21f2b, emissiveIntensity: 1.2 }));
  barR.position.set(-0.24, 1.6, -0.2);
  const barB = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x2456d6, emissive: 0x2456d6, emissiveIntensity: 1.2 }));
  barB.position.set(0.24, 1.6, -0.2);
  grp.add(body, cabin, barR, barB);
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]].forEach(function (pos) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(pos[0], 0.34, pos[1]);
    grp.add(w);
  });
  grp.position.set(x, 0, z);
  grp.rotation.y = heading;
  G.scene.add(grp);
  return {
    group: grp, kind: 'police', color: 0xf2f2f2, pos: grp.position,
    heading: heading, speed: 0, maxSpeed: CHASE_SPEED, accel: 14,
    driver: 'police', health: 100, parked: false,
  };
}

function makeOfficer(G, x, z) {
  const grp = new THREE.Group();
  const uni = new THREE.MeshStandardMaterial({ color: 0x14264a, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9976b, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), uni);
  torso.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.75;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 10),
    new THREE.MeshStandardMaterial({ color: 0x0a1428, roughness: 0.6 }));
  cap.position.y = 1.92;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.35), uni);
  legs.position.y = 0.35;
  grp.add(torso, head, cap, legs);
  grp.position.set(x, 0, z);
  G.scene.add(grp);
  return {
    group: grp, pos: grp.position, heading: 0, health: 100,
    state: 'chase', speed: 5.5, fireCd: 1,
  };
}

// Helikopter wanted 5: badan + rotor + sorot lampu ke pemain.
function makeHeli(G) {
  const grp = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c2f4a, roughness: 0.5, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 5.2), dark);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.5), dark);
  tail.position.set(0, 0.3, -4.2);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  rotor.position.y = 0.9;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(9, 45, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0.13,
      side: THREE.DoubleSide, depthWrite: false,
    }));
  cone.position.y = -22.5; // puncak kerucut di heli, alas lebar di tanah
  grp.add(body, tail, rotor, cone);
  const light = new THREE.SpotLight(0xfff2b0, 900, 90, 0.35, 0.5, 1.2);
  grp.add(light);
  light.target = new THREE.Object3D();
  grp.add(light.target);
  G.scene.add(grp);
  G._heli = { group: grp, rotor: rotor, light: light, angle: 0 };
}
function removeHeli(G) {
  if (!G._heli) return;
  removeGroup(G, G._heli.group);
  G._heli = null;
}

function spawnChaser(G) {
  const p = G.player.pos;
  const pt = spawnPoint(G);
  const heading = Math.atan2(p.x - pt.x, p.z - pt.z);
  const car = makePoliceCar(G, pt.x, pt.z, heading);
  const e = { car: car, officer: null, state: 'chase', ramCd: 0, touchCd: 0 };
  G.police.push(e);
  return e;
}

// Samakan jumlah mobil polisi dengan level — tanpa mengubah heat (untuk peluruhan).
function matchPoliceCount(G, level) {
  const want = CARS_FOR_LEVEL[level] || 0;
  while (G.police.length < want && G.police.length < MAX_CARS) spawnChaser(G);
  while (G.police.length > want) removeEntry(G, G.police.pop());
}

// Luka dari polisi: pakai damagePlayer dari combat bila tersedia,
// kalau tidak kurangi health langsung + pesan.
function hurtPlayer(G, amount) {
  if (typeof G.damagePlayer === 'function') {
    try { G.damagePlayer(G, amount, 'police'); return; } catch (e) { /* jatuh ke fallback */ }
  }
  if (!G.player) return;
  G.player.health = Math.max(0, (G.player.health ?? 100) - amount);
  G._lastDamageT = G._now || 0;
  try { if (G.hud && G.hud.vignette) G.hud.vignette.style.opacity = '0.85'; } catch (e) { /* abaikan */ }
  G._damageFlash = 1;
  sfx(G, 'hurt');
  if (G.player.health <= 0) {
    G.mode = 'gameover';
    sfx(G, 'siren', false);
    try { if (typeof G.showScreen === 'function') G.showScreen(G, 'busted'); } catch (e) { /* abaikan */ }
    msg(G, 'Busted! Mara will post your bail…', 5000);
  }
}

// Set level wanted (0-5) dan sesuaikan kehadiran polisi dengan level itu.
export function setWanted(G, level) {
  level = Math.max(0, Math.min(5, Math.round(level || 0)));
  if (!G.police) G.police = [];
  const prev = G.wanted || 0;
  G.wanted = level;
  G.wantedHeat = HEAT_BASE[level];
  G.wantedTimer = 0;
  if (level === 0) {
    while (G.police.length) removeEntry(G, G.police.pop());
    removeHeli(G);
    sfx(G, 'siren', false);
    return;
  }
  sfx(G, 'siren', true);
  if (level > prev) {
    msg(G, 'Wanted level ' + level + (level >= 3 ? ' — the whole force is coming!' : ''), 3000);
  }
  matchPoliceCount(G, level);
  // Wanted 3+: satu mobil jadi pemblokir di depan pemain.
  if (level >= 3) {
    const chaser = G.police.find(function (e) { return e.state === 'chase'; });
    if (chaser) chaser.state = 'block';
  } else {
    G.police.forEach(function (e) { if (e.state === 'block') e.state = 'chase'; });
  }
  if (level >= 5 && !G._heli) makeHeli(G);
  if (level < 5) removeHeli(G);
}

// Tambah heat; melewati ambang batas menaikkan level wanted.
export function addHeat(G, amount) {
  G.wantedHeat = Math.max(0, (G.wantedHeat || 0) + amount);
  const level = levelFromHeat(G.wantedHeat);
  if (level !== (G.wanted || 0)) setWanted(G, level);
}

// Per-frame: peluruhan wanted saat tak terlihat, kejar/tabrak/blokir,
// petugas jalan kaki, helikopter.
export function updatePolice(G, dt) {
  if (!G.player || !G.police) return;
  if (G.mode && G.mode !== 'play') return;
  dt = Math.min(dt || 0.016, 0.05);
  const p = G.player.pos;
  const level = G.wanted || 0;
  if (level <= 0) return;

  // Jarak polisi terdekat — di atas EVADE_DIST berarti pemain tak terlihat.
  let nearest = Infinity;
  G.police.forEach(function (e) {
    if (e.car) nearest = Math.min(nearest, dist2(e.car.pos.x, e.car.pos.z, p.x, p.z));
    if (e.officer) nearest = Math.min(nearest, dist2(e.officer.pos.x, e.officer.pos.z, p.x, p.z));
  });
  if (nearest > EVADE_DIST) {
    G.wantedTimer = (G.wantedTimer || 0) + dt;
    G.wantedHeat = Math.max(0, (G.wantedHeat || 0) - DECAY_PER_SEC * dt);
    if (G.wantedHeat <= 0) {
      setWanted(G, 0);
      if (G.stats) G.stats.copsEvaded = (G.stats.copsEvaded || 0) + 1;
      msg(G, 'You lost the cops.', 4000);
      return;
    }
    const lower = levelFromHeat(G.wantedHeat);
    if (lower < level) {
      G.wanted = lower;
      G.wantedTimer = 0;
      matchPoliceCount(G, lower);
      if (lower < 5) removeHeli(G);
      if (lower < 3) G.police.forEach(function (e) { if (e.state === 'block') e.state = 'chase'; });
    }
  } else {
    G.wantedTimer = 0;
  }

  // Helikopter melayang di atas pemain, mengorbit perlahan.
  if (G._heli) {
    const h = G._heli;
    h.angle += dt * 0.45;
    h.group.position.set(p.x + Math.cos(h.angle) * 20, 42, p.z + Math.sin(h.angle) * 20);
    h.rotor.rotation.y += dt * 20;
    h.light.target.position.set(p.x, 0, p.z);
    h.light.target.updateMatrixWorld();
  }

  const officersOut = G.police.filter(function (e) { return e.officer; }).length;
  for (let i = G.police.length - 1; i >= 0; i--) {
    const e = G.police[i];
    const car = e.car;
    if (!car) continue;
    const d = dist2(car.pos.x, car.pos.z, p.x, p.z);

    // Petugas yang sudah keluar: kejar pemain jalan kaki / tembak dari dekat.
    if (e.state === 'foot' && e.officer) {
      car.speed = 0; // mobil menunggu sementara petugasnya di luar
      const o = e.officer;
      const od = dist2(o.pos.x, o.pos.z, p.x, p.z);
      if (!G.player.onFoot && od > 60) {
        removeGroup(G, o.group); // pemain kabur naik mobil: petugas kembali
        e.officer = null;
        e.state = 'chase';
        continue;
      }
      o.heading = Math.atan2(p.x - o.pos.x, p.z - o.pos.z);
      o.group.rotation.y = o.heading;
      if (od < 26) {
        o.state = 'shoot'; // combat.js menembak saat state 'shoot'
      } else {
        o.state = 'chase';
        const nx = o.pos.x + Math.sin(o.heading) * o.speed * dt;
        const nz = o.pos.z + Math.cos(o.heading) * o.speed * dt;
        if (!blocked(G, nx, nz)) { o.pos.x = nx; o.pos.z = nz; }
      }
      if (od < 2.2) {
        if (e.touchCd <= 0) { hurtPlayer(G, 6); e.touchCd = 1; }
      }
      if (e.touchCd > 0) e.touchCd -= dt;
      continue;
    }

    // Pemain jalan kaki + wanted tinggi: kirim petugas keluar dari mobil.
    if (G.player.onFoot && level >= 2 && !e.officer && d < 30 && officersOut < MAX_OFFICERS) {
      e.officer = makeOfficer(G, car.pos.x + 2, car.pos.z + 2);
      e.state = 'foot';
      car.speed = 0;
      continue;
    }

    // Pemblokir: ke titik di depan mobil pemain, lalu menghadang melintang.
    if (e.state === 'block' && !G.player.onFoot) {
      const h = G.player.heading || 0;
      const tx = p.x + Math.sin(h) * 18, tz = p.z + Math.cos(h) * 18;
      const td = dist2(car.pos.x, car.pos.z, tx, tz);
      if (td > 8) {
        steerToward(G, car, tx, tz, dt, CHASE_SPEED);
      } else {
        car.speed = Math.max(0, car.speed - 20 * dt);
        car.heading += (h + Math.PI / 2 - car.heading) * Math.min(1, dt * 2);
        car.group.rotation.y = car.heading;
      }
      if (d > 80) e.state = 'chase'; // pemain lolos jauh: kembali mengejar
      continue;
    }
    if (e.state === 'block') e.state = 'chase';

    // Kejar: belok ke arah pemain, gas sampai chaseSpeed.
    steerToward(G, car, p.x, p.z, dt, CHASE_SPEED);

    // Tabrak mobil pemain: perlambat + dorong.
    if (!G.player.onFoot && d < 4.5) {
      G.player.speed = Math.max(0, (G.player.speed || 0) - 7 * dt);
      p.x += Math.sin(car.heading) * 2.2 * dt;
      p.z += Math.cos(car.heading) * 2.2 * dt;
      if (e.ramCd <= 0) { sfx(G, 'crash'); e.ramCd = 1.2; }
    }
    // Sentuh pemain jalan kaki: beri damage.
    if (G.player.onFoot && d < 2.4) {
      if (e.touchCd <= 0) { hurtPlayer(G, 8); e.touchCd = 1; }
    }
    if (e.ramCd > 0) e.ramCd -= dt;
    if (e.touchCd > 0) e.touchCd -= dt;
  }
}

// Belok + maju menuju titik target dengan kecepatan target.
function steerToward(G, car, tx, tz, dt, targetSpeed) {
  const want = Math.atan2(tx - car.pos.x, tz - car.pos.z);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const turn = 2.4 * dt;
  car.heading += Math.max(-turn, Math.min(turn, diff));
  car.speed = Math.min(targetSpeed, car.speed + (car.accel || 14) * dt);
  const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
  if (blocked(G, nx, nz)) {
    car.heading += 2.4 * dt;
    car.speed *= 0.5;
  } else {
    car.pos.x = nx;
    car.pos.z = nz;
  }
  car.group.rotation.y = car.heading;
}
