// Porto Sol — entry point: wires the modules, runs the fixed-timestep loop,
// and owns the menu/play/pause/gameover/complete state machine.
import * as THREE from 'three';
import { CFG } from './config.js';
import { mulberry32 } from './random.js';
import { Input } from './input.js';
import { createRenderer, createScene, createCamera, setupLights, updateCamera } from './render.js';
import { buildCity } from './city.js';
import { createPlayer, updatePlayer, enterCar, exitCar } from './player.js';
import { spawnTraffic, updateTraffic, updatePlayerCar, nearestCar } from './vehicles.js';
import { spawnPedestrians, updatePedestrians } from './pedestrians.js';
import { setWanted, addHeat, updatePolice } from './police.js';
import { MISSIONS, startMission, updateMissions, missionTitle } from './missions.js';
import { shoot, reloadWeapon, updateCombat, damagePlayer } from './combat.js';
import { initHud, updateHud, showMessage, showScreen } from './hud.js';
import { AudioEngine } from './audio.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { applyShotPreset } from './shots.js';

const $ = (id) => document.getElementById(id);
const STEP = 1 / 60;

async function init() {
  const q = new URLSearchParams(location.search);
  const seed = parseInt(q.get('seed') || '', 10) || CFG.seed;
  const shot = q.get('shot');
  const renderer = createRenderer($('game'));
  const scene = createScene();
  const camera = createCamera();
  setupLights(scene);
  const city = buildCity(scene, mulberry32(seed));
  const G = {
    scene, camera, renderer, clock: new THREE.Clock(), input: new Input($('game')),
    audio: null, time: CFG.dayStart, mode: 'menu', seed, muted: false,
    player: {
      group: null, pos: null, heading: Math.PI, speed: 0, onFoot: true,
      health: 100, maxHealth: 100, cash: 0, weapon: 1, ammo: 12, inCar: null,
    },
    cars: [], peds: [], police: [], wanted: 0, wantedHeat: 0, wantedTimer: 0,
    mission: { index: -1, stage: 0, objective: '', target: null, timer: 0 },
    stats: { missionsDone: 0, carsStolen: 0, copsEvaded: 0, distanceDriven: 0, cashEarned: 0 },
    city,
  };
  window.__game = G;
  const pl = G.player;

  G.audio = new AudioEngine();
  G.audio.bind(G);

  function show(n) {
    showScreen(G, n === 'play' || n === 'mission-complete' ? 'none'
      : n === 'pause' ? 'pause'
      : n === 'busted' || n === 'wasted' ? 'gameover' : n);
  }
  G.showScreen = (g, n) => show(n);
  G.showMessage = (g, t, ms) => showMessage(g || G, t, ms);
  G.damagePlayer = (amt, from) => damagePlayer(G, amt, from); // single damage path for police touch / officer shots
  G.saveGame = (g) => saveGame(g || G);
  G.setWanted = (l) => setWanted(G, l);
  G.missionTitle = missionTitle;

  // Player avatar: createPlayer returns the THREE.Group; its position is the
  // player position. Accept an object with a .group field too, defensively.
  const created = createPlayer(scene);
  if (created && created.group) { pl.group = created.group; pl.pos = created.group.position; }
  else { pl.group = created; pl.pos = created.position; }
  const sp = city.spawnPoints.player;
  pl.pos.set(sp.x, 0, sp.z);
  pl.heading = sp.heading;
  pl.group.rotation.y = sp.heading;

  spawnTraffic(G);
  spawnPedestrians(G);

  let done = 0;
  function startGame(fromSave) {
    const s = fromSave ? loadGame() : null;
    pl.health = s?.health ?? 100;
    pl.cash = s?.cash ?? 0;
    G.wanted = 0; G.wantedHeat = 0; G.wantedTimer = 0;
    G.stats = { missionsDone: s?.missionsDone ?? 0, carsStolen: 0, copsEvaded: 0, distanceDriven: 0, cashEarned: 0 };
    G.mission = { index: -1, stage: 0, objective: '', target: null, timer: 0 };
    G.time = s?.time ?? CFG.dayStart;
    done = G.stats.missionsDone;
    if (pl.inCar) exitCar(G);
    pl.pos.set(s?.pos?.x ?? sp.x, 0, s?.pos?.z ?? sp.z);
    pl.heading = s?.pos?.heading ?? sp.heading;
    pl.group.rotation.y = pl.heading;
    show('play');
    G.audio.resume?.();
    G.audio.music?.(true);
    startMission(G, fromSave ? Math.min(G.stats.missionsDone, MISSIONS.length - 1) : 0);
    showMessage(G, s ? 'Welcome back, Jax.' : 'Mara has a job for you.');
  }
  function pauseGame() { if (G.mode !== 'play') return; show('pause'); saveGame(G); }
  function resumeGame() { if (G.mode !== 'pause') return; show('play'); G.audio.music?.(true); }
  function toMenu() { show('menu'); }
  G.startGame = () => startGame(false);
  G.continueGame = () => startGame(true);
  G.resumeGame = resumeGame;
  G.restartGame = () => startGame(false);
  G.quitToMenu = toMenu;

  initHud(G);
  show('menu');
  $('save-info').textContent = hasSave() ? 'Save found — Continue resumes it.' : 'No saved game yet.';
  $('btn-continue').style.display = hasSave() ? '' : 'none';

  const AMMO_DEFAULT = { 1: 12, 2: 30, 3: 6 };
  const WEAPON_NAMES = ['', 'Pistol', 'SMG', 'Shotgun'];

  function handleInput() {
    const inp = G.input;
    if (inp.anyPressed(CFG.keys.pause)) {
      if (G.mode === 'play') pauseGame();
      else if (G.mode === 'pause') resumeGame();
      return;
    }
    if (G.mode !== 'play') return;
    if (inp.anyPressed(CFG.keys.missions)) {
      $('mission-title').textContent = missionTitle(G);
      $('mission-desc').textContent = G.mission.objective || 'No active job. Free roam Porto Sol.';
      show('mission');
      G.mode = 'pause';
      return;
    }
    // E: enter a stopped car / exit the car. F: steal any nearby car (adds heat).
    if (inp.anyPressed(CFG.keys.interact)) {
      if (pl.inCar) exitCar(G);
      else {
        const car = nearestCar(G, pl.pos, 4.5);
        if (car) {
          if (car.parked || Math.abs(car.speed || 0) < 0.5) {
            enterCar(G, car);
            showMessage(G, 'In the ' + (car.kind || 'car') + ' — drive!');
          } else showMessage(G, 'That car is moving — press F to steal it.', 3000);
        }
      }
    }
    if (inp.anyPressed(CFG.keys.steal) && pl.onFoot) {
      const car = nearestCar(G, pl.pos, 4.5);
      if (car) {
        enterCar(G, car);
        addHeat(G, CFG.wanted.heatPerSteal);
        G.stats.carsStolen = (G.stats.carsStolen || 0) + 1;
        showMessage(G, 'Car stolen — the cops noticed!', 3000);
      }
    }
    if (inp.anyPressed(CFG.keys.reload)) reloadWeapon(G);
    if (inp.anyPressed(CFG.keys.horn) && G.audio && G.audio.horn) G.audio.horn();
    if (inp.anyPressed(CFG.keys.camera)) G.camFar = !G.camFar; // render.js reads G.camFar for far/near chase camera
    // 1/2/3 switch weapons; ammo is remembered per weapon.
    if (inp.pressed('Digit1') || inp.pressed('Digit2') || inp.pressed('Digit3')) {
      const w = inp.pressed('Digit1') ? 1 : inp.pressed('Digit2') ? 2 : 3;
      if (pl.weapon !== w) {
        G._ammoByWeapon = G._ammoByWeapon || {};
        G._ammoByWeapon[pl.weapon] = pl.ammo;
        pl.weapon = w;
        pl.ammo = G._ammoByWeapon[w] ?? AMMO_DEFAULT[w];
        showMessage(G, WEAPON_NAMES[w] + ' ready.');
      }
    }
    if (inp.mousePressed(0) && pl.onFoot) shoot(G);
  }

  function step(dt) {
    G.time += dt / 300;
    if (pl.inCar) updatePlayerCar(G, dt); else updatePlayer(G, dt);
    updateTraffic(G, dt);
    updatePedestrians(G, dt);
    updatePolice(G, dt);
    updateMissions(G, dt);
    updateCombat(G, dt);
    G.audio.update?.(dt);
    if (G.stats.missionsDone !== done) {
      done = G.stats.missionsDone;
      if (done > 0 && done < MISSIONS.length && G.mission.index < 0) startMission(G, done);
    }
    if (G.mode === 'complete' || G.mode === 'gameover') return;
    if (pl.health <= 0) { show('gameover'); return; }
    if (G.mode !== 'play') G.mode = 'play';
    if (G.stats.missionsDone >= MISSIONS.length) { show('complete'); clearSave(); }
  }

  let acc = 0, last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (G.mode === 'playing') G.mode = 'play'; // hud writes 'playing' for 'none'
    handleInput();
    if (G.mode === 'play') {
      acc += delta;
      let n = 0;
      while (acc >= STEP && n < 5) {
        step(STEP);
        acc -= STEP; n++;
        if (G.mode !== 'play') { acc = 0; break; }
      }
      updateCamera(G, delta);
      updateHud(G, delta);
    }
    renderer.render(scene, camera);
    G.input.update();
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  $('loading').hidden = true;
  if (shot) { startGame(false); applyShotPreset(G, shot); }
  requestAnimationFrame(frame);
}

init().catch((e) => {
  console.error(e);
  $('loading').textContent = 'Failed to load Porto Sol: ' + e.message;
});
