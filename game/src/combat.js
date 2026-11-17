// combat.js — tembak-menembak, damage, dan kesehatan untuk Porto Sol.
// Senjata hitscan: Pistol (1), SMG (2), Shotgun (3). Tes ray-vs-sphere
// terhadap petugas, pejalan kaki, dan mobil — tanpa traversal scene.
// Jam internal G._now (detik waktu bermain) dipakai untuk regen, karena
// G.time adalah jam hari (17.5 = 17:30) yang berjalan sangat lambat.
import * as THREE from 'three';
import { addHeat } from './police.js';

const WEAPONS = {
  1: { name: 'Pistol', damage: 34, rate: 0.28, range: 60, spread: 0.012, pellets: 1, mag: 12, reload: 1.0 },
  2: { name: 'SMG', damage: 16, rate: 0.09, range: 50, spread: 0.055, pellets: 1, mag: 30, reload: 1.4 },
  3: { name: 'Shotgun', damage: 14, rate: 0.8, range: 30, spread: 0.11, pellets: 6, mag: 6, reload: 2.0 },
};
const HEAT_PER_SHOT = 5; // CFG.wanted.heatPerShot
const HEAT_PER_COP_KILL = 25;
const HEAT_PER_PED_KILL = 10;
const REGEN_DELAY = 5; // detik tanpa damage sebelum health regen
const REGEN_RATE = 10; // health per detik
const TRACER_LIFE = 0.08;
const FLASH_LIFE = 0.05;

function msg(G, text, ms) {
  try {
    if (typeof G.showMessage === 'function') G.showMessage(G, text, ms || 3500);
    else if (G.hud && typeof G.hud.showMessage === 'function') G.hud.showMessage(G, text, ms || 3500);
  } catch (e) { /* abaikan */ }
}
function screen(G, name) {
  try {
    if (typeof G.showScreen === 'function') G.showScreen(G, name);
    else if (G.hud && typeof G.hud.showScreen === 'function') G.hud.showScreen(G, name);
  } catch (e) { /* abaikan */ }
}
function sfx(G, name) {
  try { if (G.audio && typeof G.audio[name] === 'function') G.audio[name](); } catch (e) { /* abaikan */ }
}
function weaponOf(G) {
  return WEAPONS[G.player.weapon] || WEAPONS[1];
}

// Ray vs sphere: jarak sepanjang ray sampai titik tabrak, atau -1 bila meleset.
function raySphere(o, d, c, r) {
  const ox = c.x - o.x, oy = c.y - o.y, oz = c.z - o.z;
  const tca = ox * d.x + oy * d.y + oz * d.z;
  if (tca < 0) return -1;
  const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
  if (d2 > r * r) return -1;
  return tca - Math.sqrt(r * r - d2);
}

function tracer(G, from, to) {
  if (!G._tracers) G._tracers = [];
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: 0xffe08a, transparent: true, opacity: 0.9,
  }));
  G.scene.add(line);
  G._tracers.push({ line: line, life: TRACER_LIFE });
}

// Kilat moncong: mesh + cahaya sementara, dihapus oleh updateCombat.
function muzzleFlash(G, at) {
  if (!G._flashes) G._flashes = [];
  const grp = new THREE.Group();
  const flash = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.3, 0),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95 })
  );
  const light = new THREE.PointLight(0xffc266, 25, 12, 1.8);
  grp.add(flash, light);
  grp.position.copy(at);
  G.scene.add(grp);
  G._flashes.push({ group: grp, life: FLASH_LIFE });
}

function removeFromScene(G, grp) {
  if (!grp) return;
  try { G.scene.remove(grp); } catch (e) { /* abaikan */ }
  grp.traverse(function (o) {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.dispose(); });
  });
}

// Isi ulang senjata aktif sampai penuh, dengan jeda singkat.
export function reloadWeapon(G) {
  if (!G.player) return;
  const w = weaponOf(G);
  if (G.player.ammo == null) G.player.ammo = w.mag;
  if (G._reloading || G.player.ammo >= w.mag) return;
  G._reloading = true;
  G._reloadT = w.reload;
}

// Tembak: hanya jalan kaki dan mode 'play'. Hitscan dari tengah kamera.
export function shoot(G) {
  if (!G.player || !G.player.onFoot || !G.camera) return;
  if (G.mode && G.mode !== 'play') return;
  if (G._fireCd > 0 || G._reloading) return;
  const w = weaponOf(G);
  if (G.player.ammo == null) G.player.ammo = w.mag;
  if (G.player.ammo <= 0) { reloadWeapon(G); return; }
  G.player.ammo--;
  G._fireCd = w.rate;

  const origin = G.camera.position;
  const dir = new THREE.Vector3();
  G.camera.getWorldDirection(dir);
  const muzzleAt = origin.clone().addScaledVector(dir, 1.2);
  muzzleFlash(G, muzzleAt);
  sfx(G, 'shoot');
  G.lastShotPos = { x: G.player.pos.x, z: G.player.pos.z }; // pejalan kaki lari dari titik ini
  try {
    addHeat(G, HEAT_PER_SHOT);
  } catch (e) {
    G.wantedHeat = (G.wantedHeat || 0) + HEAT_PER_SHOT;
  }

  // Kandidat: petugas polisi, pejalan kaki, mobil (bukan mobil pemain).
  const cands = [];
  (G.police || []).forEach(function (e) {
    if (e.officer) cands.push({ t: e.officer, r: 1.2, y: 1.1 });
    if (e.car) cands.push({ t: e.car, r: 2.6, y: 1.0 });
  });
  (G.peds || []).forEach(function (p) {
    if (p.state !== 'down') cands.push({ t: p, r: 1.2, y: 1.1 });
  });
  (G.cars || []).forEach(function (c) {
    if (c !== G.player.inCar && c.driver !== 'player') cands.push({ t: c, r: 2.6, y: 1.0 });
  });

  let endT = w.range;
  let endDir = dir;
  for (let pellet = 0; pellet < w.pellets; pellet++) {
    const d = dir.clone();
    d.x += (Math.random() - 0.5) * w.spread * 2;
    d.y += (Math.random() - 0.5) * w.spread * 2;
    d.z += (Math.random() - 0.5) * w.spread * 2;
    d.normalize();
    let bestT = w.range;
    let best = null;
    cands.forEach(function (c) {
      const ctr = new THREE.Vector3(c.t.pos.x, (c.t.pos.y || 0) + c.y, c.t.pos.z);
      const t = raySphere(muzzleAt, d, ctr, c.r);
      if (t > 0 && t < bestT) { bestT = t; best = c; }
    });
    if (best) {
      damageTarget(G, best.t, w.damage);
      if (bestT < endT) { endT = bestT; endDir = d; }
    }
  }
  const end = muzzleAt.clone().addScaledVector(endDir, endT);
  tracer(G, muzzleAt, end);
  if (G.player.ammo <= 0) reloadWeapon(G);
}

// Kurangi health target; habis = hancurkan / hapus dari dunia.
export function damageTarget(G, target, amount) {
  if (!target) return false;
  if ((target.health ?? 100) <= 0) return true;
  target.health = (target.health ?? 100) - amount;
  if (target.health > 0) return false;

  // Petugas polisi yang tertembak: keluar dari entrinya, heat naik.
  for (const e of (G.police || [])) {
    if (e.officer === target) {
      removeFromScene(G, target.group);
      e.officer = null;
      try { addHeat(G, HEAT_PER_COP_KILL); } catch (err) { /* abaikan */ }
      msg(G, 'Officer down — the heat is rising.', 3000);
      return true;
    }
    if (e.car === target) {
      removeFromScene(G, target.group);
      const idx = G.police.indexOf(e);
      if (idx >= 0) G.police.splice(idx, 1);
      return true;
    }
  }
  const pi = (G.peds || []).indexOf(target);
  if (pi >= 0) {
    removeFromScene(G, target.group);
    G.peds.splice(pi, 1);
    try { addHeat(G, HEAT_PER_PED_KILL); } catch (err) { /* abaikan */ }
    return true;
  }
  const ci = (G.cars || []).indexOf(target);
  if (ci >= 0) {
    removeFromScene(G, target.group);
    G.cars.splice(ci, 1);
    return true;
  }
  return true;
}

// Lukai pemain: kurangi health, flash merah, suara hurt, catat waktu kena hit.
export function damagePlayer(G, amount, from) {
  if (!G.player) return;
  if (G.mode && G.mode !== 'play') return;
  G.player.health = Math.max(0, (G.player.health ?? 100) - amount);
  G._lastDamageT = G._now || 0;
  try {
    if (G.hud && G.hud.vignette) G.hud.vignette.style.opacity = '0.85';
  } catch (e) { /* abaikan */ }
  G._damageFlash = 1; // render/hud boleh membaca ini untuk vignette merah
  sfx(G, 'hurt');
  if (G.player.health <= 0) {
    G.mode = 'gameover';
    try { if (G.audio && G.audio.siren) G.audio.siren(false); } catch (e) { /* abaikan */ }
    screen(G, from === 'police' ? 'busted' : 'wasted');
    msg(G, from === 'police' ? 'Busted! Mara will post your bail…' : 'Wasted! Mara is not happy.', 5000);
  }
}

// Per-frame: cooldown fire-rate, timer reload, regen health, bersih-bersih
// tracer + kilat moncong, dan tembakan petugas yang sedang membidik pemain.
export function updateCombat(G, dt) {
  if (!G.player) return;
  dt = Math.min(dt || 0.016, 0.05);
  G._now = (G._now || 0) + dt; // jam waktu bermain (detik) untuk regen
  if (G._fireCd > 0) G._fireCd -= dt;

  // Timer reload: selesai = mag penuh.
  if (G._reloading) {
    G._reloadT -= dt;
    if (G._reloadT <= 0) {
      const w = weaponOf(G);
      G.player.ammo = w.mag;
      G._reloading = false;
    }
  }

  // Kilat moncong: padam lalu hapus dari scene.
  if (G._flashes) {
    for (let i = G._flashes.length - 1; i >= 0; i--) {
      const f = G._flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        removeFromScene(G, f.group);
        G._flashes.splice(i, 1);
      }
    }
  }
  // Tracer: memudar lalu hapus.
  if (G._tracers) {
    for (let i = G._tracers.length - 1; i >= 0; i--) {
      const tr = G._tracers[i];
      tr.life -= dt;
      tr.line.material.opacity = Math.max(0, tr.life / TRACER_LIFE) * 0.9;
      if (tr.life <= 0) {
        G.scene.remove(tr.line);
        tr.line.geometry.dispose();
        tr.line.material.dispose();
        G._tracers.splice(i, 1);
      }
    }
  }
  if (G._damageFlash > 0) G._damageFlash = Math.max(0, G._damageFlash - dt * 2);

  if (G.mode && G.mode !== 'play') return;

  // Regen health setelah 5 detik tanpa damage.
  if ((G._now || 0) - (G._lastDamageT || -99) > REGEN_DELAY &&
      G.player.health < (G.player.maxHealth || 100)) {
    G.player.health = Math.min(G.player.maxHealth || 100, G.player.health + REGEN_RATE * dt);
  }

  // Petugas ber-state 'shoot' menembak pemain, dengan akurasi seadanya.
  (G.police || []).forEach(function (e) {
    const o = e.officer;
    if (!o || o.state !== 'shoot') return;
    o.fireCd -= dt;
    const dx = G.player.pos.x - o.pos.x, dz = G.player.pos.z - o.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (o.fireCd <= 0 && dist < 35) {
      o.fireCd = 1.1 + Math.random() * 0.6;
      const hitChance = Math.max(0.08, 0.3 * (1 - dist / 40));
      tracer(G,
        new THREE.Vector3(o.pos.x, (o.pos.y || 0) + 1.4, o.pos.z),
        new THREE.Vector3(G.player.pos.x, (G.player.pos.y || 0) + 1, G.player.pos.z));
      if (Math.random() < hitChance) damagePlayer(G, 5 + Math.random() * 4, 'police');
    }
  });
}
