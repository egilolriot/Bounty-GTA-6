// hud.js — HUD DOM dan minimap Porto Sol.
// Ditulis baru dari nol untuk rebuild round 2.
// Minimap WAJIB selalu menggambar peta (jalan + pemain), tidak boleh kosong.

import * as CONFIG from './config.js';

const CITY_HALF = (typeof CONFIG.CITY_HALF === 'number' && CONFIG.CITY_HALF > 0)
  ? CONFIG.CITY_HALF
  : 360;
const CITY_SIZE = CITY_HALF * 2;

export function bindHUD() {
  const byId = (id) => {
    try { return document.getElementById(id); } catch (e) { return null; }
  };
  return {
    healthFill: byId('health-fill'),
    healthNum: byId('health-num'),
    money: byId('money'),
    stars: byId('stars'),
    missionLabel: byId('mission-label'),
    missionText: byId('mission-text'),
    message: byId('message'),
    minimap: byId('minimap'),
    speed: byId('speed'),
    score: byId('score'),
  };
}

function setText(el, text) {
  if (el) el.textContent = text;
}

export function updateHUD(G, refs) {
  if (!refs) return;
  const health = Math.max(0, Math.min(100, Math.round(G.health || 0)));
  if (refs.healthFill) refs.healthFill.style.width = `${health}%`;
  setText(refs.healthNum, String(health));
  setText(refs.money, `$${Math.floor(G.money || 0)}`);
  const wanted = Math.max(0, Math.min(5, G.wanted || 0));
  setText(refs.stars, '★'.repeat(wanted) + '☆'.repeat(5 - wanted));

  const m = G.mission;
  if (m) {
    setText(refs.missionLabel, m.label || 'Misi');
    const stageNote = m.done
      ? 'Selesai'
      : (m.stage === 1 ? 'Antar paket ke penanda!' : `Target (${Math.round(m.targetX)}, ${Math.round(m.targetZ)})`);
    setText(refs.missionText, `${stageNote} • Hadiah $${m.reward || 0}`);
  } else {
    setText(refs.missionLabel, 'Tidak ada misi');
    setText(refs.missionText, '—');
  }

  // Kecepatan: pakai kecepatan kendaraan bila mengendarai, bila tidak kecepatan jalan kaki.
  let speed = 0;
  if (G.player) {
    if (!G.player.onFoot && G.player.vehicle && typeof G.player.vehicle.speed === 'number') {
      speed = Math.abs(G.player.vehicle.speed);
    } else if (typeof G.player.speed === 'number') {
      speed = Math.abs(G.player.speed);
    }
  }
  setText(refs.speed, `${Math.round(speed * 3.6)} km/h`);
  setText(refs.score, String(Math.floor(G.score || 0)));

  // Pesan sementara (#message) hanya saat masih dalam masa tampil.
  if (refs.message) {
    if (G.messageUntil > G.time && G.messageText) {
      refs.message.textContent = G.messageText;
      refs.message.style.display = 'block';
    } else {
      refs.message.style.display = 'none';
    }
  }
}

// --- Minimap ---------------------------------------------------------------

// Normalisasi satu jalan ke {x1, z1, x2, z2}. Mendukung beberapa bentuk
// yang mungkin dipakai city.js: {x1,z1,x2,z2}, {a:{x,z}, b:{x,z}},
// {from:{x,z}, to:{x,z}}, {start:{x,z}, end:{x,z}}.
function normalizeRoad(r) {
  if (!r) return null;
  if (typeof r.x1 === 'number' && typeof r.z1 === 'number'
    && typeof r.x2 === 'number' && typeof r.z2 === 'number') {
    return { x1: r.x1, z1: r.z1, x2: r.x2, z2: r.z2 };
  }
  const a = r.a || r.from || r.start;
  const b = r.b || r.to || r.end;
  if (a && b && typeof a.x === 'number' && typeof a.z === 'number'
    && typeof b.x === 'number' && typeof b.z === 'number') {
    return { x1: a.x, z1: a.z, x2: b.x, z2: b.z };
  }
  // Jalan sumbu: {axis:'x'|'z', at: n, from: n, to: n}
  if ((r.axis === 'x' || r.axis === 'z') && typeof r.at === 'number') {
    const from = typeof r.from === 'number' ? r.from : -CITY_HALF;
    const to = typeof r.to === 'number' ? r.to : CITY_HALF;
    if (r.axis === 'x') return { x1: from, z1: r.at, x2: to, z2: r.at };
    return { x1: r.at, z1: from, x2: r.at, z2: to };
  }
  return null;
}

function normalizeBuilding(b) {
  if (!b) return null;
  const x = typeof b.x === 'number' ? b.x : 0;
  const z = typeof b.z === 'number' ? b.z : 0;
  const w = typeof b.w === 'number' ? b.w : (typeof b.size === 'number' ? b.size : 20);
  const d = typeof b.d === 'number' ? b.d : (typeof b.size === 'number' ? b.size : 20);
  return { x, z, w, d };
}

export function drawMinimap(G, canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width || 200;
  const H = canvas.height || 200;
  const toX = (x) => ((x + CITY_HALF) / CITY_SIZE) * W;
  const toY = (z) => ((z + CITY_HALF) / CITY_SIZE) * H;
  const scale = W / CITY_SIZE;

  // 1) Background gelap — canvas tidak pernah dibiarkan kosong.
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0b1520';
  ctx.fillRect(0, 0, W, H);

  // 2) Laut di barat (x < -300): area biru.
  ctx.fillStyle = '#144a7a';
  ctx.fillRect(0, 0, toX(-300), H);

  // 3) Blok bangunan sebagai kotak.
  const buildings = (G.city && Array.isArray(G.city.buildings)) ? G.city.buildings : [];
  ctx.fillStyle = '#3a4756';
  for (const raw of buildings) {
    const b = normalizeBuilding(raw);
    if (!b) continue;
    ctx.fillRect(toX(b.x - b.w / 2), toY(b.z - b.d / 2), Math.max(1, b.w * scale), Math.max(1, b.d * scale));
  }

  // 4) Jalan-jalan kota sebagai garis abu-abu.
  const roads = (G.city && Array.isArray(G.city.roads)) ? G.city.roads : [];
  ctx.strokeStyle = '#8a97a5';
  ctx.lineWidth = Math.max(1, 6 * scale);
  ctx.beginPath();
  let drewRoad = false;
  for (const raw of roads) {
    const r = normalizeRoad(raw);
    if (!r) continue;
    ctx.moveTo(toX(r.x1), toY(r.z1));
    ctx.lineTo(toX(r.x2), toY(r.z2));
    drewRoad = true;
  }
  if (!drewRoad) {
    // Fallback: grid jalan tiap 60 unit agar peta tetap terlihat
    // bila G.city.roads kosong / formatnya tak dikenal.
    for (let v = -CITY_HALF; v <= CITY_HALF; v += 60) {
      ctx.moveTo(toX(v), toY(-CITY_HALF));
      ctx.lineTo(toX(v), toY(CITY_HALF));
      ctx.moveTo(toX(-CITY_HALF), toY(v));
      ctx.lineTo(toX(CITY_HALF), toY(v));
    }
  }
  ctx.stroke();

  // 5) Polisi sebagai titik merah.
  const police = [];
  if (Array.isArray(G.police)) police.push(...G.police);
  if (Array.isArray(G.vehicles)) {
    for (const v of G.vehicles) {
      if (v && (v.police === true || v.type === 'police')) police.push(v);
    }
  }
  ctx.fillStyle = '#ff2d2d';
  for (const p of police) {
    const px = typeof p.x === 'number' ? p.x : (p.mesh ? p.mesh.position.x : null);
    const pz = typeof p.z === 'number' ? p.z : (p.mesh ? p.mesh.position.z : null);
    if (px === null || pz === null) continue;
    ctx.beginPath();
    ctx.arc(toX(px), toY(pz), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // 6) Marker misi: diamond kuning berdenyut di target aktif.
  const t = G.mission && !G.mission.done
    ? { x: G.mission.targetX, z: G.mission.targetZ }
    : null;
  if (t && typeof t.x === 'number' && typeof t.z === 'number') {
    const pulse = 5 + 2.5 * Math.sin((G.time || 0) * 5);
    const cx = toX(t.x);
    const cy = toY(t.z);
    ctx.fillStyle = '#ffd400';
    ctx.strokeStyle = '#ffd400';
    ctx.beginPath();
    ctx.moveTo(cx, cy - pulse);
    ctx.lineTo(cx + pulse, cy);
    ctx.lineTo(cx, cy + pulse);
    ctx.lineTo(cx - pulse, cy);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(cx, cy, pulse + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 7) Pemain: panah putih di posisi pemain, berotasi sesuai heading.
  // Canvas: sumbu x ke kanan (timur), sumbu y ke bawah (selatan/z).
  // Arah hadap (sin h, cos h) pada (x, z) -> sudut canvas atan2(cos h, sin h).
  const px = G.player && typeof G.player.x === 'number' ? G.player.x : 0;
  const pz = G.player && typeof G.player.z === 'number' ? G.player.z : 0;
  const heading = G.player && typeof G.player.heading === 'number' ? G.player.heading : 0;
  const cx = toX(px);
  const cy = toY(pz);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.atan2(Math.cos(heading), Math.sin(heading)));
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Bingkai tipis.
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
}
