// combat.js — Tembakan, tracer, damage, dan kondisi game over.
// Ditulis baru dari nol untuk rebuild round 2.

import * as THREE from 'three';
import * as CONFIG from './config.js';

const SHOOT_RANGE = (typeof CONFIG.SHOOT_RANGE === 'number' && CONFIG.SHOOT_RANGE > 0)
  ? CONFIG.SHOOT_RANGE
  : 60;
const SHOOT_CONE_DEG = (typeof CONFIG.SHOOT_CONE_DEG === 'number' && CONFIG.SHOOT_CONE_DEG > 0)
  ? CONFIG.SHOOT_CONE_DEG
  : 15;
const TRACER_LIFE = 0.08;

// Vektor arah dari heading pemain.
// Konvensi: heading 0 menghadap +z (selatan), bertambah searah jarum jam
// bila dilihat dari atas (x timur, z selatan, y ke atas).
function headingDir(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

function playerPos(G) {
  const p = G.player || {};
  return {
    x: typeof p.x === 'number' ? p.x : 0,
    z: typeof p.z === 'number' ? p.z : 0,
    y: 1.2,
    heading: typeof p.heading === 'number' ? p.heading : 0,
  };
}

function angleToTarget(dir, dx, dz, dist) {
  if (dist <= 0.0001) return 0;
  const dot = (dir.x * dx + dir.z * dz) / dist; // dir sudah ternormalisasi
  const clamped = Math.max(-1, Math.min(1, dot));
  return Math.acos(clamped) * (180 / Math.PI);
}

export function shoot(G) {
  if (!G || G.state !== 'playing') return;
  const pos = playerPos(G);
  const dir = headingDir(pos.heading);
  const endX = pos.x + dir.x * SHOOT_RANGE;
  const endZ = pos.z + dir.z * SHOOT_RANGE;

  // Tracer: garis tipis kuning dari pemain ke arah tembakan.
  if (G.scene) {
    if (!Array.isArray(G.tracers)) G.tracers = [];
    try {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(pos.x, pos.y, pos.z),
        new THREE.Vector3(endX, pos.y, endZ),
      ]);
      const mat = new THREE.LineBasicMaterial({ color: 0xffff00 });
      const line = new THREE.Line(geo, mat);
      G.scene.add(line);
      G.tracers.push({ mesh: line, until: G.time + TRACER_LIFE });
    } catch (e) { /* tracer bersifat kosmetik */ }
  }

  const coneRad = SHOOT_CONE_DEG;
  const playerVehicle = G.player && G.player.vehicle ? G.player.vehicle : null;

  // Kendaraan terdekat dalam cone: kehilangan speed.
  let bestVehicle = null;
  let bestVehicleDist = Infinity;
  const vehicles = Array.isArray(G.vehicles) ? G.vehicles : [];
  for (const v of vehicles) {
    if (!v || v === playerVehicle) continue;
    const vx = typeof v.x === 'number' ? v.x : (v.mesh ? v.mesh.position.x : 0);
    const vz = typeof v.z === 'number' ? v.z : (v.mesh ? v.mesh.position.z : 0);
    const dx = vx - pos.x;
    const dz = vz - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > SHOOT_RANGE) continue;
    if (angleToTarget(dir, dx, dz, dist) > coneRad) continue;
    if (dist < bestVehicleDist) {
      bestVehicleDist = dist;
      bestVehicle = v;
    }
  }
  if (bestVehicle) {
    const cur = typeof bestVehicle.speed === 'number' ? bestVehicle.speed : 0;
    bestVehicle.speed = Math.max(0, cur * 0.2);
    if (bestVehicle.mesh) bestVehicle.speed = bestVehicle.speed; // jaga sinkron
  }

  // Pejalan kaki dalam cone: jatuh (hapus dari G.peds), wanted +1.
  const peds = Array.isArray(G.peds) ? G.peds : [];
  let hitPed = false;
  for (let i = peds.length - 1; i >= 0; i--) {
    const ped = peds[i];
    if (!ped) continue;
    const px = typeof ped.x === 'number' ? ped.x : (ped.mesh ? ped.mesh.position.x : 0);
    const pz = typeof ped.z === 'number' ? ped.z : (ped.mesh ? ped.mesh.position.z : 0);
    const dx = px - pos.x;
    const dz = pz - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > SHOOT_RANGE) continue;
    if (angleToTarget(dir, dx, dz, dist) > coneRad) continue;
    if (ped.mesh && G.scene) {
      try { G.scene.remove(ped.mesh); } catch (e) { /* abaikan */ }
    }
    peds.splice(i, 1);
    hitPed = true;
  }
  if (hitPed) {
    G.wanted = Math.min(5, (G.wanted || 0) + 1);
  }

  if (G.audio && typeof G.audio.play === 'function') {
    try { G.audio.play('shot'); } catch (e) { /* audio opsional */ }
  }
}

export function updateCombat(G, dt) {
  // Hapus tracer yang kedaluwarsa.
  if (Array.isArray(G.tracers) && G.tracers.length > 0) {
    for (let i = G.tracers.length - 1; i >= 0; i--) {
      const t = G.tracers[i];
      if (t.until <= G.time) {
        if (t.mesh) {
          if (G.scene) {
            try { G.scene.remove(t.mesh); } catch (e) { /* abaikan */ }
          }
          try {
            if (t.mesh.geometry) t.mesh.geometry.dispose();
            if (t.mesh.material) t.mesh.material.dispose();
          } catch (e) { /* abaikan */ }
        }
        G.tracers.splice(i, 1);
      }
    }
  }

  if (G.health <= 0 && G.state === 'playing') {
    G.state = 'gameover';
  }
}

export function hurtPlayer(G, n) {
  const amount = typeof n === 'number' && n > 0 ? n : 0;
  G.health = Math.max(0, (G.health || 0) - amount);
}
