// shots.js — Penyiapan scene untuk screenshot (?shot=...).
// Ditulis baru dari nol untuk rebuild round 2.

import * as THREE from 'three';
import * as CONFIG from './config.js';
import { startMission, MISSIONS } from './missions.js';
import { makeCarMesh } from './vehicles.js';
import { makePedMesh } from './pedestrians.js';

const CITY_HALF = (typeof CONFIG.CITY_HALF === 'number' && CONFIG.CITY_HALF > 0)
  ? CONFIG.CITY_HALF
  : 360;

export function shotName() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('shot');
  } catch (e) {
    return null;
  }
}

function setPlayer(G, x, z, heading, onFoot) {
  if (!G.player) G.player = {};
  G.player.x = x;
  G.player.z = z;
  G.player.heading = heading;
  G.player.onFoot = onFoot;
  if (G.player.mesh) {
    G.player.mesh.position.set(x, 0, z);
    G.player.mesh.rotation.y = heading;
  }
}

// Kamera chase di belakang pemain, menghadap searah heading.
function chaseCamera(G, dist, height) {
  const h = G.player.heading || 0;
  const backX = -Math.sin(h);
  const backZ = -Math.cos(h);
  G.shotCamera = {
    x: G.player.x + backX * dist,
    y: height,
    z: G.player.z + backZ * dist,
    lookX: G.player.x + Math.sin(h) * 20,
    lookY: 1.5,
    lookZ: G.player.z + Math.cos(h) * 20,
  };
}

function placeVehicle(G, v, x, z, heading, speed) {
  if (!v) return;
  v.x = x;
  v.z = z;
  v.heading = heading;
  v.speed = speed;
  if (v.mesh) {
    v.mesh.position.set(x, 0, z);
    v.mesh.rotation.y = heading;
  }
}

// Buat kendaraan NYATA (mesh asli) untuk shot — jangan pernah mesh: null,
// karena updateVehicles memanggil v.mesh.position setiap frame.
function makeShotCar(G, color, x, z, heading, speed, kind) {
  const mesh = makeCarMesh(THREE, color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  if (G.scene) G.scene.add(mesh);
  const v = { mesh, x, z, heading, speed, color, kind: kind || 'traffic', maxSpeed: kind === 'police' ? 46 : 42 };
  if (Array.isArray(G.vehicles)) G.vehicles.push(v);
  return v;
}

// Buat pejalan kaki NYATA (mesh asli) untuk shot — jangan pernah mesh: null.
function makeShotPed(G, color, x, z) {
  const mesh = makePedMesh(THREE, color);
  mesh.position.set(x, 0, z);
  if (G.scene) G.scene.add(mesh);
  const p = { mesh, x, z, heading: 0, speed: 1, walkSpeed: 1, targetX: x + 20, targetZ: z };
  if (Array.isArray(G.peds)) G.peds.push(p);
  return p;
}

export function applyShot(G, name) {
  if (!G || !name) return;
  G.shotMode = name;

  switch (name) {
    case 'chase': {
      // Pemain di mobil, wanted 3, 2 mobil polisi di belakang.
      G.wanted = 3;
      let car = G.player && G.player.vehicle ? G.player.vehicle : null;
      if (!car) {
        car = makeShotCar(G, 0xffb020, 60, 40, Math.PI / 4, 22, 'player');
        if (G.player) G.player.vehicle = car;
      }
      setPlayer(G, 60, 40, Math.PI / 4, false);
      placeVehicle(G, car, 60, 40, Math.PI / 4, 22);
      // Dua mobil polisi mengejar dari belakang (mesh asli).
      const backX = -Math.sin(Math.PI / 4);
      const backZ = -Math.cos(Math.PI / 4);
      makeShotCar(G, 0x1a1a2e, 60 + backX * 18, 40 + backZ * 18, Math.PI / 4, 20, 'police');
      makeShotCar(G, 0x1a1a2e, 60 + backX * 26 + 6, 40 + backZ * 26, Math.PI / 4, 19, 'police');
      if (G.mission) startMission(G, 2);
      chaseCamera(G, 14, 6);
      break;
    }
    case 'street': {
      // Pemain jalan kaki di jalan ramai, traffic + peds aktif, misi 1.
      G.wanted = 0;
      setPlayer(G, 0, 0, 0, true);
      if (G.player) G.player.vehicle = null;
      startMission(G, 0);
      // Pastikan ada pejalan kaki di sekitar (mesh asli, bukan null).
      if (Array.isArray(G.peds) && G.peds.length === 0) {
        const pedColors = [0x33aa66, 0xaa6633, 0x8833aa, 0xdd3333, 0x3388dd, 0xffb020];
        for (let i = 0; i < 6; i++) {
          makeShotPed(G, pedColors[i % pedColors.length], -20 + i * 8, 6 + (i % 2) * 6);
        }
      }
      chaseCamera(G, 10, 5);
      break;
    }
    case 'drive': {
      // Mengendarai cepat di jalan pesisir (x = -280), kamera chase.
      G.wanted = 0;
      let car = G.player && G.player.vehicle ? G.player.vehicle : null;
      if (!car) {
        car = makeShotCar(G, 0xdd3333, -280, 0, 0, 30, 'player');
        if (G.player) G.player.vehicle = car;
      }
      setPlayer(G, -280, 0, 0, false);
      placeVehicle(G, car, -280, 0, 0, 30);
      if (G.player) G.player.speed = 30;
      chaseCamera(G, 16, 7);
      break;
    }
    case 'mission': {
      // Pemain dekat target misi 2, marker terlihat.
      G.wanted = 0;
      startMission(G, 1);
      const m = MISSIONS[1];
      const tx = m && m.target ? m.target.x : -150;
      const tz = m && m.target ? m.target.z : 200;
      setPlayer(G, tx - 25, tz - 25, Math.PI / 4, true);
      if (G.player) G.player.vehicle = null;
      // Kamera agak tinggi dari samping agar marker misi terlihat.
      G.shotCamera = {
        x: tx - 45,
        y: 18,
        z: tz - 45,
        lookX: tx,
        lookY: 1,
        lookZ: tz,
      };
      break;
    }
    default:
      // Nama tak dikenal: kembalikan tanpa perubahan.
      break;
  }
}
