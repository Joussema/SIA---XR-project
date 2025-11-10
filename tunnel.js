// Tunnel loader and tiling logic.
//
// Loads a single GLB corridor segment (`models/corridor.glb`), clones it along
// one axis, and wraps segments around the player to fake an infinite tunnel.

import * as THREE from 'three';
import { scene, camera, renderer, dolly } from '../core/init.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Runtime state for the tiled corridor.
let clones = [];
let segmentLength = 0;
let corridorLoaded = false;

// Axis along which the corridor runs ("x" or "z"), chosen from the model size.
// Used for tiling and movement clamping.
let corridorAxis = 'z';

// Half usable corridor width, used to clamp lateral movement (with a small margin).
let halfWidth = 0;

// -----------------------------------------------------------------------------
// Tiling configuration

const TILE_FORWARD_MULT = 0.855;
const TILE_SIDE_SHIFT = 13;
const TILE_SIDE_BASE = 0;

// -----------------------------------------------------------------------------

let forwardAxis = 'z';
let sideAxis = 'x';
const NUM_CLONES = 7;

/**
 * Load the corridor model and create its tiled instances.
 */
export async function createTunnel() {
  // Reset previous corridor
  clones.forEach((c) => scene.remove(c));
  clones = [];
  corridorLoaded = false;

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync('models/corridor.glb');
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  // Infer corridor dimensions and pick forward axis (X or Z)
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);

  if (size.x >= size.z) {
    corridorAxis = 'x';
    segmentLength = size.x;
    halfWidth = size.z && size.z > 0 ? size.z * 0.5 - 0.25 : 5;
  } else {
    corridorAxis = 'z';
    segmentLength = size.z;
    halfWidth = size.x && size.x > 0 ? size.x * 0.5 - 0.25 : 5;
  }

  forwardAxis = corridorAxis;
  sideAxis = corridorAxis === 'x' ? 'z' : 'x';

  // ✅ Load the black-and-white texture for the tunnel walls
  const textureLoader = new THREE.TextureLoader();
  const tunnelTexture = textureLoader.load('./images/vecteezy_abstract-black-and-white-pattern-like-psychedelic_.jpg');
  tunnelTexture.wrapS = THREE.RepeatWrapping;
  tunnelTexture.wrapT = THREE.RepeatWrapping;
  tunnelTexture.repeat.set(4, 2); // adjust these for how it looks

  // ✅ Create the textured material
  const material = new THREE.MeshStandardMaterial({
    map: tunnelTexture,
    side: THREE.DoubleSide,
  });

  // Add neon outlines for style
  root.traverse((child) => {
    if (child.isMesh) {
      child.material = material;

      const edgesGeom = new THREE.EdgesGeometry(child.geometry);
      const neonLine = new THREE.LineSegments(
        edgesGeom,
        new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 })
      );
      child.add(neonLine);
    }
  });

  // Center segments around the origin (player starts near the middle tile)
  const offset = Math.floor(NUM_CLONES / 2);

  // Create and place corridor clones
  for (let i = 0; i < NUM_CLONES; i++) {
    const clone = root.clone(true);
    const tileIndex = i - offset;
    clone.userData.tileIndex = tileIndex;

    const forwardOffset = tileIndex * segmentLength * TILE_FORWARD_MULT;
    const sideOffset = TILE_SIDE_BASE + tileIndex * TILE_SIDE_SHIFT;

    clone.position.set(0, 0, 0);
    clone.position[forwardAxis] = forwardOffset;
    clone.position[sideAxis] = sideOffset;

    scene.add(clone);
    clones.push(clone);
  }

  // Basic lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 10, 5);
  scene.add(dirLight);

  corridorLoaded = true;
}

/**
 * Wrap corridor segments around the player to simulate an endless tunnel.
 */
export function updateCorridor() {
  if (!corridorLoaded || segmentLength === 0) return;

  const playerObject = (renderer.xr?.isPresenting && dolly) ? dolly : camera;
  if (!playerObject) return;

  const playerCoord = playerObject.position[forwardAxis];
  const span = segmentLength * TILE_FORWARD_MULT * NUM_CLONES;

  clones.forEach((clone) => {
    const cloneCoord = clone.position[forwardAxis];
    const diff = cloneCoord - playerCoord;

    let idx = clone.userData.tileIndex ?? 0;

    if (diff > segmentLength * TILE_FORWARD_MULT * 2) {
      idx -= NUM_CLONES;
    } else if (diff < -segmentLength * TILE_FORWARD_MULT * 2) {
      idx += NUM_CLONES;
    } else {
      return;
    }

    clone.userData.tileIndex = idx;

    const newForward = idx * segmentLength * TILE_FORWARD_MULT;
    const newSide = TILE_SIDE_BASE + idx * TILE_SIDE_SHIFT;

    clone.position[forwardAxis] = newForward;
    clone.position[sideAxis] = newSide;
  });
}
