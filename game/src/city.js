// Porto Sol — procedural city generation + mesh building (Round 2 rebuild).
// City: 720x720 m centred on origin, road grid every 90 m, Y = 0 is ground.
// West side (x < -300) is beach + sea, harbour in the north,
// lighthouse at (-320, 320) in the south-west corner.

import * as THREE from 'three';
import { WORLD, COLORS } from './config.js';
import { rand, randInt, pick } from './random.js';

const ROAD_WIDTH = 12;

function gridLines() {
  const lines = [];
  for (let v = -WORLD.HALF; v <= WORLD.HALF; v += WORLD.ROAD) lines.push(v);
  return lines;
}

function nearRoad(x, z, margin) {
  // True when (x, z) sits on (or close to) a road centreline.
  const lines = gridLines();
  for (const v of lines) {
    if (Math.abs(x - v) < margin) return true;
    if (Math.abs(z - v) < margin) return true;
  }
  return false;
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function generateCity(rng) {
  const lines = gridLines();

  // ---- Roads: one segment per grid line, vertical + horizontal. ----
  const roads = [];
  for (const v of lines) {
    roads.push({ x1: v, z1: -WORLD.HALF, x2: v, z2: WORLD.HALF });
    roads.push({ x1: -WORLD.HALF, z1: v, x2: WORLD.HALF, z2: v });
  }

  const harbor = { x: -180, z: -310 };
  const lighthouse = { x: -320, z: 320 };
  const beach = { x: -330, z: 0, w: 60, d: 720 };
  const sea = { x: -405, z: 0, w: 90, d: 720 };

  // ---- Blocks: the cells between roads. ----
  // Block centres sit halfway between neighbouring grid lines.
  const blocks = [];
  for (let i = 0; i < lines.length - 1; i++) {
    for (let j = 0; j < lines.length - 1; j++) {
      const cx = (lines[i] + lines[i + 1]) / 2;
      const cz = (lines[j] + lines[j + 1]) / 2;
      // West column is beach, not buildable land.
      if (cx < -WORLD.HALF + WORLD.ROAD) continue;
      // Keep the harbour apron and the lighthouse clearing free.
      if (dist2(cx, cz, harbor.x, harbor.z) < 110 * 110) continue;
      if (dist2(cx, cz, lighthouse.x, lighthouse.z) < 70 * 70) continue;
      blocks.push({
        x: cx,
        z: cz,
        w: WORLD.ROAD - ROAD_WIDTH - 4,
        d: WORLD.ROAD - ROAD_WIDTH - 4,
      });
    }
  }

  // ---- Buildings: 1-3 per block, random footprint + height 8-60 m. ----
  const buildings = [];
  for (const block of blocks) {
    const count = randInt(rng, 1, 3);
    const slots = [];
    if (count === 1) {
      slots.push({ ox: 0, oz: 0, fw: 0.72, fd: 0.72 });
    } else if (count === 2) {
      const vertical = rng() < 0.5;
      if (vertical) {
        slots.push({ ox: -0.22, oz: 0, fw: 0.42, fd: 0.72 });
        slots.push({ ox: 0.22, oz: 0, fw: 0.42, fd: 0.72 });
      } else {
        slots.push({ ox: 0, oz: -0.22, fw: 0.72, fd: 0.42 });
        slots.push({ ox: 0, oz: 0.22, fw: 0.72, fd: 0.42 });
      }
    } else {
      slots.push({ ox: -0.22, oz: -0.22, fw: 0.42, fd: 0.42 });
      slots.push({ ox: 0.22, oz: -0.22, fw: 0.42, fd: 0.42 });
      slots.push({ ox: 0, oz: 0.24, fw: 0.62, fd: 0.36 });
    }
    for (const s of slots) {
      const w = Math.max(10, block.w * s.fw * rand(rng, 0.8, 1));
      const d = Math.max(10, block.d * s.fd * rand(rng, 0.8, 1));
      const h = rand(rng, 8, 60);
      buildings.push({
        x: block.x + block.w * s.ox,
        z: block.z + block.d * s.oz,
        w,
        d,
        h,
        color: pick(rng, COLORS.building),
      });
    }
  }

  // ---- Street lamps: at road intersections, offset to the corner. ----
  const lamps = [];
  for (const x of lines) {
    for (const z of lines) {
      if (x <= -WORLD.HALF + WORLD.ROAD) continue; // beach side has no lamps
      if ((Math.round(x / WORLD.ROAD) + Math.round(z / WORLD.ROAD)) % 2 !== 0) continue;
      lamps.push({ x: x + ROAD_WIDTH / 2 + 1.5, z: z + ROAD_WIDTH / 2 + 1.5 });
    }
  }

  // ---- Trees: scattered on sidewalks / block corners, never on roads
  // and never inside a building footprint. ----
  const trees = [];
  let guard = 0;
  while (trees.length < 90 && guard < 900) {
    guard++;
    const x = rand(rng, -WORLD.HALF + 20, WORLD.HALF - 20);
    const z = rand(rng, -WORLD.HALF + 20, WORLD.HALF - 20);
    if (x < -WORLD.HALF + WORLD.ROAD) continue; // beach, no trees
    if (nearRoad(x, z, ROAD_WIDTH / 2 + 3)) continue;
    if (dist2(x, z, harbor.x, harbor.z) < 90 * 90) continue;
    let inside = false;
    for (const b of buildings) {
      if (Math.abs(x - b.x) < b.w / 2 + 2 && Math.abs(z - b.z) < b.d / 2 + 2) {
        inside = true;
        break;
      }
    }
    if (inside) continue;
    trees.push({ x, z });
  }

  return { roads, blocks, buildings, lamps, trees, beach, sea, harbor, lighthouse };
}

export function buildCityMeshes(THREE, city) {
  const group = new THREE.Group();
  group.name = 'PortoSolCity';

  // Reuse one material per colour — never create a material per building.
  const matCache = new Map();
  function lambert(color, extra) {
    const key = color + '|' + JSON.stringify(extra || {});
    if (!matCache.has(key)) {
      matCache.set(key, new THREE.MeshLambertMaterial({ color, ...(extra || {}) }));
    }
    return matCache.get(key);
  }

  const groundMat = lambert(COLORS.grass);
  const roadMat = lambert(COLORS.road);
  const sidewalkMat = lambert(COLORS.sidewalk);
  const sandMat = lambert(COLORS.sand);
  const seaMat = lambert(COLORS.sea);
  const trunkMat = lambert(0x6b4a2f);
  const leafMat = lambert(0x2f6b2a);
  const poleMat = lambert(0x3a3a3a);
  const lampMat = lambert(COLORS.lamp, { emissive: COLORS.lamp, emissiveIntensity: 0.9 });
  const woodMat = lambert(0x8a6a42);
  const whiteMat = lambert(0xf2f2f2);
  const redMat = lambert(0xc0392b);
  const roofMat = lambert(0x444444);

  function addBox(mat, x, y, z, w, h, d, parent) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    (parent || group).add(mesh);
    return mesh;
  }

  function addPlane(mat, x, y, z, w, d, rotX) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = rotX === undefined ? -Math.PI / 2 : rotX;
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  // ---- Ground (grass base for the whole city). ----
  addPlane(groundMat, 0, -0.05, 0, WORLD.SIZE, WORLD.SIZE);

  // ---- Roads: dark planes along every grid line. ----
  for (const r of city.roads) {
    const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
    const cx = (r.x1 + r.x2) / 2;
    const cz = (r.z1 + r.z2) / 2;
    const vertical = Math.abs(r.x2 - r.x1) < 0.01;
    addPlane(roadMat, cx, 0, cz, vertical ? ROAD_WIDTH : len, vertical ? len : ROAD_WIDTH);
    // Sidewalk strips flanking the road.
    const sw = 3;
    if (vertical) {
      addPlane(sidewalkMat, cx - ROAD_WIDTH / 2 - sw / 2, 0.01, cz, sw, len);
      addPlane(sidewalkMat, cx + ROAD_WIDTH / 2 + sw / 2, 0.01, cz, sw, len);
    } else {
      addPlane(sidewalkMat, cx, 0.01, cz - ROAD_WIDTH / 2 - sw / 2, len, sw);
      addPlane(sidewalkMat, cx, 0.01, cz + ROAD_WIDTH / 2 + sw / 2, len, sw);
    }
  }

  // ---- Beach (sand strip on the west) + sea (big blue plane beyond it). ----
  addPlane(sandMat, city.beach.x, 0.02, city.beach.z, city.beach.w, city.beach.d);
  addPlane(seaMat, city.sea.x, -0.1, city.sea.z, city.sea.w, city.sea.d);

  // ---- Buildings: coloured boxes + a flat darker roof cap. ----
  for (const b of city.buildings) {
    const mat = lambert(b.color);
    const mesh = addBox(mat, b.x, b.h / 2, b.z, b.w, b.h, b.d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addBox(roofMat, b.x, b.h + 0.4, b.z, b.w * 0.9, 0.8, b.d * 0.9);
  }

  // ---- Street lamps: pole + glowing bulb. ----
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const bulbGeo = new THREE.SphereGeometry(0.45, 10, 8);
  for (const l of city.lamps) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(l.x, 3, l.z);
    group.add(pole);
    const bulb = new THREE.Mesh(bulbGeo, lampMat);
    bulb.position.set(l.x, 6.2, l.z);
    group.add(bulb);
  }

  // ---- Trees: trunk cylinder + cone canopy. ----
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6);
  const coneGeo = new THREE.ConeGeometry(1.8, 4.5, 8);
  for (const t of city.trees) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(t.x, 1.2, t.z);
    group.add(trunk);
    const cone = new THREE.Mesh(coneGeo, leafMat);
    cone.position.set(t.x, 4.4, t.z);
    cone.castShadow = true;
    group.add(cone);
  }

  // ---- Harbour: wooden pier deck + posts, jutting north. ----
  const pier = new THREE.Group();
  pier.position.set(city.harbor.x, 0, city.harbor.z);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(24, 1, 46), woodMat);
  deck.position.set(0, 0.5, 0);
  deck.receiveShadow = true;
  pier.add(deck);
  for (let i = 0; i < 4; i++) {
    for (const sx of [-11, 11]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 3, 6), woodMat);
      post.position.set(sx, 0.4, -18 + i * 12);
      pier.add(post);
    }
  }
  group.add(pier);

  // ---- Lighthouse at (-320, 320): white tower, red bands, glowing lamp. ----
  const lh = new THREE.Group();
  lh.position.set(city.lighthouse.x, 0, city.lighthouse.z);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.5, 26, 12), whiteMat);
  tower.position.y = 13;
  tower.castShadow = true;
  lh.add(tower);
  for (const y of [7, 17]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.9, 3, 12), redMat);
    band.position.y = y;
    lh.add(band);
  }
  const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, 10), lampMat);
  lampRoom.position.y = 27.5;
  lh.add(lampRoom);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.5, 10), redMat);
  cap.position.y = 30.2;
  lh.add(cap);
  group.add(lh);

  return group;
}
