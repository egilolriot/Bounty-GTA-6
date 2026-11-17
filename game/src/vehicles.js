// Porto Sol — kendaraan: bangun mobil low-poly, lalu lintas, mengemudi arcade,
// dan jarak curi mobil. Grid jalan kota: blok 64 m + jalan 16 m = pitch 80 m.
import * as THREE from 'three';

// Tuning mengemudi arcade (kontrak modul AKTOR).
const ACCEL = 24;      // akselerasi maju
const BRAKE = 34;      // pengereman
const MAX_SPEED = 44;  // kecepatan maju maksimum
const REVERSE = 13;    // kecepatan mundur maksimum
const TURN = 2.1;      // laju belok
const HANDBRAKE = 46;  // deselerasi handbrake
const GRIP = 8;        // cengkeraman (menahan selip saat belok)
const TRAFFIC_N = 14;  // mobil lalu lintas
const PARKED_N = 6;    // mobil parkir
const TRAFFIC_SPEED = 9; // kecepatan jelajah lalu lintas
const HIT_HEAT = 10;   // panas wanted per pejalan kaki tertabrak

const PITCH = 80; // jarak antar garis tengah jalan
const HALF = 360; // setengah lebar kota (jalan terluar di ±360)

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// Apakah posisi (x, z) menabrak gedung?
function hitsBuilding(city, x, z, r) {
  if (city && typeof city.collidesWithBuildings === 'function') {
    return city.collidesWithBuildings(city, x, z, r);
  }
  for (const c of city?.colliders ?? []) {
    if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return true;
  }
  return false;
}

// Apakah nilai v dekat dengan garis jalan (toleransi tol)?
function nearRoadLine(v, tol) {
  const line = Math.round((v + HALF) / PITCH) * PITCH - HALF;
  return Math.abs(v - line) <= tol;
}

function sfx(G, name) {
  const a = G.audio;
  if (a && typeof a[name] === 'function') {
    try { a[name](); } catch { /* suara opsional */ }
  }
}

// Naikkan wanted saat pemain menabrak pejalan kaki.
function addHeat(G, n) {
  try {
    if (typeof G.setWanted === 'function') {
      G.setWanted(Math.min(5, (G.wanted || 0) + 1));
    } else {
      G.wantedHeat = (G.wantedHeat || 0) + n;
    }
  } catch { /* wanted opsional */ }
}

const MATS = new Map();
function mat(color) {
  let m = MATS.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.3 });
    MATS.set(color, m);
  }
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
function wheelGeo(r) {
  const k = 'wheel' + r;
  let g = GEOS.get(k);
  if (!g) { g = new THREE.CylinderGeometry(r, r, 0.24, 10); GEOS.set(k, g); }
  return g;
}
function makeWheel(r) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(wheelGeo(r), mat(0x14161a));
  tire.rotation.z = Math.PI / 2;
  g.add(tire);
  return g;
}

// Dimensi per jenis mobil. `paint` = warna bawaan (taksi kuning, polisi putih).
const KINDS = {
  sedan: { len: 4.4, wid: 1.9, h: 0.62, cabH: 0.55, wheelR: 0.34 },
  sports: { len: 4.3, wid: 2.0, h: 0.5, cabH: 0.42, wheelR: 0.3 },
  taxi: { len: 4.4, wid: 1.9, h: 0.62, cabH: 0.55, wheelR: 0.34, paint: 0xf7c948 },
  truck: { len: 6.4, wid: 2.1, h: 0.5, cabH: 0.75, wheelR: 0.42 },
  police: { len: 4.5, wid: 1.95, h: 0.62, cabH: 0.55, wheelR: 0.34, paint: 0xf2f2f2 },
};
const PAINTS = [0x8a8f96, 0x3a5a8c, 0x8c2f2f, 0x2f6e4a, 0xd8d3c8, 0x23262e, 0x7a4a8c, 0xc96a1e];
const TRAFFIC_KINDS = ['sedan', 'sedan', 'sedan', 'taxi', 'sports', 'truck'];
const GLASS = 0x1c2733;

export function createCar(scene, kind, x, z, heading, color) {
  const spec = KINDS[kind] ?? KINDS.sedan;
  const paint = color ?? spec.paint ?? PAINTS[(Math.random() * PAINTS.length) | 0];
  const group = new THREE.Group();
  const { len, wid, h, cabH, wheelR } = spec;
  const bodyY = 0.35 + h / 2;

  if (kind === 'truck') {
    group.add(part(wid, h, len, paint, 0, bodyY, 0)); // bak
    group.add(part(wid, 0.75, 1.4, paint, 0, bodyY + h / 2 + 0.35, len / 2 - 0.8)); // kabin
    group.add(part(wid * 0.9, 0.5, len * 0.45, 0x5a6068, 0, bodyY + h / 2 + 0.2, -len * 0.22)); // muatan
    group.add(part(wid * 0.8, 0.5, 0.1, GLASS, 0, bodyY + h / 2 + 0.4, len / 2 - 0.12)); // kaca depan
  } else {
    group.add(part(wid, h, len, paint, 0, bodyY, 0)); // bodi
    if (cabH > 0) {
      group.add(part(wid * 0.82, cabH, len * 0.45, GLASS, 0, bodyY + h / 2 + cabH / 2 - 0.02, -len * 0.05)); // kabin kaca
      group.add(part(wid * 0.8, 0.07, len * 0.42, paint, 0, bodyY + h / 2 + cabH, -len * 0.05)); // atap
    }
  }
  if (kind === 'taxi') {
    group.add(part(0.7, 0.18, 0.32, 0xffe14d, 0, bodyY + h / 2 + cabH + 0.12, 0)); // papan taksi
  }
  if (kind === 'police') {
    const barY = bodyY + h / 2 + cabH + 0.08;
    group.add(part(0.42, 0.12, 0.28, 0xd21f2b, -0.24, barY, 0)); // lampu merah
    group.add(part(0.42, 0.12, 0.28, 0x2456d6, 0.24, barY, 0));  // lampu biru
    for (const sx of [-1, 1]) {
      group.add(part(0.05, 0.4, len * 0.4, 0x14161a, sx * (wid / 2 + 0.01), bodyY, 0)); // garis hitam
    }
  }
  // Lampu depan (kuning) dan belakang (merah).
  for (const sx of [-1, 1]) {
    group.add(part(0.3, 0.12, 0.06, 0xfff2b0, sx * wid * 0.32, bodyY, len / 2 + 0.01));
    group.add(part(0.3, 0.12, 0.06, 0xd21f2b, sx * wid * 0.32, bodyY, -len / 2 - 0.01));
  }
  // Empat roda; dua depan ikut berbelok.
  const wheels = [];
  const front = [];
  for (const [wx, wz, isFront] of [
    [-wid / 2, len * 0.32, true], [wid / 2, len * 0.32, true],
    [-wid / 2, -len * 0.32, false], [wid / 2, -len * 0.32, false],
  ]) {
    const w = makeWheel(wheelR);
    w.position.set(wx, wheelR, wz);
    group.add(w);
    wheels.push(w);
    if (isFront) front.push(w);
  }
  group.userData.wheels = wheels;
  group.userData.front = front;
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);

  return {
    group, kind, color: paint, pos: group.position, heading,
    speed: 0, maxSpeed: MAX_SPEED, accel: ACCEL,
    driver: null, health: 100, parked: false,
    _wait: 0, _steer: 0, _wheelR: wheelR,
  };
}

// Putar roda sesuai jarak tempuh; roda depan mengikuti sudut setir.
function spinWheels(car, dt) {
  const spin = (car.speed * dt) / (car._wheelR || 0.34);
  for (const w of car.group.userData.wheels ?? []) w.rotation.x += spin;
  for (const w of car.group.userData.front ?? []) w.rotation.y = car._steer || 0;
}

// Titik acak di jalur jalan (lajur kanan/kiri), lengkap dengan arah hadap.
function roadPoint(G) {
  const city = G.city ?? {};
  if (typeof city.randomRoadPoint === 'function') {
    try {
      const p = city.randomRoadPoint(city, Math.random);
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
        const lane = Math.random() < 0.5 ? 3 : -3;
        if (nearRoadLine(p.x, 0.01)) {
          return { x: clamp(p.x + lane, -HALF, HALF), z: p.z, heading: Math.random() < 0.5 ? 0 : Math.PI };
        }
        return { x: p.x, z: clamp(p.z + lane, -HALF, HALF), heading: Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
      }
    } catch { /* jatuh ke grid */ }
  }
  // Cadangan: grid jalan pitch 80 m.
  const lines = 10; // blok 9 -> 10 garis jalan
  const street = -HALF + ((Math.random() * lines) | 0) * PITCH;
  const along = (Math.random() * 2 - 1) * (HALF - 30);
  const lane = Math.random() < 0.5 ? 3 : -3;
  if (Math.random() < 0.5) {
    return { x: clamp(street + lane, -HALF, HALF), z: along, heading: Math.random() < 0.5 ? 0 : Math.PI };
  }
  return { x: along, z: clamp(street + lane, -HALF, HALF), heading: Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
}

// Titik jalan di sekitar pemain, untuk me-respawn mobil yang sudah jauh.
function roadPointNear(G, px, pz) {
  const a = Math.random() * Math.PI * 2;
  const d = 60 + Math.random() * 80;
  const x = px + Math.cos(a) * d;
  const z = pz + Math.sin(a) * d;
  const snap = (v) => clamp(Math.round((v + HALF) / PITCH) * PITCH - HALF + 3, -HALF, HALF);
  if (Math.random() < 0.5) return { x: snap(x), z, heading: Math.random() < 0.5 ? 0 : Math.PI };
  return { x, z: snap(z), heading: Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
}

function removeCar(G, car) {
  G.scene?.remove(car.group);
  const i = G.cars.indexOf(car);
  if (i >= 0) G.cars.splice(i, 1);
}

export function spawnTraffic(G) {
  if (!G.scene) return;
  G.cars = G.cars ?? [];
  let traffic = 0;
  let parked = 0;
  for (const c of G.cars) {
    if (c.parked) parked++;
    else if (c.driver !== 'player') traffic++;
  }
  while (traffic < TRAFFIC_N) {
    const p = roadPoint(G);
    const kind = TRAFFIC_KINDS[(Math.random() * TRAFFIC_KINDS.length) | 0];
    const car = createCar(G.scene, kind, p.x, p.z, p.heading);
    car.speed = TRAFFIC_SPEED * (0.85 + Math.random() * 0.3);
    G.cars.push(car);
    traffic++;
  }
  while (parked < PARKED_N) {
    let car = null;
    for (let tries = 0; tries < 5 && !car; tries++) {
      const p = roadPoint(G);
      // Parkir di tepi jalan (5,5 m dari garis tengah), sejajar jalan.
      const alongZ = Math.abs(Math.sin(p.heading)) < 0.7;
      const x = alongZ ? p.x + 5.5 : p.x;
      const z = alongZ ? p.z : p.z + 5.5;
      if (!hitsBuilding(G.city ?? {}, x, z, 2)) car = createCar(G.scene, 'sedan', x, z, p.heading);
    }
    if (!car) break;
    car.parked = true;
    G.cars.push(car);
    parked++;
  }
}

// Apakah mobil berada di persimpangan (dekat dua garis jalan sekaligus)?
function onIntersection(car) {
  const ax = nearRoadLine(car.pos.x, 8);
  const az = nearRoadLine(car.pos.z, 8);
  const cx = nearRoadLine(car.pos.x, 2.5);
  const cz = nearRoadLine(car.pos.z, 2.5);
  return (ax && cz) || (cx && az);
}

export function updateTraffic(G, dt) {
  const cars = G.cars ?? [];
  const player = G.player;
  const pCar = player?.inCar ?? null;
  const px = player?.pos.x ?? 0;
  const pz = player?.pos.z ?? 0;
  dt = Math.min(dt, 0.05);

  for (let i = cars.length - 1; i >= 0; i--) {
    const car = cars[i];
    if (!car || car.parked || car.driver === 'player' || car === pCar) continue;

    // Terlalu jauh dari pemain: pindahkan ke jalan di dekat pemain.
    const distP = Math.hypot(car.pos.x - px, car.pos.z - pz);
    if (distP > 240) {
      const { kind, color } = car;
      removeCar(G, car);
      const p = roadPointNear(G, px, pz);
      const nc = createCar(G.scene, kind, p.x, p.z, p.heading, color);
      nc.speed = TRAFFIC_SPEED * (0.85 + Math.random() * 0.3);
      G.cars.push(nc);
      continue;
    }

    const fwdX = Math.sin(car.heading);
    const fwdZ = Math.cos(car.heading);
    // Apakah titik (ox, oz) relatif mobil berada di depan dan dekat?
    const aheadOf = (ox, oz) => {
      const d = Math.hypot(ox, oz);
      return d < 14 && d > 0.01 && (ox * fwdX + oz * fwdZ) / d > 0.7;
    };

    if (car._wait > 0) {
      // Berhenti sejenak (lampu merah acak / ragu-ragu di persimpangan).
      car._wait -= dt;
      car.speed = Math.max(0, car.speed - 20 * dt);
    } else {
      if (Math.random() < dt * 0.02) car._wait = 1 + Math.random() * 2;
      let target = TRAFFIC_SPEED;
      if (car.kind === 'sports') target *= 1.3;
      else if (car.kind === 'truck') target *= 0.8;
      // Berhenti di belakang mobil pemain atau mobil lain yang menghalangi.
      if (pCar && aheadOf(pCar.pos.x - car.pos.x, pCar.pos.z - car.pos.z)) target = 0;
      if (target > 0) {
        for (const o of cars) {
          if (o === car || o.parked) continue;
          if (Math.hypot(o.pos.x - car.pos.x, o.pos.z - car.pos.z) < 10 &&
            aheadOf(o.pos.x - car.pos.x, o.pos.z - car.pos.z)) { target = 0; break; }
        }
      }
      car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
    }

    // Maju; kalau menabrak gedung, putar balik dan tunggu sebentar.
    const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
    if (hitsBuilding(G.city ?? {}, nx, nz, 1.4)) {
      car.heading += Math.PI;
      car._wait = 0.5;
    } else {
      car.pos.x = nx;
      car.pos.z = nz;
    }
    // Putar balik di tepi kota supaya tidak keluar peta.
    const s = Math.sin(car.heading);
    const c = Math.cos(car.heading);
    if ((car.pos.x > HALF && s > 0) || (car.pos.x < -HALF && s < 0) ||
      (car.pos.z > HALF && c > 0) || (car.pos.z < -HALF && c < 0)) car.heading += Math.PI;
    // Di persimpangan, kadang belok kiri/kanan.
    if (onIntersection(car) && Math.random() < dt * 0.8) {
      car.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
    }
    spinWheels(car, dt);
    car.group.rotation.y = car.heading;
  }
}

// Kerusakan akibat tabrakan; kalau hancur saat dikemudikan pemain, keluarkan pemain.
function crashCar(G, car, impact) {
  car.health = (car.health ?? 100) - impact * 0.9;
  sfx(G, 'crash');
  G.lastCrash = { x: car.pos.x, z: car.pos.z, t: G.time ?? 0 };
  if (car.health <= 0) {
    car.health = 0;
    car.speed = 0;
    if (G.player?.inCar === car) {
      // Keluarkan pemain di samping mobil (tanpa impor player.js).
      const p = G.player;
      const rx = Math.cos(car.heading);
      const rz = -Math.sin(car.heading);
      p.inCar = null;
      p.onFoot = true;
      p.pos.set(car.pos.x + rx * 2.4, 0, car.pos.z + rz * 2.4);
      p.group.visible = true;
      car.driver = null;
      car.parked = true;
    }
    return true;
  }
  return false;
}

export function updatePlayerCar(G, dt) {
  const car = G.player?.inCar;
  if (!car) return;
  const input = G.input;
  const city = G.city ?? {};
  dt = Math.min(dt, 0.05);

  const handbrake = !!input?.isDown?.('Space');
  let throttle = 0;
  if (input?.isDown?.('KeyW')) throttle = 1;
  if (input?.isDown?.('KeyS')) throttle = -1;

  // Di luar jalan (trotoar/tanah) kecepatan puncak turun.
  const offRoad = typeof city.isOnRoad === 'function'
    ? !city.isOnRoad(car.pos.x, car.pos.z)
    : !(nearRoadLine(car.pos.x, 8) || nearRoadLine(car.pos.z, 8));
  const maxF = offRoad ? MAX_SPEED * 0.55 : MAX_SPEED;

  if (throttle > 0) {
    car.speed += ACCEL * dt;
  } else if (throttle < 0) {
    // S = rem kalau masih melaju, mundur kalau sudah berhenti.
    car.speed -= (car.speed > 0.5 ? BRAKE : ACCEL * 0.6) * dt;
  } else {
    // Tanpa gas: melambat sendiri.
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
  }
  if (handbrake) {
    // Handbrake: deselerasi kuat + belok lebih tajam.
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), HANDBRAKE * dt);
  } else {
    // Gesekan ban biasa.
    car.speed *= 1 - 0.35 * dt;
  }
  if (offRoad) car.speed *= 1 - dt;
  car.speed = clamp(car.speed, -REVERSE, maxF);
  if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;

  // Belok sebanding kecepatan (makin cepat makin terasa), handbrake memperkuat.
  const steerIn = (input?.isDown?.('KeyD') ? 1 : 0) - (input?.isDown?.('KeyA') ? 1 : 0);
  car._steer += (steerIn * 0.55 - car._steer) * Math.min(1, dt * GRIP);
  const turnBoost = handbrake ? 1.9 : 1.0;
  car.heading += car._steer * (Math.abs(car.speed) / MAX_SPEED) * TURN * turnBoost * dt *
    Math.sign(car.speed || 1);

  // Maju; tabrakan gedung = berhenti + bunyi, dengan geser per sumbu.
  const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
  if (hitsBuilding(city, nx, nz, 1.5)) {
    const impact = Math.abs(car.speed);
    if (!hitsBuilding(city, nx, car.pos.z, 1.5)) car.pos.x = nx;
    else if (!hitsBuilding(city, car.pos.x, nz, 1.5)) car.pos.z = nz;
    if (impact > 4) { if (crashCar(G, car, impact)) return; }
    car.speed *= -0.25; // pantul sedikit
  } else {
    car.pos.x = nx;
    car.pos.z = nz;
  }

  // Dorong mobil lain yang bersentuhan.
  for (const o of G.cars ?? []) {
    if (o === car) continue;
    const dx = o.pos.x - car.pos.x;
    const dz = o.pos.z - car.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.4 && d > 0.01) {
      const push = 3.4 - d;
      const ux = dx / d;
      const uz = dz / d;
      o.pos.x += ux * push * 0.5;
      o.pos.z += uz * push * 0.5;
      car.pos.x -= ux * push * 0.3;
      car.pos.z -= uz * push * 0.3;
      if (Math.abs(car.speed) > 6) {
        if (crashCar(G, car, Math.abs(car.speed) * 0.5)) return;
        o.health = (o.health ?? 100) - 5;
        o.speed = (o.speed ?? 0) * 0.5;
      }
      car.speed *= 0.6;
    }
  }

  // Menabrak pejalan kaki: jatuh + panas wanted.
  for (const ped of G.peds ?? []) {
    if (ped.downT > 0 || ped.state === 'down') continue;
    if (Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z) < 2.4 &&
      Math.abs(car.speed) > 2) {
      if (typeof ped.knockDown === 'function') ped.knockDown();
      else { ped.downT = 2.5; ped.state = 'down'; }
      addHeat(G, HIT_HEAT);
      car.speed *= 0.7;
    }
  }

  spinWheels(car, dt);
  car.group.rotation.y = car.heading;
  // Posisi pemain mengikuti mobil yang dikemudikan.
  G.player.pos.set(car.pos.x, 0, car.pos.z);
}

export function nearestCar(G, pos, maxDist) {
  let best = null;
  let bestD = maxDist ?? 5;
  for (const car of G.cars ?? []) {
    const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}
