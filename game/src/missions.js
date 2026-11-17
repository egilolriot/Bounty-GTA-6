// missions.js — rantai misi cerita Porto Sol (bounty make.fun GTA 6).
// Jax Marlowe, sopir pelarian. Mara Voss, fixer yang membagikan pekerjaan.
// Lima misi, lalu tamat. Marker adalah beacon bercahaya di dunia;
// baris objective HUD dan blip minimap membaca G.mission.
import * as THREE from 'three';
import { setWanted } from './police.js';

export const MISSIONS = [
  { id: 'first-wheels', title: 'First Wheels', reward: 500,
    briefing: 'Mara: "Every driver needs wheels, Jax. Borrow one — any one — and bring it to my garage."',
    objective: 'Steal a car, then drive to the garage.',
    steps: ['Steal any car', 'Drive to the garage marker'] },
  { id: 'the-pickup', title: 'The Pickup', reward: 800,
    briefing: 'Mara: "My client is waiting at the marina. Fetch him, take him to the Grand Azure. And stay clean — if the cops light you up, he walks."',
    objective: 'Pick up the client at the marina, deliver him to the Grand Azure hotel.',
    steps: ['Reach the marina in a car', 'Deliver the client to the hotel'] },
  { id: 'street-heat', title: 'Street Heat', reward: 1200,
    briefing: 'Mara: "You made the evening news, Jax. Lose them. Survive the heat for 75 seconds and the street forgets."',
    objective: 'Survive a 3-star wanted level for 75 seconds.',
    steps: ['Stay ahead of the police', 'Survive until the timer ends'] },
  { id: 'the-vault-job', title: 'The Vault Job', reward: 2500,
    briefing: 'Mara: "The Meridian Bank keeps its cash in a back vault. Walk in, grab it, and run — the harbor is the only way out."',
    objective: 'On foot: reach the bank, hold the vault 5s, escape by car to the harbor.',
    steps: ['Reach the bank on foot', 'Hold the vault for 5 seconds', 'Escape by car to the harbor'] },
  { id: 'sunset-run', title: 'Sunset Run', reward: 5000,
    briefing: 'Mara: "One last run, Jax. Five checkpoints, harbor finish, 150 seconds. Drive like the sun is chasing you — because it is."',
    objective: 'Drive through all 5 checkpoints to the harbor before time runs out.',
    steps: ['Hit checkpoint 1', 'Hit checkpoint 2', 'Hit checkpoint 3', 'Hit checkpoint 4', 'Reach the harbor'] },
];

// Titik-titik kota. city.js boleh menimpa lewat G.city.spots (kunci sama).
const SPOTS = {
  garage: { x: 40, z: 40 },
  marina: { x: -40, z: 280 },
  hotel: { x: 120, z: -40 },
  bank: { x: -120, z: 40 },
  harbor: { x: -120, z: 280 },
};
function spot(G, name) {
  const s = (G.city && G.city.spots && G.city.spots[name]) ||
    (G.city && G.city.landmarks && G.city.landmarks[name]);
  return s ? { x: s.x, z: s.z } : SPOTS[name];
}
function dist(ax, az, bx, bz) {
  const x = ax - bx, z = az - bz;
  return Math.sqrt(x * x + z * z);
}
function msg(G, text, ms) {
  try {
    if (typeof G.showMessage === 'function') G.showMessage(G, text, ms || 4000);
    else if (G.hud && typeof G.hud.showMessage === 'function') G.hud.showMessage(G, text, ms || 4000);
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
function save(G) {
  try { if (typeof G.saveGame === 'function') G.saveGame(G); } catch (e) { /* abaikan */ }
  try { if (G.save && typeof G.save.saveGame === 'function') G.save.saveGame(G); } catch (e) { /* abaikan */ }
}

// Beacon: kolom cahaya + cincin tanah + panah melayang (THREE.Group).
function makeMarker(G, x, z, color) {
  disposeMarker(G);
  color = color || 0xffc233;
  const grp = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4, 26, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false,
    }));
  beam.position.y = 13;
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5, 0.4, 24),
    new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.9 }));
  ring.position.y = 0.2;
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(1.2, 2.6, 4),
    new THREE.MeshBasicMaterial({ color: color }));
  arrow.position.y = 30;
  arrow.rotation.x = Math.PI; // mengarah ke bawah
  grp.add(beam, ring, arrow);
  grp.position.set(x, 0, z);
  grp.userData.arrow = arrow;
  G.scene.add(grp);
  G.mission.marker = grp;
  G.mission.target = { x: x, z: z }; // blip minimap membaca ini
  return grp;
}

// Hapus marker aktif dari scene (internal).
function disposeMarker(G) {
  const m = G.mission && G.mission.marker;
  if (!m) return;
  try { G.scene.remove(m); } catch (e) { /* abaikan */ }
  m.traverse(function (o) {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (mt) { mt.dispose(); });
  });
  G.mission.marker = null;
  G.mission.target = null;
}

export function missionTitle(G) {
  const i = G.mission ? G.mission.index : -1;
  return i >= 0 && MISSIONS[i] ? MISSIONS[i].title : 'Free Roam';
}

export function failMission(G, reason) {
  disposeMarker(G);
  G.mission.failed = true;
  G.mission.failT = 3;
  G.mission.objective = 'Mission failed — retrying…';
  msg(G, reason + ' Mission failed — retrying.', 4000);
  sfx(G, 'mission');
}

export function completeMission(G) {
  const m = MISSIONS[G.mission.index];
  disposeMarker(G);
  G.player.cash = (G.player.cash || 0) + m.reward;
  if (G.stats) {
    G.stats.missionsDone = (G.stats.missionsDone || 0) + 1;
    G.stats.cashEarned = (G.stats.cashEarned || 0) + m.reward;
  }
  const done = G.mission.index;
  G.mission.index = -1;
  G.mission.stage = 0;
  G.mission.objective = '';
  G.mission.target = null;
  G.mission.checkpoints = [];
  G.mission.cpIndex = 0;
  G.missionsUnlocked = Math.max(G.missionsUnlocked || 1, done + 2);
  msg(G, m.title + ' complete — $' + m.reward + ' earned.', 5000);
  sfx(G, 'mission');
  screen(G, 'mission-complete');
  save(G);
  if (done === MISSIONS.length - 1) {
    G.mode = 'complete';
    screen(G, 'complete');
    msg(G, 'Porto Sol is yours, Jax. Mara will call again.', 6000);
  }
}

export function startMission(G, i) {
  if (i < 0 || i >= MISSIONS.length) return;
  if (!G.mission) G.mission = {};
  disposeMarker(G);
  const m = MISSIONS[i];
  G.mission.index = i;
  G.mission.stage = 0;
  G.mission.failed = false;
  G.mission.failT = 0;
  G.mission.timer = 0;
  G.mission.vaultT = 0;
  G.mission.cpIndex = 0;
  G.mission.checkpoints = [];
  G.mission.marker = null;
  G.mission.target = null;
  G.mission.objective = m.objective;
  // Setiap job dimulai bersih: heat/wanted sisa dari job sebelumnya tidak
  // boleh langsung menggagalkan misi baru (khususnya M2, yang gagal bila
  // wanted >= 2 — padahal M1 mengharuskan pemain mencuri mobil). Misi yang
  // memang butuh wanted (M3, M4) mengaturnya sendiri di bawah.
  try { setWanted(G, 0); } catch (e) {}
  msg(G, m.title + ' — Mara: ' + m.briefing, 6000);
  if (i === 0) {
    // Belum ada marker: pemain harus mencuri mobil dulu.
  } else if (i === 1) {
    const s = spot(G, 'marina');
    makeMarker(G, s.x, s.z);
  } else if (i === 2) {
    setWanted(G, 3);
    G.mission.timer = 75;
  } else if (i === 3) {
    const s = spot(G, 'bank');
    makeMarker(G, s.x, s.z, 0x33e0ff);
  } else if (i === 4) {
    G.mission.checkpoints = [
      spot(G, 'marina'), spot(G, 'garage'), spot(G, 'hotel'),
      spot(G, 'bank'), spot(G, 'harbor'),
    ];
    G.mission.timer = 150;
    const c = G.mission.checkpoints[0];
    makeMarker(G, c.x, c.z, 0x7dff5a);
  }
}

export function updateMissions(G, dt) {
  const M = G.mission;
  if (!M || M.index == null || M.index < 0 || !G.player) return;
  if (G.mode && G.mode !== 'play') return;
  dt = Math.min(dt || 0.016, 0.05);
  const p = G.player.pos;

  // Gagal: jeda singkat, lalu ulangi misi yang sama.
  if (M.failed) {
    M.failT -= dt;
    if (M.failT <= 0) startMission(G, M.index);
    return;
  }

  // Panah marker melayang naik-turun, beacon berputar pelan.
  if (M.marker && M.marker.userData.arrow) {
    M.marker.userData.arrow.position.y = 30 + Math.sin((G.time || 0) * 3) * 1.5;
    M.marker.rotation.y += dt * 0.8;
  }

  const i = M.index;
  const near = function (t, r) { return dist(p.x, p.z, t.x, t.z) < r; };

  if (i === 0) {
    // First Wheels: curi mobil, lalu bawa ke garasi.
    if (M.stage === 0 && G.player.inCar) {
      M.stage = 1;
      const g = spot(G, 'garage');
      makeMarker(G, g.x, g.z);
      M.objective = 'Drive to the garage marker.';
      msg(G, 'Nice wheels. Now bring it to the garage.', 3500);
    } else if (M.stage === 1 && near(spot(G, 'garage'), 9)) {
      completeMission(G);
    }
  } else if (i === 1) {
    // The Pickup: jemput klien di marina, antar ke hotel. Gagal bila wanted >= 2.
    if ((G.wanted || 0) >= 2) { failMission(G, 'The client saw the cops and bailed.'); return; }
    if (M.stage === 0) {
      if (G.player.inCar && near(spot(G, 'marina'), 9)) {
        M.stage = 1;
        const h = spot(G, 'hotel');
        makeMarker(G, h.x, h.z);
        M.objective = 'Deliver the client to the Grand Azure hotel. Stay under 2 stars.';
        msg(G, 'Client aboard. Smooth and quiet to the Grand Azure.', 3500);
      }
    } else if (M.stage === 1) {
      if (!G.player.inCar) { failMission(G, 'You left the client behind.'); return; }
      if (near(spot(G, 'hotel'), 9)) completeMission(G);
    }
  } else if (i === 2) {
    // Street Heat: bertahan 75 detik di wanted 3.
    M.timer -= dt;
    M.objective = 'Survive the heat — ' + Math.max(0, Math.ceil(M.timer)) + 's left.';
    if ((G.wanted || 0) < 3) setWanted(G, 3); // panasnya dijaga tetap menyala
    if (M.timer <= 0) {
      setWanted(G, 0);
      completeMission(G);
    }
  } else if (i === 3) {
    // The Vault Job: jalan kaki ke bank, tahan vault 5 detik, kabur ke harbor.
    if (M.stage === 0) {
      if (G.player.onFoot && near(spot(G, 'bank'), 8)) {
        M.stage = 1;
        M.vaultT = 5;
        M.objective = 'Grab the cash — stay in the vault.';
        msg(G, 'In the vault. Hold still…', 3000);
      }
    } else if (M.stage === 1) {
      if (!near(spot(G, 'bank'), 10)) {
        M.stage = 0;
        M.vaultT = 5;
        M.objective = 'Reach the bank vault on foot.';
      } else {
        M.vaultT -= dt;
        M.objective = 'Grabbing the cash — ' + Math.max(0, Math.ceil(M.vaultT)) + 's…';
        if (M.vaultT <= 0) {
          M.stage = 2;
          setWanted(G, 4);
          const h = spot(G, 'harbor');
          makeMarker(G, h.x, h.z, 0xff5533);
          M.objective = 'Cash grabbed! Escape by car to the harbor.';
          msg(G, 'Cash grabbed! The whole city is coming — run!', 4000);
        }
      }
    } else if (M.stage === 2) {
      if (G.player.inCar && near(spot(G, 'harbor'), 10)) completeMission(G);
    }
  } else if (i === 4) {
    // Sunset Run: 5 checkpoint berurutan ke harbor dalam 150 detik.
    M.timer -= dt;
    if (M.timer <= 0) { failMission(G, 'Out of time.'); return; }
    const cp = M.checkpoints[M.cpIndex];
    M.objective = 'Checkpoint ' + (M.cpIndex + 1) + '/5 — ' + Math.max(0, Math.ceil(M.timer)) + 's left.';
    if (cp && near(cp, 10)) {
      M.cpIndex++;
      sfx(G, 'pickup');
      if (M.cpIndex >= M.checkpoints.length) {
        completeMission(G);
      } else {
        const n = M.checkpoints[M.cpIndex];
        makeMarker(G, n.x, n.z, 0x7dff5a);
        msg(G, 'Checkpoint ' + M.cpIndex + '/5!', 2500);
      }
    }
  }
}
