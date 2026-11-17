// hud.js — Porto Sol: HUD, minimap, layar menu/pause/misi, dan pesan singkat.
// Modul ini hanya menyentuh DOM yang tercantum di kontrak; semua state game
// dibaca dari objek G yang dilewatkan oleh main loop.
const $ = (id) => document.getElementById(id);

// Nama layar logis -> id elemen di index.html. null = tidak ada layar tampil.
const SCREEN_IDS = {
  menu: 'menu',
  pause: 'pause-menu',
  mission: 'mission-screen',
  gameover: 'gameover-screen',
  complete: 'complete-screen',
  none: null,
  'mission-complete': null,
};

const WEAPON_NAMES = { 1: 'Pistol', 2: 'SMG', 3: 'Shotgun' };

function money(n) {
  return '$' + Math.max(0, Math.floor(n || 0)).toLocaleString('en-US');
}

function clock(t) {
  const h = typeof t === 'number' ? t : 10;
  const hh = Math.floor(h) % 24;
  const mm = Math.floor(((h % 1) + 1) % 1 * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function starRow(level) {
  const n = Math.max(0, Math.min(5, Math.round(level || 0)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function bindClick(id, fn) {
  const b = $(id);
  if (b) b.addEventListener('click', fn);
}

export function initHud(G) {
  const el = {};
  for (const id of [
    'game', 'hud', 'minimap', 'wanted', 'health-fill', 'cash', 'time',
    'objective', 'objective-title', 'objective-text', 'message', 'speed',
    'weapon', 'crosshair', 'menu', 'pause-menu', 'mission-screen',
    'gameover-screen', 'complete-screen', 'loading', 'save-info',
    'mission-title', 'mission-desc',
  ]) el[id] = $(id);

  const ctx = el.minimap ? el.minimap.getContext('2d') : null;
  G.hud = { el, ctx, msgTimer: 0, vignette: null, lastMinimap: 0 };

  // Vignette merah untuk darah rendah (tidak ada id-nya di index.html,
  // jadi dibuat di sini dan ditempel ke body).
  const vig = document.createElement('div');
  vig.id = 'low-health-vignette';
  vig.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;'
    + 'background:radial-gradient(ellipse at center,transparent 55%,rgba(200,0,0,.55) 100%);'
    + 'transition:opacity .3s;z-index:40;';
  document.body.appendChild(vig);
  G.hud.vignette = vig;

  if (el.loading) el.loading.style.display = 'none';

  bindClick('btn-start', () => {
    if (G.audio) G.audio.resume();
    if (typeof G.startGame === 'function') G.startGame();
    else showScreen(G, 'none');
  });
  bindClick('btn-continue', () => {
    if (G.audio) G.audio.resume();
    if (typeof G.continueGame === 'function') G.continueGame();
    else showScreen(G, 'none');
  });
  bindClick('btn-howto', () => showMessage(G,
    'WASD jalan / mengemudi • E masuk mobil • F rebut mobil • klik tembak • Spasi lompat / rem • P jeda', 5000));
  bindClick('btn-resume', () => {
    if (typeof G.resumeGame === 'function') G.resumeGame();
    else showScreen(G, 'none');
  });
  bindClick('btn-restart', () => {
    if (typeof G.restartGame === 'function') G.restartGame();
    else location.reload();
  });
  bindClick('btn-retry', () => {
    if (typeof G.restartGame === 'function') G.restartGame();
    else location.reload();
  });
  bindClick('btn-play-again', () => {
    if (typeof G.restartGame === 'function') G.restartGame();
    else location.reload();
  });
  bindClick('btn-quit', () => {
    if (typeof G.quitToMenu === 'function') G.quitToMenu();
    else showScreen(G, 'menu');
  });
  bindClick('btn-mute', (ev) => {
    G.muted = !G.muted;
    if (G.audio && typeof G.audio.setMuted === 'function') G.audio.setMuted(G.muted);
    if (ev && ev.target) ev.target.textContent = G.muted ? 'Unmute' : 'Mute';
  });
  bindClick('btn-mission-close', () => {
    showScreen(G, 'none');
    if (G.mode === 'pause' && typeof G.resumeGame === 'function') G.resumeGame();
  });

  // Info simpanan di menu utama, bila ada.
  if (el['save-info']) {
    try {
      const raw = localStorage.getItem('porto-sol-save-v1');
      if (raw) {
        const s = JSON.parse(raw);
        el['save-info'].textContent = 'Simpanan: $' + (s.cash || 0)
          + ' • ' + (s.missionsDone || 0) + ' misi selesai';
      } else {
        el['save-info'].textContent = 'Belum ada simpanan.';
      }
    } catch { el['save-info'].textContent = ''; }
  }
}

export function updateHud(G, dt) {
  const h = G.hud;
  if (!h) return;
  const el = h.el;
  const p = G.player || {};

  if (el.cash) el.cash.textContent = money(p.cash);

  const car = p.inCar || null;
  const spd = car ? (car.speed || 0) : (p.speed || 0);
  if (el.speed) el.speed.textContent = Math.round(Math.abs(spd) * 3.6) + ' km/h';

  const maxHp = p.maxHealth || 100;
  const hp = Math.max(0, Math.min(maxHp, p.health ?? 100));
  if (el['health-fill']) {
    el['health-fill'].style.width = (hp / maxHp * 100) + '%';
    el['health-fill'].style.background = hp < 30 ? '#e33' : hp < 60 ? '#fa0' : '#3d3';
  }

  if (el.wanted) {
    el.wanted.textContent = starRow(G.wanted);
    el.wanted.style.color = (G.wanted || 0) >= 3 ? '#f44' : '#fd0';
  }

  const m = G.mission || {};
  if (el['objective-text']) {
    el['objective-text'].textContent = m.objective || 'Jelajahi Porto Sol — cari kerja, kumpulkan uang.';
  }
  if (el['objective-title']) {
    let title = 'Free Roam';
    try {
      if (typeof G.missionTitle === 'function') title = G.missionTitle(G) || title;
    } catch { /* biarkan judul default */ }
    el['objective-title'].textContent = (m.index >= 0) ? title : 'Free Roam';
  }

  if (el.weapon) {
    const w = p.weapon;
    const name = typeof w === 'number' ? (WEAPON_NAMES[w] || 'Pistol') : (w || 'Fists');
    const ammo = (typeof p.ammo === 'number' && typeof w === 'number') ? ' • ' + p.ammo : '';
    el.weapon.textContent = name + ammo;
  }

  if (el.time) el.time.textContent = clock(G.time);

  if (el.crosshair) {
    const armed = p.onFoot && p.weapon && p.weapon !== 'Fists' && p.weapon !== 'None';
    el.crosshair.style.display = armed ? 'block' : 'none';
  }

  if (h.vignette) {
    h.vignette.style.opacity = hp < 30 ? String(1 - hp / 30) : '0';
  }

  drawMinimap(G);
}

export function showMessage(G, text, ms = 2500) {
  const el = G.hud ? G.hud.el.message : $('message');
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
  el.style.opacity = '1';
  if (G.hud) clearTimeout(G.hud.msgTimer);
  const t = setTimeout(() => { el.style.opacity = '0'; }, ms);
  if (G.hud) G.hud.msgTimer = t;
}

export function drawMinimap(G) {
  const h = G.hud;
  if (!h || !h.ctx || !h.el.minimap) return;
  const cv = h.el.minimap;
  const ctx = h.ctx;
  const W = cv.width;
  const H = cv.height;
  const city = G.city || {};
  const mm = city.minimap || { roads: [], buildings: [] };

  // city.bounds memakai kunci x0/z0/x1/z1. Normalisasi dulu ke minX/maxX/
  // minZ/maxZ — membaca minX langsung dari bounds akan menghasilkan
  // undefined, skala menjadi NaN, dan minimap kosong (bug v1).
  const b0 = city.bounds || {};
  const minX = b0.minX ?? b0.x0 ?? -400;
  const maxX = b0.maxX ?? b0.x1 ?? 400;
  const minZ = b0.minZ ?? b0.z0 ?? -400;
  const maxZ = b0.maxZ ?? b0.z1 ?? 400;
  const sx = W / Math.max(1, maxX - minX);
  const sz = H / Math.max(1, maxZ - minZ);
  const X = (x) => (x - minX) * sx;
  const Z = (z) => (z - minZ) * sz;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0d2b1e';
  ctx.fillRect(0, 0, W, H);

  // Rect minimap memakai sudut kiri-atas (x/z), bukan titik tengah.
  ctx.fillStyle = '#3a3f46';
  for (const r of mm.roads || []) {
    ctx.fillRect(X(r.x), Z(r.z), Math.max(1, r.w * sx), Math.max(1, r.h * sz));
  }
  ctx.fillStyle = '#5a6b7a';
  for (const bd of mm.buildings || []) {
    ctx.fillRect(X(bd.x), Z(bd.z), Math.max(1, bd.w * sx), Math.max(1, bd.h * sz));
  }

  // Marker misi: diamond amber berdenyut.
  const m = G.mission || {};
  if (m.target) {
    const pulse = 3 + 2 * Math.sin(performance.now() / 300);
    const mx = X(m.target.x);
    const mz = Z(m.target.z);
    ctx.fillStyle = '#ffb000';
    ctx.beginPath();
    ctx.moveTo(mx, mz - pulse - 2);
    ctx.lineTo(mx + pulse + 2, mz);
    ctx.lineTo(mx, mz + pulse + 2);
    ctx.lineTo(mx - pulse - 2, mz);
    ctx.closePath();
    ctx.fill();
  }

  // Blip polisi: biru, berkedip merah saat wanted >= 3.
  // Posisi ada di entri .car atau .officer.
  for (const e of G.police || []) {
    const pos = (e.car && e.car.pos) || (e.officer && e.officer.pos);
    if (!pos) continue;
    const flash = (G.wanted || 0) >= 3 && Math.floor(performance.now() / 300) % 2 === 1;
    ctx.fillStyle = flash ? '#f44' : '#38f';
    ctx.beginPath();
    ctx.arc(X(pos.x), Z(pos.z), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Panah pemain putih, diputar mengikuti heading (heading 0 = +Z).
  const p = G.player || {};
  const px = X(p.pos ? p.pos.x : 0);
  const pz = Z(p.pos ? p.pos.z : 0);
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(Math.PI - (p.heading || 0));
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Penunjuk utara + kotak viewport di sekitar pemain.
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('N', 5, 13);
  ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.strokeRect(px - 30, pz - 22, 60, 44);
}

export function showScreen(G, name) {
  const ids = ['menu', 'pause-menu', 'mission-screen', 'gameover-screen', 'complete-screen'];
  for (const id of ids) {
    const e = $(id);
    if (e) e.style.display = 'none';
  }
  const target = SCREEN_IDS[name];
  if (target) {
    const e = $(target);
    if (e) e.style.display = 'flex';
  }
  const hud = $('hud');
  if (hud) {
    hud.style.display = (name === 'menu' || name === 'gameover' || name === 'complete') ? 'none' : '';
    // The stylesheet hides #hud until it carries the 'on' class; the inline
    // display alone does not show it. Toggle the class here so the HUD is
    // visible in every playing state, not only in shot presets.
    hud.classList.toggle('on', !(name === 'menu' || name === 'gameover' || name === 'complete'));
  }
  if (G) G.mode = (name === 'none' || name === 'mission-complete') ? 'playing' : name;
}
