// Porto Sol — renderer / scene / lights / sky (Round 2 rebuild).
// Cheap Lambert-friendly setup: one directional sun with shadows plus
// hemisphere fill, fog matched to the sky colour, and a simple gradient
// sky dome with a few flat translucent clouds.

import * as THREE from 'three';
import { COLORS } from './config.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(1280, 720);
  return renderer;
}

export function createScene(THREE) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 200, 900);
  return scene;
}

export function addLights(THREE, scene) {
  const sun = new THREE.DirectionalLight(0xfff2d9, 1.6);
  sun.position.set(180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -400;
  sun.shadow.camera.right = 400;
  sun.shadow.camera.top = 400;
  sun.shadow.camera.bottom = -400;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0xbfd9ee, 0x4a7c3a, 0.9);
  scene.add(hemi);

  return { sun, hemi };
}

export function addSky(THREE, scene) {
  // Gradient sky dome: vertex-coloured sphere, back side, no fog on it.
  const geo = new THREE.SphereGeometry(850, 24, 16);
  const top = new THREE.Color(0x5f9ccf);
  const bottom = new THREE.Color(0xcfe6f2);
  const colors = [];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, (pos.getY(i) / 850) * 0.5 + 0.5));
    const c = bottom.clone().lerp(top, t);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const skyMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
  });
  const sky = new THREE.Mesh(geo, skyMat);
  sky.name = 'SkyDome';
  scene.add(sky);

  // A few flat translucent white clouds drifting high above the city.
  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.75,
    fog: false,
  });
  const cloudGeo = new THREE.PlaneGeometry(90, 28);
  const spots = [
    { x: -160, y: 150, z: -220, s: 1.2 },
    { x: 120, y: 170, z: -120, s: 1.0 },
    { x: 240, y: 140, z: 180, s: 1.4 },
    { x: -60, y: 180, z: 260, s: 0.9 },
    { x: -260, y: 160, z: 60, s: 1.1 },
  ];
  for (const s of spots) {
    const cloud = new THREE.Mesh(cloudGeo, cloudMat);
    cloud.position.set(s.x, s.y, s.z);
    cloud.rotation.x = -Math.PI / 2;
    cloud.scale.setScalar(s.s);
    cloud.name = 'Cloud';
    scene.add(cloud);
  }

  return sky;
}
