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
//
// You can tweak these values without changing any other code.

// Spacing between segments as a multiple of their length.
// 1.0 = touching, >1.0 = gaps, <1.0 = overlap.
const TILE_FORWARD_MULT = 0.855;

// Lateral shift per segment (world units). Set to 0 for no sideways offset.
const TILE_SIDE_SHIFT = 13;

// Base lateral offset for the whole corridor.
const TILE_SIDE_BASE = 0;

// -----------------------------------------------------------------------------

// Forward (tiling) and side (shift) axes, derived from corridorAxis.
let forwardAxis = 'z';
let sideAxis = 'x';

// Number of active segments. More segments = fewer pops, more geometry.
const NUM_CLONES = 7;

/**
 * Load the corridor model and create its tiled instances.
 *
 * Call once during initialization. Returns a Promise that resolves when the
 * corridor is ready and added to the scene.
 */
export async function createTunnel() {
  // Reset previous corridor, if any.
  clones.forEach((c) => scene.remove(c));
  clones = [];
  corridorLoaded = false;

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync('models/corridor.glb');
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  // Infer corridor dimensions and pick forward axis (X or Z).
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

  // Simple material and neon edges for the corridor meshes.
  const material = new THREE.MeshLambertMaterial({ color: 0x8080c0, side: THREE.DoubleSide });
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

  // Center segments around the origin (player starts near the middle tile).
  const offset = Math.floor(NUM_CLONES / 2);

  // Create and place corridor clones.
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

  // Basic lighting.
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 10, 5);
  scene.add(dirLight);

  corridorLoaded = true;
}

/**
 * Wrap corridor segments around the player to simulate an endless tunnel.
 *
 * Call once per frame after updating the player's position.
 */
export function updateCorridor() {
  if (!corridorLoaded || segmentLength === 0) return;

  // Use dolly in XR, otherwise the camera.
  const playerObject = (renderer.xr?.isPresenting && dolly) ? dolly : camera;
  if (!playerObject) return;

  const playerCoord = playerObject.position[forwardAxis];

  // Total span covered by all tiles (kept for reference / tuning).
  const span = segmentLength * TILE_FORWARD_MULT * NUM_CLONES;

  clones.forEach((clone) => {
    const cloneCoord = clone.position[forwardAxis];
    const diff = cloneCoord - playerCoord;

    // Logical tile index for this clone.
    let idx = clone.userData.tileIndex ?? 0;

    if (diff > segmentLength * TILE_FORWARD_MULT * 2) {
      // Too far ahead: wrap behind.
      idx -= NUM_CLONES;
    } else if (diff < -segmentLength * TILE_FORWARD_MULT * 2) {
      // Too far behind: wrap in front.
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
