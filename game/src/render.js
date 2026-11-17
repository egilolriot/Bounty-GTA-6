// Porto Sol — renderer, scene, lights and the chase camera.
import * as THREE from 'three';
import { CFG } from './config.js';

const _desired = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _look = new THREE.Vector3();

// Renderer: antialiased, soft shadows, sRGB output, capped pixel ratio
// so high-DPI screens do not pay full native resolution.
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  return renderer;
}

// Scene: warm sunset sky, matching fog so the horizon melts into it.
export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CFG.colors.sky);
  scene.fog = new THREE.Fog(CFG.colors.fog, 90, 700);
  return scene;
}

// Perspective camera, wide enough for driving, far plane past the city.
export function createCamera() {
  return new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
}

// Golden-hour lighting: a soft sky/ground hemisphere plus a low warm
// sun that casts the long shadows. Shadow frustum covers the city.
export function setupLights(scene) {
  const hemi = new THREE.HemisphereLight(CFG.colors.hemiSky, CFG.colors.hemiGround, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(CFG.colors.sun, 2.2);
  sun.position.set(-180, 140, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -420;
  sun.shadow.camera.right = 420;
  sun.shadow.camera.top = 460;
  sun.shadow.camera.bottom = -420;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  return { hemi, sun };
}

// Chase camera. Follows behind the player's heading (0 rad = +Z), closer
// on foot and pulled back in a car; G.camFar (toggled by the C key in the
// input module) forces the far distance on foot too. Position is smoothed
// with an exponential lerp so turns do not snap; the look target sits a
// few metres ahead so the player is framed slightly low in view.
export function updateCamera(G, dt) {
  const p = G.player;
  const inCar = !!p.inCar;
  const dist = (inCar || G.camFar) ? CFG.camera.farDist : CFG.camera.nearDist;

  _forward.set(Math.sin(p.heading), 0, Math.cos(p.heading));
  _desired.copy(p.pos).addScaledVector(_forward, -dist);
  _desired.y = p.pos.y + CFG.camera.height;

  const k = 1 - Math.exp(-CFG.camera.lerp * dt);
  G.camera.position.lerp(_desired, k);

  _look.copy(p.pos).addScaledVector(_forward, 6);
  _look.y = p.pos.y + 1.4;
  G.camera.lookAt(_look);
}
