// Porto Sol — Jax Marlowe di jalan kaki: bangun karakter, gerak WASD relatif
// kamera, lompat + gravitasi, tabrakan gedung, animasi jalan, masuk/keluar mobil.
// main.js memakai group.position sebagai G.player.pos, jadi semua field pemain
// menempel pada group itu sendiri (group.group = group, group.pos = group.position).
import * as THREE from 'three';

// Tuning (kontrak modul AKTOR).
const WALK = 6;        // jalan kaki (m/detik)
const SPRINT = 10.5;   // lari dengan Shift
const JUMP_V = 8.5;    // kecepatan lompat awal
const GRAVITY = 24;    // gravitasi
const ACCEL = 40;      // akselerasi pemain menuju kecepatan target
const RADIUS = 0.5;    // radius tabrakan pemain
const WATER_SLOW = 0.45; // pengali kecepatan saat di air

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// Putar sudut `a` menuju `target` maksimal `maxStep` radian, jalur terpendek.
function turnToward(a, target, maxStep) {
  let d = target - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + clamp(d, -maxStep, maxStep);
}

// Tabrakan gedung: pakai helper kota bila ada, kalau tidak cek rect collider.
function hitsBuilding(city, x, z, r) {
  if (city && typeof city.collidesWithBuildings === 'function') {
    return city.collidesWithBuildings(city, x, z, r);
  }
  for (const c of city?.colliders ?? []) {
    if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return true;
  }
  return false;
}

// Cache material + geometri supaya tiap karakter tidak membuat yang baru.
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
// Sendi anggota gerak: pivot di ujung atas supaya bisa diayun dari bahu/pinggul.
function joint(x, y) {
  const g = new THREE.Group();
  g.position.set(x, y, 0);
  return g;
}

export function createPlayer(scene) {
  const group = new THREE.Group();
  const jacket = 0xe08a12; // jaket oranye khas Jax
  const pants = 0x23262e;
  const skin = 0xc98d64;

  const armL = joint(-0.4, 1.38);
  armL.add(part(0.16, 0.64, 0.16, jacket, 0, -0.3, 0));
  const armR = joint(0.4, 1.38);
  armR.add(part(0.16, 0.64, 0.16, jacket, 0, -0.3, 0));
  const legL = joint(-0.16, 0.74);
  legL.add(part(0.2, 0.7, 0.2, pants, 0, -0.35, 0));
  legL.add(part(0.2, 0.1, 0.32, 0x111111, 0, -0.68, 0.04)); // sepatu
  const legR = joint(0.16, 0.74);
  legR.add(part(0.2, 0.7, 0.2, pants, 0, -0.35, 0));
  legR.add(part(0.2, 0.1, 0.32, 0x111111, 0, -0.68, 0.04));

  group.add(
    part(0.62, 0.72, 0.34, jacket, 0, 1.08, 0), // badan
    part(0.34, 0.34, 0.32, skin, 0, 1.66, 0),   // kepala
    part(0.36, 0.12, 0.34, 0x2a1c10, 0, 1.86, 0), // rambut
    armL, armR, legL, legR,
  );
  group.userData.limbs = { armL, armR, legL, legR };
  scene.add(group);

  // Field pemain menempel di group (lihat catatan di atas).
  group.group = group;
  group.pos = group.position;
  group.heading = 0;
  group.speed = 0;
  group.onFoot = true;
  group.inCar = null;
  group.health = 100;
  group.maxHealth = 100;
  group.cash = 0;
  group.weapon = 1; // 1 Pistol, 2 SMG, 3 Shotgun
  group.ammo = 12;
  group.vy = 0;
  group.grounded = true;
  group.walkPhase = 0;
  return group;
}

export function updatePlayer(G, dt) {
  const p = G.player;
  if (!p || !p.onFoot) return;
  const input = G.input;
  const city = G.city ?? {};
  dt = Math.min(dt, 0.05);
  if (p.vy === undefined) { p.vy = 0; p.grounded = true; p.walkPhase = 0; }

  // Arah maju = dari kamera ke pemain, diproyeksikan ke tanah (WASD relatif kamera).
  let fwdX = Math.sin(p.heading);
  let fwdZ = Math.cos(p.heading);
  if (G.camera) {
    const dx = p.pos.x - G.camera.position.x;
    const dz = p.pos.z - G.camera.position.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.01) { fwdX = dx / len; fwdZ = dz / len; }
  }
  const rightX = -fwdZ;
  const rightZ = fwdX;

  let f = 0;
  let s = 0;
  if (input?.isDown) {
    if (input.isDown('KeyW')) f += 1;
    if (input.isDown('KeyS')) f -= 1;
    if (input.isDown('KeyD')) s += 1;
    if (input.isDown('KeyA')) s -= 1;
  }
  const sprinting = !!(input?.isDown &&
    (input.isDown('ShiftLeft') || input.isDown('ShiftRight')));
  const inWater = typeof city.isWater === 'function' && city.isWater(p.pos.x, p.pos.z);

  let mx = fwdX * f + rightX * s;
  let mz = fwdZ * f + rightZ * s;
  const mLen = Math.hypot(mx, mz);
  const moving = mLen > 0.01;
  if (moving) { mx /= mLen; mz /= mLen; }

  // Kecepatan mendekati target dengan akselerasi 40; di air jauh lebih lambat.
  let target = moving ? (sprinting ? SPRINT : WALK) : 0;
  if (inWater) target *= WATER_SLOW;
  const diff = target - p.speed;
  const step = ACCEL * dt;
  p.speed += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
  if (p.speed < 0.05) p.speed = 0;

  // Geser per sumbu supaya pemain meluncur di sepanjang dinding, bukan menempel.
  const dist = p.speed * dt;
  if (dist > 0) {
    const nx = p.pos.x + mx * dist;
    const nz = p.pos.z + mz * dist;
    if (!hitsBuilding(city, nx, p.pos.z, RADIUS)) p.pos.x = nx;
    if (!hitsBuilding(city, p.pos.x, nz, RADIUS)) p.pos.z = nz;
    p.heading = turnToward(p.heading, Math.atan2(mx, mz), dt * 10);
  }

  // Lompat (Space, sekali tekan) + gravitasi.
  if (input?.pressed?.('Space') && p.grounded) {
    p.vy = JUMP_V;
    p.grounded = false;
  }
  if (!p.grounded || p.pos.y > 0) {
    p.vy -= GRAVITY * dt;
    p.pos.y += p.vy * dt;
    if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.grounded = true; }
  }

  // Tetap di dalam batas kota.
  const b = city.bounds;
  if (b) {
    const x0 = b.x0 ?? -360; const x1 = b.x1 ?? 360;
    const z0 = b.z0 ?? -360; const z1 = b.z1 ?? 404;
    p.pos.x = clamp(p.pos.x, x0 + 1, x1 - 1);
    p.pos.z = clamp(p.pos.z, z0 + 1, z1 - 1);
  }

  // Siklus jalan/lari: lengan dan kaki berayun berlawanan.
  const L = p.group.userData.limbs;
  if (L) {
    p.walkPhase += p.speed * dt * 1.7;
    const swing = Math.sin(p.walkPhase) * Math.min(1, p.speed / WALK) * 0.65;
    L.armL.rotation.x = swing;
    L.armR.rotation.x = -swing;
    L.legL.rotation.x = -swing;
    L.legR.rotation.x = swing;
    if (!p.grounded) {
      L.legL.rotation.x = 0.5;
      L.legR.rotation.x = -0.3;
      L.armL.rotation.x = -0.6;
      L.armR.rotation.x = -0.6;
    }
  }
  p.group.rotation.y = p.heading;
}

export function enterCar(G, car) {
  const p = G.player;
  if (!p || !car || p.inCar) return;
  p.inCar = car;
  p.onFoot = false;
  car.driver = 'player';
  car.parked = false;
  car.speed = 0;
  p.group.visible = false;
  p.pos.set(car.pos.x, 0, car.pos.z);
}

export function exitCar(G) {
  const p = G.player;
  const car = p?.inCar;
  if (!p || !car) return;
  const city = G.city ?? {};
  // Turun di sisi pengemudi dulu; kalau terhalang gedung, coba sisi lain, lalu belakang.
  const rx = Math.cos(car.heading);
  const rz = -Math.sin(car.heading);
  const spots = [
    [car.pos.x + rx * 2.4, car.pos.z + rz * 2.4],
    [car.pos.x - rx * 2.4, car.pos.z - rz * 2.4],
    [car.pos.x - Math.sin(car.heading) * 3, car.pos.z - Math.cos(car.heading) * 3],
  ];
  let spot = spots[2];
  for (const [x, z] of spots) {
    if (!hitsBuilding(city, x, z, RADIUS)) { spot = [x, z]; break; }
  }
  p.inCar = null;
  p.onFoot = true;
  p.heading = car.heading;
  p.vy = 0;
  p.speed = 0;
  p.grounded = true;
  p.pos.set(spot[0], 0, spot[1]);
  p.group.visible = true;
  p.group.rotation.y = p.heading;
  car.driver = null;
  car.speed = 0;
  car.parked = true;
}
