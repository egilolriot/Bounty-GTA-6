// Porto Sol — shared world configuration (Round 2 rebuild, written from scratch).
// No imports: pure data + constants shared by every other module.
// Coordinate system: x east, z south, y up. City is 720x720 m centred on
// the origin (x, z in -360..360). Roads form a grid every 90 m. Y = 0 is ground.

export const WORLD = {
  SIZE: 720,
  HALF: 360,
  ROAD: 90,
  BLOCK: 90,
};

export const COLORS = {
  sky: 0x87b5d6,
  road: 0x2e2e33,
  sidewalk: 0x8a8a86,
  building: [
    0xc9a06a,
    0x7a9cc6,
    0xb5654d,
    0x8fa98f,
    0xd6c9a8,
    0x6e7f9e,
  ],
  grass: 0x4a7c3a,
  sand: 0xd9c28a,
  sea: 0x2a6f8f,
  lamp: 0xffd27a,
};

export const MISSIONS = [
  {
    name: 'First Wheels',
    brief: 'Curi mobil, lalu antar ke garasi Mara.',
    reward: 500,
    type: 'goto',
    target: { x: 120, z: 80 },
  },
  {
    name: 'Harbor Lights',
    brief: 'Ambil paket di pelabuhan, lalu antar ke dermaga utara.',
    reward: 800,
    type: 'deliver',
    target: { x: -200, z: -260 },
  },
  {
    name: 'Street Heat',
    brief: 'Kabur dari kejaran polisi saat wanted level 2.',
    reward: 1200,
    type: 'evade',
    target: { x: 0, z: 0 },
  },
  {
    name: 'The Exchange',
    brief: 'Antar koper ke titik tukar selagi dikejar polisi.',
    reward: 2500,
    type: 'deliver',
    target: { x: 260, z: -140 },
  },
  {
    name: 'Sunset Run',
    brief: 'Capai mercusuar dengan wanted level 3, lalu lolos.',
    reward: 5000,
    type: 'escape',
    target: { x: -320, z: 320 },
  },
];

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  driveAccel: 22,
  brake: 30,
  maxHealth: 100,
  maxSpeed: 42,
};

export const WANTED = {
  max: 5,
};
