// Porto Sol — procedural deterministic city.
// The whole city is derived from one seeded RNG, so every load builds
// the exact same streets, buildings and props. The single source of truth
// for a building's footprint is city._buildings (centre x/z plus w/d):
// the 3D mesh, the minimap rect and the collision test all read it.
import * as THREE from 'three';
import { CFG } from './config.js';
import { range, pick, randInt } from './random.js';

// Grid derived from CFG: 9 roads each way, 80 m pitch, 16 m wide.
const PITCH = CFG.grid.block + CFG.grid.road; // 80
const HALF = (CFG.grid.blocks - 1) / 2 * PITCH; // 360
const ROAD_HALF = CFG.grid.road / 2; // 8
const WATER_Z = 360; // marina / sea starts north of the last road
const BOUNDS = { x0: -HALF, z0: -HALF, x1: HALF, z1: WATER_Z + 44 };

// Road centre lines, west->east and south->north.
const LINES = [];
for (let i = 0; i < CFG.grid.blocks; i++) LINES.push(-HALF + i * PITCH);

// --- street names -------------------------------------------------------
// Avenues run north-south (constant x), streets run east-west (constant z).
const AVENUES = [
  'Av. del Puerto', 'Av. de las Palmas', 'Av. del Faro', 'Av. de la Marina',
  'Av. del Sol', 'Av. del Comercio', 'Av. de los Naranjos', 'Av. del Castillo',
  'Av. de la Playa',
];
const STREETS = [
  'Calle del Mar', 'Calle Luna', 'Calle Verde', 'Calle Rosa', 'Calle Mayor',
  'Calle del Olivo', 'Calle Arena', 'Calle Brisa', 'Calle Coral',
];

function nearestLineIndex(v) {
  return Math.max(0, Math.min(CFG.grid.blocks - 1, Math.round((v + HALF) / PITCH)));
}

function getStreetName(x, z) {
  return `${AVENUES[nearestLineIndex(x)]} & ${STREETS[nearestLineIndex(z)]}`;
}

// --- canvas textures ----------------------------------------------------
// Facades: warm plaster with a grid of lit/unlit windows. Four palettes
// are drawn once; each building clones one and sets its own repeat so
// windows stay roughly the same size whatever the building height.
const FACADE_COLORS = [0xd8a06a, 0xc98d7a, 0xe0c090, 0xb98a8a, 0x9fb4c8, 0xd0b090];

function makeFacadeTexture(baseColor, litRatio, rng) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
  g.fillRect(0, 0, 128, 256);
  // Slight vertical shading so the top reads sunlit, the base in shade.
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,235,200,0.25)');
  grad.addColorStop(1, 'rgba(60,30,10,0.25)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  // Window grid: 4 columns x 8 rows.
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : '#2c3542';
      g.fillRect(12 + col * 28, 14 + row * 30, 18, 20);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(12 + col * 28, 14 + row * 30, 18, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#' + CFG.colors.road.toString(16).padStart(6, '0');
  g.fillRect(0, 0, 64, 128);
  // Edge lines.
  g.fillStyle = '#d8d0c0';
  g.fillRect(3, 0, 2, 128);
  g.fillRect(59, 0, 2, 128);
  // Dashed centre line.
  g.fillStyle = '#f5e9a0';
  for (let y = 0; y < 128; y += 32) g.fillRect(30, y, 4, 18);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBillboardTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#ff9a4d');
  grad.addColorStop(1, '#c94b6d');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#fff3d6';
  g.font = 'bold 84px sans-serif';
  g.textAlign = 'center';
  g.fillText('PORTO SOL', 256, 110);
  g.font = 'bold 34px sans-serif';
  g.fillText('KOTA MATAHARI TERBENAM', 256, 175);
  g.font = '28px sans-serif';
  g.fillText('★ 5 MISI ★ $500 – $5.000 ★', 256, 220);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- collision / road helpers (standalone, also attached to city) --------
export function collidesWithBuildings(city, x, z, r) {
  for (const b of city._buildings) {
    if (Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r) return true;
  }
  return false;
}

function distToNearestLine(v) {
  const t = (v + HALF) / PITCH;
  return Math.abs(t - Math.round(t)) * PITCH;
}

export function isOnRoad(x, z) {
  if (x < -HALF || x > HALF || z < -HALF || z > HALF) return false;
  return distToNearestLine(x) <= ROAD_HALF || distToNearestLine(z) <= ROAD_HALF;
}

export function isWater(x, z) {
  return z > WATER_Z && z <= BOUNDS.z1;
}

export function randomRoadPoint(city, rng) {
  const vertical = rng() < 0.5;
  const line = pick(rng, LINES);
  const along = range(rng, -HALF + 10, HALF - 10);
  const across = range(rng, -ROAD_HALF + 3, ROAD_HALF - 3);
  return vertical ? { x: line + across, z: along } : { x: along, z: line + across };
}

// --- city builder -------------------------------------------------------
export function buildCity(scene, rng) {
  const city = {
    bounds: { ...BOUNDS },
    minimap: { roads: [], buildings: [] },
    spawnPoints: { player: { x: 0, z: 34, heading: Math.PI }, cars: [], peds: [] },
    spots: {
      garage: { x: 40, z: 40 },
      marina: { x: -40, z: 280 },
      hotel: { x: 120, z: -40 },
      bank: { x: -120, z: 40 },
      harbor: { x: -120, z: 280 },
    },
    streetNames: { avenues: [...AVENUES], streets: [...STREETS] },
    _buildings: [],
  };
  city.getStreetName = (x, z) => getStreetName(x, z);
  city.randomRoadPoint = (r) => randomRoadPoint(city, r);
  city.collidesWithBuildings = (x, z, r) => collidesWithBuildings(city, x, z, r);
  city.isOnRoad = (x, z) => isOnRoad(x, z);
  city.isWater = (x, z) => isWater(x, z);

  const groundMat = new THREE.MeshLambertMaterial({ color: CFG.colors.ground });
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: CFG.colors.sidewalk });
  const roadTex = makeRoadTexture();
  const facadeTexs = FACADE_COLORS.map((c) => makeFacadeTexture(c, 0.45, rng));

  // Ground: one big sandy slab, land plus the beach strip under the sea.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 40, HALF * 2 + 44 + 40),
    groundMat,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, (WATER_Z + 44 - HALF) / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // Sea: flat plane north of the last road, slightly above the ground.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 40, 44),
    new THREE.MeshLambertMaterial({ color: CFG.colors.water }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.06, WATER_Z + 22);
  scene.add(water);

  // Roads + sidewalks. Sidewalk is a wider, paler strip under each road
  // so its border shows; the road texture (dashes) sits on top of it.
  for (const line of LINES) {
    for (const vertical of [true, false]) {
      const len = HALF * 2;
      const side = new THREE.Mesh(
        new THREE.PlaneGeometry(vertical ? CFG.grid.road + 8 : len, vertical ? len : CFG.grid.road + 8),
        sidewalkMat,
      );
      side.rotation.x = -Math.PI / 2;
      side.position.set(vertical ? line : 0, 0.02, vertical ? 0 : line);
      side.receiveShadow = true;
      scene.add(side);

      const tex = roadTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, len / 16);
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(CFG.grid.road, len),
        new THREE.MeshLambertMaterial({ map: tex }),
      );
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = vertical ? 0 : Math.PI / 2;
      road.position.set(vertical ? line : 0, 0.04, vertical ? 0 : line);
      road.receiveShadow = true;
      scene.add(road);

      city.minimap.roads.push(vertical
        ? { x: line - ROAD_HALF, z: -HALF, w: CFG.grid.road, h: len }
        : { x: -HALF, z: line - ROAD_HALF, w: len, h: CFG.grid.road });
    }
  }

  // Buildings, one block at a time. Block centres sit halfway between
  // road lines; each block interior is 64 m wide. The (0,0) block is the
  // central plaza, so it stays open. Buildings never cover a mission spot.
  const spotList = Object.values(city.spots);
  const addBuilding = (bx, bz, w, d) => {
    for (const s of spotList) {
      if (Math.abs(s.x - bx) < w / 2 + 14 && Math.abs(s.z - bz) < d / 2 + 14) return;
    }
    const distC = Math.hypot(bx, bz);
    const h = range(rng, 9, 17) + (1 - distC / 520) * range(rng, 8, 22);
    const tex = pick(rng, facadeTexs).clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(w, d) / 14, h / 14);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(bx, h / 2, bz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    // Flat darker roof cap so rooftops read from above.
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 0.4, d + 0.6),
      new THREE.MeshLambertMaterial({ color: 0x4a4038 }),
    );
    roof.position.set(bx, h + 0.2, bz);
    scene.add(roof);

    city._buildings.push({ x: bx, z: bz, w, d });
    city.minimap.buildings.push({ x: bx - w / 2, z: bz - d / 2, w, h: d });
  };

  for (let ix = 0; ix < CFG.grid.blocks; ix++) {
    for (let iz = 0; iz < CFG.grid.blocks; iz++) {
      const bx = -HALF + PITCH / 2 + ix * PITCH;
      const bz = -HALF + PITCH / 2 + iz * PITCH;
      if (bx === 0 && bz === 0) continue; // central plaza
      if (rng() < 0.45) {
        // One big building filling most of the block.
        addBuilding(bx, bz, range(rng, 40, 54), range(rng, 40, 54));
      } else {
        // Two buildings side by side, split along the longer axis.
        const horizontal = rng() < 0.5;
        const w1 = range(rng, 20, 28);
        const gap = 4;
        if (horizontal) {
          addBuilding(bx - (w1 + gap) / 2, bz, w1, range(rng, 38, 52));
          addBuilding(bx + (w1 + gap) / 2, bz, range(rng, 20, 28), range(rng, 38, 52));
        } else {
          addBuilding(bx, bz - (w1 + gap) / 2, range(rng, 38, 52), w1);
          addBuilding(bx, bz + (w1 + gap) / 2, range(rng, 38, 52), range(rng, 20, 28));
        }
      }
    }
  }

  // Central plaza: paved disc + fountain at the (0,0) block.
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(30, 30, 0.3, 28),
    new THREE.MeshLambertMaterial({ color: 0xcfc0a0 }),
  );
  plaza.position.set(0, 0.15, 0);
  plaza.receiveShadow = true;
  scene.add(plaza);
  const fountainBase = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 7, 1.2, 20),
    new THREE.MeshLambertMaterial({ color: 0x9a938a }),
  );
  fountainBase.position.set(0, 0.6, 0);
  fountainBase.castShadow = true;
  scene.add(fountainBase);
  const fountainWater = new THREE.Mesh(
    new THREE.CylinderGeometry(5.2, 5.2, 0.3, 20),
    new THREE.MeshLambertMaterial({ color: CFG.colors.water }),
  );
  fountainWater.position.set(0, 1.1, 0);
  scene.add(fountainWater);

  // Palm trees along the sidewalks: trunk + flattened crown.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 6, 6);
  const crownGeo = new THREE.IcosahedronGeometry(2.2, 0);
  for (const line of LINES) {
    for (let s = -HALF + 20; s < HALF; s += 40) {
      if (rng() < 0.45) continue;
      const vertical = rng() < 0.5;
      const side = rng() < 0.5 ? -1 : 1;
      const px = vertical ? line + side * (ROAD_HALF + 4) : s + range(rng, -6, 6);
      const pz = vertical ? s + range(rng, -6, 6) : line + side * (ROAD_HALF + 4);
      if (Math.abs(px) < 34 && Math.abs(pz) < 34) continue; // keep plaza clear
      if (pz > WATER_Z - 4) continue;
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(px, 3, pz);
      trunk.castShadow = true;
      scene.add(trunk);
      const crown = new THREE.Mesh(crownGeo, crownMat);
      crown.scale.set(1.4, 0.55, 1.4);
      crown.position.set(px, 6.6, pz);
      crown.castShadow = true;
      scene.add(crown);
    }
  }

  // Billboard by the Av. del Sol / Calle Mayor junction, facing traffic.
  const boardTex = makeBillboardTexture();
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 12),
    new THREE.MeshLambertMaterial({ map: boardTex }),
  );
  board.position.set(88, 11, 88);
  board.rotation.y = -Math.PI / 4;
  scene.add(board);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x555550 });
  for (const dx of [-8, 8]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 8, 6), poleMat);
    pole.position.set(88 + dx * 0.7, 4, 88 - dx * 0.7);
    scene.add(pole);
  }

  // Marina pier: wooden walkway reaching into the sea at the marina spot.
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.6, 36),
    new THREE.MeshLambertMaterial({ color: 0x8a6a44 }),
  );
  pier.position.set(-40, 0.5, WATER_Z + 18);
  pier.castShadow = true;
  scene.add(pier);

  // Spawn points: cars and pedestrians on roads / sidewalks.
  for (let i = 0; i < 12; i++) {
    const p = randomRoadPoint(city, rng);
    city.spawnPoints.cars.push([p.x, p.z]);
  }
  for (let i = 0; i < 16; i++) {
    const p = randomRoadPoint(city, rng);
    const side = rng() < 0.5 ? -1 : 1;
    const vertical = rng() < 0.5;
    city.spawnPoints.peds.push(vertical
      ? [p.x + side * (ROAD_HALF + 4), p.z]
      : [p.x, p.z + side * (ROAD_HALF + 4)]);
  }

  return city;
}
