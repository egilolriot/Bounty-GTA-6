// Porto Sol — central tuning table.
// One place for every magic number so gameplay, city, police and camera
// all read the same values. Nothing here is read at import time by the
// DOM; it is pure data.
export const CFG = {
  // World generation seed. Same seed => same city, every load.
  seed: 1337,

  // Street grid: 9 blocks of 64 m with 16 m roads between them.
  // Pitch 80 m, so the drivable grid spans -360 .. 360 on both axes.
  grid: { blocks: 9, block: 64, road: 16 },

  // On-foot movement. accel is how fast velocity chases the target speed.
  player: {
    walkSpeed: 6, sprintSpeed: 10.5, jumpSpeed: 8.5,
    gravity: 24, health: 100, accel: 40,
  },

  // Driving model: arcade, grippy, with a handbrake for slides.
  car: {
    accel: 24, brake: 34, maxSpeed: 44, reverseSpeed: 13,
    turn: 2.1, handbrake: 46, grip: 8,
  },

  // How many vehicles / pedestrians the world keeps alive.
  vehicles: { trafficMax: 14, parkedMax: 6 },
  pedestrians: { max: 26 },

  // Ambient traffic and walkers.
  traffic: { count: 14, speed: 9, spacing: 26 },
  peds: { count: 26, speed: 1.7 },

  // Police pursuit.
  police: { chaseSpeed: 38, spawnDist: 55, maxCars: 5 },

  // Wanted level 0..5. Heat decays slowly; crimes add heat.
  wanted: {
    max: 5, decay: 0.015,
    heatPerSteal: 25, heatPerShot: 5, heatPerHit: 10,
  },

  // Third-person chase camera. farDist is the in-car distance.
  camera: { nearDist: 7.5, farDist: 13, height: 3.4, lerp: 7, orbit: 0.9 },

  // Keyboard layout. Each action lists every accepted KeyboardEvent.code.
  keys: {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    sprint: ['ShiftLeft', 'ShiftRight'],
    jump: ['Space'],
    interact: ['KeyE'],
    steal: ['KeyF'],
    reload: ['KeyR'],
    missions: ['KeyM'],
    pause: ['KeyP', 'Escape'],
    horn: ['KeyH'],
    camera: ['KeyC'],
  },

  // Golden-hour palette: warm sunset sky over dusty streets.
  colors: {
    sky: 0xffc98a, fog: 0xf2b98a, sun: 0xffc37a,
    hemiSky: 0x9fc8e8, hemiGround: 0x8a6a4a,
    road: 0x3a3f46, sidewalk: 0xb9a98c, ground: 0xcbb58a, water: 0x2e7f9e,
  },

  // Mission payouts in $, mission index 0..4.
  rewards: [500, 800, 1200, 2500, 5000],

  // Weapon slots: index 0 is bare fists, keys 1/2/3 select the rest.
  weapons: ['fists', 'pistol', 'smg', 'shotgun'],

  // Mix levels (0..1).
  audio: { music: 0.22, sfx: 0.5, siren: 0.28, engine: 0.2 },

  // Time of day at spawn, in hours: 17.5 = 17:30, late afternoon.
  dayStart: 17.5,
};
