// missions.js — Logika misi Porto Sol (GTA 6 "Porto Sol", make.fun gta6-01).
// Lima misi berurutan; misi ke-5 selesai berarti menang.
// Ditulis baru dari nol untuk rebuild round 2.

import * as CONFIG from './config.js';

// Daftar misi bawaan bila config.js belum menyediakan MISSIONS.
// Bentuk tiap misi: { name, brief, type, target: {x, z}, reward }.
// type: 'goto' | 'deliver' | 'evade' | 'escape'
const FALLBACK_MISSIONS = [
  {
    name: 'Pengenalan Porto Sol',
    brief: 'Selamat datang di Porto Sol! Pergi ke penanda kuning di peta.',
    type: 'goto',
    target: { x: 120, z: -80 },
    reward: 500,
  },
  {
    name: 'Kurir Cepat',
    brief: 'Ambil paket di titik kuning, lalu antar ke titik seberangnya.',
    type: 'deliver',
    target: { x: -150, z: 200 },
    reward: 800,
  },
  {
    name: 'Hindari Polisi',
    brief: 'Buat wanted naik ke 2 bintang, lalu hilangkan sampai 0 dan bertahan 5 detik.',
    type: 'evade',
    target: { x: 200, z: 200 },
    reward: 1200,
  },
  {
    name: 'Pelarian Pantai',
    brief: 'Kabur ke ujung pantai selagi wanted minimal 3 bintang!',
    type: 'escape',
    target: { x: -300, z: 100 },
    reward: 2500,
  },
  {
    name: 'Bos Terakhir',
    brief: 'Misi terakhir: capai markas di utara kota dan menangkan Porto Sol!',
    type: 'goto',
    target: { x: 0, z: -300 },
    reward: 5000,
  },
];

export const MISSIONS = Array.isArray(CONFIG.MISSIONS) && CONFIG.MISSIONS.length >= 5
  ? CONFIG.MISSIONS
  : FALLBACK_MISSIONS;

function showMessage(G, text, seconds = 5) {
  G.messageText = text;
  G.messageUntil = G.time + seconds;
}

function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function completeMission(G) {
  const m = G.mission;
  if (!m || m.done) return;
  m.done = true;
  G.money += m.reward;
  G.score += m.reward;
  showMessage(G, `Misi selesai! +$${m.reward}`, 5);
  if (G.audio && typeof G.audio.play === 'function') {
    try { G.audio.play('mission'); } catch (e) { /* audio opsional */ }
  }
  if (m.index >= 4) {
    G.state = 'won';
  } else {
    startMission(G, m.index + 1);
  }
}

export function startMission(G, i) {
  const cfg = MISSIONS[i];
  if (!cfg) return;
  G.mission = {
    index: i,
    stage: 0,
    label: cfg.name,
    targetX: cfg.target.x,
    targetZ: cfg.target.z,
    done: false,
    reward: cfg.reward,
  };
  // Reset status internal tipe evade setiap misi baru.
  G._evadeArmed = false;
  G._evadeTimer = 0;
  showMessage(G, cfg.brief || cfg.name, 5);
}

export function updateMission(G, dt) {
  const m = G.mission;
  if (!m || m.done || G.state !== 'playing') return;
  const cfg = MISSIONS[m.index];
  if (!cfg) return;
  const px = G.player ? G.player.x : 0;
  const pz = G.player ? G.player.z : 0;
  const d = dist2D(px, pz, m.targetX, m.targetZ);

  switch (cfg.type) {
    case 'goto': {
      if (d < 12) completeMission(G);
      break;
    }
    case 'deliver': {
      if (m.stage === 0) {
        if (d < 12) {
          // Sampai di titik ambil: tahap berikutnya ke titik antar,
          // yaitu cerminan koordinat titik ambil.
          m.stage = 1;
          m.targetX = -m.targetX;
          m.targetZ = -m.targetZ;
          showMessage(G, 'Paket diambil! Antar ke penanda kuning.', 4);
        }
      } else if (d < 12) {
        completeMission(G);
      }
      break;
    }
    case 'evade': {
      if (G.wanted >= 2) G._evadeArmed = true;
      if (G._evadeArmed) {
        if (G.wanted === 0) {
          G._evadeTimer = (G._evadeTimer || 0) + dt;
          if (G._evadeTimer >= 5) completeMission(G);
        } else {
          G._evadeTimer = 0;
        }
      }
      break;
    }
    case 'escape': {
      if (d < 12 && G.wanted >= 3) completeMission(G);
      break;
    }
    default: {
      if (d < 12) completeMission(G);
      break;
    }
  }
}

export function missionTarget(G) {
  const m = G.mission;
  if (!m || m.done) return null;
  return { x: m.targetX, z: m.targetZ };
}
