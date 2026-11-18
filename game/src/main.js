import * as THREE from 'three';
import { WORLD, COLORS, MISSIONS, PLAYER, WANTED } from './config.js';
import { mulberry32, rand, randInt, pick } from './random.js';
import { generateCity, buildCityMeshes } from './city.js';
import { createRenderer, createScene, addLights, addSky } from './render.js';
import { createPlayer, updatePlayer, enterVehicle, exitVehicle } from './player.js';
import { makeCarMesh, spawnTraffic, updateVehicles, nearestVehicle } from './vehicles.js';
import { makePedMesh, spawnPeds, updatePeds } from './pedestrians.js';
import { updatePolice, setWanted, spawnPoliceCar, policeCount } from './police.js';
import { startMission, updateMission, missionTarget } from './missions.js';
import { shoot, updateCombat, hurtPlayer } from './combat.js';
import { bindHUD, updateHUD, drawMinimap } from './hud.js';
import { createInput, isDown } from './input.js';
import { createAudio } from './audio.js';
import { saveGame, loadGame, clearSave } from './save.js';
import { shotName, applyShot } from './shots.js';

// ---------------------------------------------------------------------------
// Porto Sol — main entry point. Written from scratch for round 2.
// Coordinates: x east, z south, y up. City 720 x 720 (x, z in -360..360).
// ---------------------------------------------------------------------------

const WORLD_SIZE = (WORLD && (WORLD.size || WORLD.width)) || 720;
const HALF = WORLD_SIZE / 2;
const START_HEALTH = (PLAYER && PLAYER.health) || 100;
const MAX_WANTED = (WANTED && (WANTED.max || WANTED.maxStars)) || 5;

const G = {
  time: 0,
  money: 0,
  wanted: 0,
  health: START_HEALTH,
  score: 0,
  state: 'menu',
  player: null,
  vehicles: [],
  peds: [],
  mission: { index: 0, stage: 0, label: '', targetX: 0, targetZ: 0, done: false, reward: 0 },
  city: null,
  input: null,
  audio: null,
  scene: null,
  camera: null,
  renderer: null,
  shotMode: null,
  messageText: '',
  messageUntil: 0,
  tracers: [],
};

// Make the shared state inspectable from the console (debugging only).
window.__PORTO_SOL__ = G;

// --- DOM -------------------------------------------------------------------
const canvas = document.getElementById('game');
const hudEl = document.getElementById('hud');
const minimapCanvas = document.getElementById('minimap');
const messageEl = document.getElementById('message');
const overlays = {
  menu: document.getElementById('menu'),
  pause: document.getElementById('pause'),
  gameover: document.getElementById('gameover'),
  win: document.getElementById('win'),
};

function showOverlay(name) {
  for (const key of Object.keys(overlays)) {
    if (overlays[key]) overlays[key].classList.toggle('on', key === name);
  }
  if (hudEl) hudEl.classList.toggle('on', name === null);
}

function showMessage(text, seconds) {
  G.messageText = text || '';
  G.messageUntil = G.time + (seconds || 4);
  if (messageEl) messageEl.textContent = G.messageText;
}

// --- Small helpers that tolerate the exact player/vehicle object shape -----
function objectOf(entity) {
  if (!entity) return null;
  return entity.mesh || entity.group || entity.object || entity.model || null;
}

function positionOf(entity) {
  if (!entity) return null;
  if (entity.position && typeof entity.position.x === 'number') return entity.position;
  const obj = objectOf(entity);
  if (obj && obj.position) return obj.position;
  return null;
}

function headingOf(entity) {
  if (!entity) return 0;
  if (typeof entity.heading === 'number') return entity.heading;
  if (typeof entity.angle === 'number') return entity.angle;
  if (typeof entity.rotationY === 'number') return entity.rotationY;
  const obj = objectOf(entity);
  if (obj) return obj.rotation ? obj.rotation.y : 0;
  return 0;
}

function facingOf(entity, out) {
  const obj = objectOf(entity);
  if (obj && typeof obj.getWorldDirection === 'function') {
    obj.getWorldDirection(out);
    return out;
  }
  const h = headingOf(entity);
  out.set(Math.sin(h), 0, Math.cos(h));
  return out;
}

function isDriving() {
  const p = G.player;
  if (!p) return false;
  return Boolean(p.inVehicle || p.vehicle || p.currentVehicle || p.driving);
}

function currentVehicle() {
  const p = G.player;
  if (!p) return null;
  return p.vehicle || p.currentVehicle || null;
}

function playerSpeed() {
  const p = G.player;
  if (!p) return 0;
  if (typeof p.speed === 'number') return Math.abs(p.speed);
  if (p.velocity && typeof p.velocity.length === 'function') return p.velocity.length();
  const v = currentVehicle();
  if (v && typeof v.speed === 'number') return Math.abs(v.speed);
  return 0;
}

// --- Boot: renderer / scene / city / actors --------------------------------
const rng = mulberry32(1337);

G.renderer = createRenderer(canvas);
G.scene = createScene(THREE);
G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
G.camera.position.set(60, 60, 60);
G.camera.lookAt(0, 0, 0);
addLights(THREE, G.scene);
addSky(THREE, G.scene);

G.city = generateCity(rng);
const cityBuilt = buildCityMeshes(THREE, G.city);
// buildCityMeshes follows the shared contract buildCityMeshes(THREE, city):
// it either adds meshes to the scene itself or returns the built meshes.
// Handle the return value so the city is visible in either case.
if (cityBuilt) {
  if (typeof cityBuilt.add === 'function' && cityBuilt.isObject3D) {
    G.scene.add(cityBuilt);
  } else if (Array.isArray(cityBuilt)) {
    for (const m of cityBuilt) if (m && m.isObject3D) G.scene.add(m);
  } else if (cityBuilt.children && Array.isArray(cityBuilt.children)) {
    for (const m of cityBuilt.children) if (m && m.isObject3D) G.scene.add(m);
  }
}

G.input = createInput();
G.audio = createAudio();
const hudRefs = bindHUD();

spawnTraffic(G, rng, 14);
spawnPeds(G, rng, 24);

G.player = createPlayer(THREE);
if (G.player) {
  const startX = (PLAYER && (PLAYER.startX ?? PLAYER.x)) || 0;
  const startZ = (PLAYER && (PLAYER.startZ ?? PLAYER.z)) || 0;
  const pos = positionOf(G.player);
  if (pos) { pos.x = startX; pos.z = startZ; if (typeof pos.y === 'number') pos.y = 0; }
  const obj = objectOf(G.player);
  if (obj && !G.scene.children.includes(obj)) G.scene.add(obj);
}

// Two harmless set-dressing props built from the shared mesh factories, so
// the parked car / bystander near the spawn plaza are part of the scene.
try {
  const carColors = (COLORS && (COLORS.cars || COLORS.carColors || COLORS.vehicles)) || [0xffb020, 0xdd3333, 0x3388dd];
  const parked = makeCarMesh(THREE, pick(rng, carColors));
  if (parked) {
    parked.position.set(18, 0, 18);
    parked.rotation.y = rand(rng, 0, Math.PI * 2);
    G.scene.add(parked);
  }
  const pedColors = (COLORS && (COLORS.peds || COLORS.pedColors || COLORS.people)) || [0x33aa66, 0xaa6633, 0x8833aa];
  const bystander = makePedMesh(THREE, pick(rng, pedColors));
  if (bystander) {
    bystander.position.set(-6, 0, 10);
    G.scene.add(bystander);
  }
} catch (err) {
  // Dressing props are optional; the game must still boot without them.
  console.warn('Porto Sol: dressing props skipped', err);
}

// --- Save handling ----------------------------------------------------------
let savedGame = null;
try { savedGame = loadGame(); } catch (err) { savedGame = null; }
const continueBtn = document.getElementById('continue-btn');
if (savedGame && continueBtn) continueBtn.style.display = '';

function applySave(save) {
  if (!save || typeof save !== 'object') return;
  if (typeof save.money === 'number') G.money = save.money;
  if (typeof save.health === 'number') G.health = save.health;
  if (typeof save.score === 'number') G.score = save.score;
  if (typeof save.wanted === 'number') G.wanted = Math.max(0, Math.min(MAX_WANTED, save.wanted));
  const missionIndex = save.missionIndex ?? save.mission?.index ?? save.mission ?? 0;
  if (typeof missionIndex === 'number') G.mission.index = missionIndex;
  if (save.player && typeof save.player.x === 'number' && typeof save.player.z === 'number') {
    const pos = positionOf(G.player);
    if (pos) { pos.x = save.player.x; pos.z = save.player.z; }
  }
}

// --- Game flow --------------------------------------------------------------
function resetRun() {
  G.money = 0;
  G.wanted = 0;
  G.health = START_HEALTH;
  G.score = 0;
  G.time = 0;
  G.tracers.length = 0;
  G.mission = { index: 0, stage: 0, label: '', targetX: 0, targetZ: 0, done: false, reward: 0 };
  try { setWanted(G, 0); } catch (err) { /* police module owns wanted; ignore */ }
  const pos = positionOf(G.player);
  if (pos) { pos.x = (PLAYER && (PLAYER.startX ?? PLAYER.x)) || 0; pos.z = (PLAYER && (PLAYER.startZ ?? PLAYER.z)) || 0; pos.y = 0; }
  const p = G.player;
  if (p) { p.inVehicle = false; p.vehicle = null; p.currentVehicle = null; }
}

function beginPlaying(fromSave) {
  if (!fromSave) resetRun();
  showOverlay(null);
  G.state = 'playing';
  const idx = Math.max(0, Math.min(MISSIONS.length - 1, G.mission.index || 0));
  startMission(G, idx);
  const mission = MISSIONS[idx];
  const greetings = [
    'Mara: "Jax, kita mulai. Jangan buat keributan dulu."',
    'Porto Sol menunggumu, Jax. Ikuti penanda misi.',
    'Mara: "Satu pekerjaan terakhir. Lima langkah. Jalan."',
  ];
  showMessage(mission ? `${mission.label || mission.name || 'Misi ' + (idx + 1)} — ${mission.text || mission.description || ''}`.trim() : pick(rng, greetings), 5);
}

function pauseGame() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  showOverlay('pause');
}

function resumeGame() {
  if (G.state !== 'paused') return;
  G.state = 'playing';
  showOverlay(null);
}

function endGame(won) {
  if (won) {
    G.state = 'won';
    const winText = document.getElementById('win-text');
    if (winText) winText.textContent = `Lima misi selesai. Skor ${G.score} — uang $${G.money}. Jax dan Mara lolos dengan uangnya, untuk kali ini.`;
    showOverlay('win');
  } else {
    G.state = 'gameover';
    const overText = document.getElementById('gameover-text');
    if (overText) overText.textContent = `Jax tumbang di jalanan Porto Sol. Skor ${G.score} — uang $${G.money}.`;
    showOverlay('gameover');
  }
  try { clearSave(); } catch (err) { /* save already gone; ignore */ }
}

function restartGame() {
  try { clearSave(); } catch (err) { /* ignore */ }
  beginPlaying(false);
}

// Buttons.
const startBtn = document.getElementById('start-btn');
if (startBtn) startBtn.addEventListener('click', () => beginPlaying(false));
if (continueBtn) continueBtn.addEventListener('click', () => { applySave(savedGame); beginPlaying(true); });
const resumeBtn = document.getElementById('resume-btn');
if (resumeBtn) resumeBtn.addEventListener('click', resumeGame);
const restartBtn = document.getElementById('restart-btn');
if (restartBtn) restartBtn.addEventListener('click', restartGame);
const retryBtn = document.getElementById('retry-btn');
if (retryBtn) retryBtn.addEventListener('click', restartGame);
const playAgainBtn = document.getElementById('playagain-btn');
if (playAgainBtn) playAgainBtn.addEventListener('click', restartGame);

// Mouse click = shoot.
canvas.addEventListener('mousedown', () => {
  if (G.state === 'playing') shoot(G);
});

// --- Camera -----------------------------------------------------------------
const _facing = new THREE.Vector3();
const _target = new THREE.Vector3();
const _desired = new THREE.Vector3();

function updateCamera(dt, elapsed) {
  if (G.state === 'menu') {
    const angle = elapsed * 0.08;
    const radius = HALF * 0.9;
    _desired.set(Math.cos(angle) * radius, 55 + Math.sin(elapsed * 0.15) * 6, Math.sin(angle) * radius);
    G.camera.position.lerp(_desired, Math.min(1, dt * 2));
    G.camera.lookAt(0, 0, 0);
    return;
  }
  const driving = isDriving();
  const focusEntity = driving ? (currentVehicle() || G.player) : G.player;
  const pos = positionOf(focusEntity);
  if (!pos) return;
  facingOf(focusEntity, _facing);
  _facing.y = 0;
  if (_facing.lengthSq() < 0.0001) _facing.set(0, 0, 1);
  _facing.normalize();
  const dist = driving ? 13 : 8.5;
  const height = driving ? 5 : 3.6;
  _target.set(pos.x, (pos.y || 0) + 1.4, pos.z);
  _desired.copy(_target).addScaledVector(_facing, -dist);
  _desired.y = (pos.y || 0) + height;
  // Keep the camera inside the city bounds so it never flies past the edge.
  _desired.x = Math.max(-HALF - 20, Math.min(HALF + 20, _desired.x));
  _desired.z = Math.max(-HALF - 20, Math.min(HALF + 20, _desired.z));
  const snap = G.state !== 'playing';
  G.camera.position.lerp(_desired, snap ? 1 : Math.min(1, dt * 6));
  G.camera.lookAt(_target);
}

// --- Input edge detection ---------------------------------------------------
const prevDown = {};
function pressed(code) {
  const down = isDown(G.input, code);
  const was = !!prevDown[code];
  prevDown[code] = down;
  return down && !was;
}

function toggleMute() {
  const a = G.audio;
  if (!a) return;
  if (typeof a.toggleMute === 'function') { a.toggleMute(); return; }
  if (typeof a.setMuted === 'function') { a.setMuted(!a.muted); return; }
  if (typeof a.muted === 'boolean') a.muted = !a.muted;
}

function tryEnterExitVehicle() {
  const p = G.player;
  if (!p) return;
  if (isDriving()) {
    exitVehicle(G);
    showMessage('Jax keluar dari mobil.', 2);
    return;
  }
  const pos = positionOf(p);
  if (!pos) return;
  const v = nearestVehicle(G, pos.x, pos.z, 6);
  if (v) {
    enterVehicle(G, v);
    showMessage('Jax masuk ke mobil. WASD untuk mengemudi.', 3);
  } else {
    showMessage('Tidak ada mobil di dekatmu.', 2);
  }
}

// --- Shot mode (?shot=...) --------------------------------------------------
let shotApplied = false;
try {
  const name = shotName();
  if (name) {
    G.shotMode = name;
    applyShot(G, name);
    shotApplied = true;
  }
} catch (err) {
  console.warn('Porto Sol: shot mode unavailable', err);
}

// --- Resize -----------------------------------------------------------------
window.addEventListener('resize', () => {
  G.camera.aspect = window.innerWidth / window.innerHeight;
  G.camera.updateProjectionMatrix();
  if (G.renderer) G.renderer.setSize(window.innerWidth, window.innerHeight);
});
if (G.renderer && typeof G.renderer.setSize === 'function') {
  G.renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Main loop --------------------------------------------------------------
let lastNow = performance.now();
let saveTimer = 0;
let lastPolice = 0;
const _tmpTarget = { x: 0, z: 0 };

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - lastNow) / 1000;
  lastNow = now;
  const dt = Math.max(0, Math.min(rawDt, 0.05));
  const elapsed = now / 1000;

  // Keys that work in every state.
  if (pressed('KeyM')) toggleMute();
  if (pressed('KeyR') && G.state !== 'menu') restartGame();

  if (G.state === 'playing') {
    G.time += dt;

    if (pressed('KeyE')) tryEnterExitVehicle();
    if (pressed('KeyF')) shoot(G);
    if (pressed('KeyP') || pressed('Escape')) pauseGame();

    updatePlayer(G, dt);
    updateVehicles(G, dt);
    updatePeds(G, dt);
    updatePolice(G, dt);
    updateMission(G, dt);
    updateCombat(G, dt);

    // Keep the mission target in sync with missions.js (it owns the target).
    try {
      const t = missionTarget(G);
      if (t) {
        const tx = t.x ?? t.targetX ?? t[0];
        const tz = t.z ?? t.targetZ ?? t[1];
        if (typeof tx === 'number') G.mission.targetX = tx;
        if (typeof tz === 'number') G.mission.targetZ = tz;
        if (typeof t.x === 'number' && typeof t.z === 'number') { _tmpTarget.x = t.x; _tmpTarget.z = t.z; }
      }
    } catch (err) { /* mission target is advisory; ignore */ }

    // Police pressure changes are worth a short message.
    try {
      const n = policeCount(G);
      if (typeof n === 'number' && n !== lastPolice) {
        if (n > lastPolice && n > 0) showMessage(`Polisi mengejarmu! ${n} mobil patroli di belakangmu.`, 3);
        lastPolice = n;
      }
    } catch (err) { /* ignore */ }

    // Engine audio follows speed when the audio module provides it.
    if (G.audio && typeof G.audio.engine === 'function') {
      try { G.audio.engine(playerSpeed(), isDriving()); } catch (err) { /* ignore */ }
    }

    // Autosave every 15 seconds.
    saveTimer += dt;
    if (saveTimer >= 15) {
      saveTimer = 0;
      try { saveGame(G); } catch (err) { /* save is best-effort */ }
    }

    // Message expiry.
    if (G.messageText && G.time > G.messageUntil) {
      G.messageText = '';
      if (messageEl) messageEl.textContent = '';
    }

    // Win: all five missions done. missions.js may already have set 'won'.
    const totalMissions = MISSIONS.length || 5;
    if (G.mission.index >= totalMissions || (G.mission.done && G.mission.index >= totalMissions - 1)) {
      endGame(true);
    } else if (G.health <= 0) {
      // Game over: health reached zero.
      G.health = 0;
      endGame(false);
    }
  } else if (G.state === 'paused') {
    if (pressed('KeyP') || pressed('Escape')) resumeGame();
  } else if (G.state === 'gameover' || G.state === 'won') {
    // Frozen frame behind the overlay; R already restarts above.
  }

  // HUD + minimap (cheap enough every frame; hud.js owns the layout).
  try { updateHUD(G, hudRefs); } catch (err) { /* HUD is best-effort */ }
  try {
    if (minimapCanvas && (G.state === 'playing' || G.state === 'paused')) drawMinimap(G, minimapCanvas);
  } catch (err) { /* minimap is best-effort */ }

  // The speed readout is also mirrored here in case hud.js leaves it alone.
  const speedEl = document.getElementById('speed');
  if (speedEl && G.state === 'playing') {
    speedEl.textContent = String(Math.round(playerSpeed() * 3.6));
  }

  updateCamera(dt, elapsed);

  if (G.renderer && G.scene && G.camera) {
    G.renderer.render(G.scene, G.camera);
  }
}

// Shot mode: apply the shot, render one frame immediately, play without menu.
if (shotApplied) {
  G.state = 'playing';
  showOverlay(null);
  if (G.mission.index === 0 && !G.mission.label) {
    try { startMission(G, 0); } catch (err) { /* mission already started by the shot */ }
  }
  updateCamera(0.05, 0);
  if (G.renderer && G.scene && G.camera) G.renderer.render(G.scene, G.camera);
}

requestAnimationFrame(frame);

// Keep hurtPlayer / spawnPoliceCar referenced for the combat & police flows:
// updateCombat calls hurtPlayer internally and updatePolice spawns patrol cars
// via spawnPoliceCar; they are imported here so the wiring stays explicit.
void hurtPlayer;
void spawnPoliceCar;
void randInt;
