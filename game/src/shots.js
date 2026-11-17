// shots.js — Preset screenshot untuk dossier make.fun (?shot=X).
// Menata G menjadi satu frame diam; tidak pernah commit, simpan, atau mint.
import { showScreen } from './hud.js';

function setWanted(G, level) {
  if (typeof G.setWanted === 'function') G.setWanted(level);
  else {
    G.wanted = level;
    G.wantedHeat = level * 25;
  }
  if (G.audio) G.audio.siren(level > 0);
}

function placePlayer(G, x, z, heading) {
  const p = G.player;
  if (!p) return;
  if (p.pos) {
    p.pos.x = x;
    p.pos.z = z;
  }
  p.heading = heading;
  if (p.group) {
    p.group.position.set(x, 0, z);
    p.group.rotation.y = heading;
  }
}

function placeCar(G, car, x, z, heading, speed = 0) {
  if (!car) return null;
  if (car.pos) {
    car.pos.x = x;
    car.pos.z = z;
  }
  car.heading = heading;
  car.speed = speed;
  if (car.group) {
    car.group.position.set(x, 0, z);
    car.group.rotation.y = heading;
  }
  return car;
}

// Kamera di belakang pemain: posisi = pos - forward*dist + tinggi,
// lalu lihat ke pos + forward*6. forward = (sin heading, cos heading).
function chaseCam(G, dist = 11, height = 4.5) {
  const p = G.player;
  if (!G.camera || !p || !p.pos) return;
  const h = p.heading || 0;
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  G.camera.position.set(p.pos.x - fx * dist, height, p.pos.z - fz * dist);
  G.camera.lookAt(p.pos.x + fx * 6, 1.5, p.pos.z + fz * 6);
}

function driveCar(G, x, z, heading, speed) {
  const cars = G.cars || [];
  const car = cars.find((c) => c.kind === 'sports') || cars[0] || null;
  placeCar(G, car, x, z, heading, speed);
  if (car && G.player) {
    G.player.inCar = car;
    G.player.onFoot = false;
    G.player.pos = car.pos;
    car.driver = G.player;
  }
  placePlayer(G, x, z, heading);
  return car;
}

export function applyShotPreset(G, name) {
  G.mode = 'playing';
  G.time = 10;
  if (G.mission) {
    G.mission.index = -1;
    G.mission.stage = 0;
    G.mission.objective = '';
    G.mission.target = null;
  }
  setWanted(G, 0);

  if (name === 'start') {
    G.mode = 'menu';
    placePlayer(G, 0, 0, 0);
    if (G.camera) {
      G.camera.position.set(70, 45, 70);
      G.camera.lookAt(0, 0, 0);
    }
    showScreen(G, 'menu');
    return;
  }

  showScreen(G, 'none');

  // Screenshot dossier harus menampilkan HUD (minimap, bintang wanted, uang,
  // objektif): showScreen hanya membersihkan display inline, sementara
  // stylesheet menyembunyikan #hud sampai ia membawa class 'on' (aliran
  // start normal menambahkannya di main.js, yang dilewati mode shot).
  const hudEl = document.getElementById('hud');
  if (hudEl) hudEl.classList.add('on');

  if (name === 'street') {
    placePlayer(G, 20, -10, Math.PI * 0.75);
    if (G.player) {
      G.player.onFoot = true;
      G.player.inCar = null;
    }
    // Pejalan kaki melingkar di sekitar pemain.
    (G.peds || []).forEach((pd, i) => {
      const a = (i / Math.max(1, G.peds.length)) * Math.PI * 2;
      if (pd.pos) {
        pd.pos.x = 20 + Math.cos(a) * (6 + i);
        pd.pos.z = -10 + Math.sin(a) * (6 + i);
      }
      if (pd.group) pd.group.position.set(pd.pos.x, 0, pd.pos.z);
    });
    chaseCam(G, 8, 3.5);
  } else if (name === 'drive') {
    driveCar(G, 0, 40, 0, 18);
    (G.cars || []).forEach((c, i) => {
      if (c !== G.player.inCar) placeCar(G, c, (i % 2 ? 6 : -6), 40 + (i + 1) * 14, 0, 12);
    });
    // Tahan gas agar mobil tetap melaju saat frame diambil.
    if (G.input && G.input.keys) G.input.keys.add('KeyW');
    chaseCam(G);
  } else if (name === 'chase') {
    driveCar(G, 0, 0, 0, 22);
    setWanted(G, 3);
    // Entri polisi menyimpan mobil di .car; dua cruiser di samping/depan.
    (G.police || []).slice(0, 2).forEach((e, i) => {
      placeCar(G, e.car, i % 2 ? 6 : -6, 14 + i * 8, 0, 18);
    });
    if (G.mission) G.mission.objective = 'Lose the cops — break line of sight!';
    G.time = 17;
    chaseCam(G);
  } else if (name === 'mission') {
    // Berkendara lurus ke marina (city.spots.marina).
    driveCar(G, -40, 200, 0, 8);
    if (G.input && G.input.keys) G.input.keys.add('KeyW');
    if (G.mission) {
      G.mission.index = 1; // misi ke-2 (0-based)
      G.mission.stage = 1;
      G.mission.objective = 'Pick up the client at Marina Plaza';
      G.mission.target = { x: -40, z: 280 };
    }
    chaseCam(G);
  } else {
    placePlayer(G, 0, 0, 0);
    chaseCam(G);
  }
}
