

import * as THREE from 'three';
import { scene, camera, renderer, dolly } from '../core/init.js';
import { SimpleModelLoader } from './modelloader.js';
import { RoomModule } from './roomModule.js';
import { rooms } from './rooms.js';

// Runtime state for the tiled rooms.
let clones = [];
let corridorLoaded = false;


const NUM_CLONES = 7;

// Lateral shift per segment (world units). Set to 0 for no sideways offset.
const TILE_SIDE_SHIFT = 0;
// Base lateral offset for the whole tunnel.
const TILE_SIDE_BASE = 0;
// Multiplier on each module's segment length. 1 = touching, >1 = gaps.
const TILE_FORWARD_MULT = 1;

// Loaded templates (base RoomModule for each room definition).
let templates = [];
// The global side axis along which sideways offsets are applied. Determined
// from the first loaded module. Either 'x' or 'z'.
let globalSideAxis = 'x';
// Max half width across all modules (for clamping player movement).
let halfWidth = 5;

/**
 * Reset and load all room templates. Creates a number of clones around the
 * origin by randomly picking from the available templates. Each clone's
 * tileIndex indicates its logical position relative to the player.
 *
 * @returns {Promise<Array<RoomModule>>}
 */
export async function createTunnel() {
  // Remove old clones from the scene.
  for (const c of clones) {
    scene.remove(c.root);
  }
  clones = [];
  corridorLoaded = false;

  const loader = new SimpleModelLoader(scene);
  templates = [];

  // Load each room definition. They may specify a preRotation.
  for (const def of rooms) {
    const glbRoot = await loader.load(def.modelPath, THREE);
    // Remove from scene so we control when instances are added.
    if (glbRoot.parent === scene) {
      scene.remove(glbRoot);
    }
    // Construct the template RoomModule.
    const tmpl = new RoomModule(glbRoot, def);
    templates.push(tmpl);
  }

  // Determine a global side axis (x or z) from the first template. This axis
  // will be used for sideways offsets for all rooms, regardless of their own
  // forward axis. It's chosen so that when the first module runs along Z,
  // the side axis will be X, and vice versa.
  if (templates.length > 0) {
    const first = templates[0];
    globalSideAxis = first.sideAxis === 'x' ? 'x' : 'z';
  } else {
    globalSideAxis = 'x';
  }

  // Compute half width across all templates for clamping lateral movement.
  halfWidth = 0;
  for (const tmpl of templates) {
    // width along the side axis: bounding box dimension on side axis.
    const bbox = tmpl.bboxLocal;
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const widthSide = size[tmpl.sideAxis];
    const half = widthSide > 0 ? widthSide * 0.5 - 0.25 : 5;
    if (half > halfWidth) {
      halfWidth = half;
    }
  }


  const offset = Math.floor(NUM_CLONES / 2);
  let prevPosClone;
  let prevNegClone;

  {
    const tmpl = templates[Math.floor(Math.random() * templates.length)];
    const instance = tmpl.clone();
    instance.root.userData.module = tmpl;
    instance.root.userData.tileIndex = 0;
    instance.root.position.set(0, 0, 0);
    const sideOffset = TILE_SIDE_BASE + 0 * TILE_SIDE_SHIFT;
    instance.root.position[globalSideAxis] += sideOffset;
    scene.add(instance.root);
    clones.push(instance);
    // Use this instance as the initial neighbour for both positive and negative directions.
    prevPosClone = instance;
    prevNegClone = instance;
  }

  // Build positive tiles (forward) from 1 to offset.
  for (let i = 1; i <= offset; i++) {
    const tileIndex = i;
    const tmpl = templates[Math.floor(Math.random() * templates.length)];
    const instance = tmpl.clone();
    instance.root.userData.module = tmpl;
    instance.root.userData.tileIndex = tileIndex;
    // Snap start of this module onto end of previous positive clone.
    instance.snapTo(prevPosClone, 'start', 'end');
    const sideOffset = TILE_SIDE_BASE + tileIndex * TILE_SIDE_SHIFT;
    instance.root.position[globalSideAxis] += sideOffset;
    scene.add(instance.root);
    clones.push(instance);
    prevPosClone = instance;
  }

  // Build negative tiles (backward) from -1 to -offset.
  for (let i = 1; i <= offset; i++) {
    const tileIndex = -i;
    const tmpl = templates[Math.floor(Math.random() * templates.length)];
    const instance = tmpl.clone();
    instance.root.userData.module = tmpl;
    instance.root.userData.tileIndex = tileIndex;
    // Snap end of this module onto start of previous negative clone.
    instance.snapTo(prevNegClone, 'end', 'start');
    const sideOffset = TILE_SIDE_BASE + tileIndex * TILE_SIDE_SHIFT;
    instance.root.position[globalSideAxis] += sideOffset;
    scene.add(instance.root);
    clones.push(instance);
    prevNegClone = instance;
  }

  corridorLoaded = true;
  return clones;
}

/**
 * Clamp a player's lateral movement so they remain within the widest module.
 * @param {THREE.Vector3} position
 */
export function clampPlayerToCorridor(position) {
  if (!corridorLoaded) return;
  const val = position[globalSideAxis];
  if (val > halfWidth) {
    position[globalSideAxis] = halfWidth;
  } else if (val < -halfWidth) {
    position[globalSideAxis] = -halfWidth;
  }
}

/**
 * Reposition a clone to a new tile index. A new random module is chosen

 *
 * @param {RoomModule} oldClone      The clone being repositioned.
 * @param {number} newIndex          New tile index for the clone.
 * @param {'behind'|'ahead'} direction Whether wrapping from front to back or back to front.
 */
function repositionClone(oldClone, newIndex, direction) {
  // Find neighbour tile index: when moving behind, the neighbour will be
  // the tile at newIndex + 1 (one closer to player). When moving ahead,
  // it's the tile at newIndex - 1.
  const neighbourIndex = direction === 'behind' ? newIndex + 1 : newIndex - 1;
  let neighbour = null;
  for (const c of clones) {
    if (c.root.userData.tileIndex === neighbourIndex) {
      neighbour = c;
      break;
    }
  }
  if (!neighbour) {
    // If no neighbour found, abort to avoid breaking the chain.
    return;
  }

  // Pick a new random template and clone it.
  const tmpl = templates[Math.floor(Math.random() * templates.length)];
  const newInstance = tmpl.clone();
  newInstance.root.userData.module = tmpl;
  newInstance.root.userData.tileIndex = newIndex;

  // Snap the new instance appropriately based on direction.
  if (direction === 'behind') {
    // Connect new module's end to neighbour's start so it extends behind.
    newInstance.snapTo(neighbour, 'end', 'start');
  } else {
    // Connect new module's start to neighbour's end so it extends ahead.
    newInstance.snapTo(neighbour, 'start', 'end');
  }

  // Apply sideways offset along global side axis.
  const sideOffset = TILE_SIDE_BASE + newIndex * TILE_SIDE_SHIFT;
  newInstance.root.position[globalSideAxis] += sideOffset;

  // Replace the old clone's root in the scene with the new one.
  scene.remove(oldClone.root);
  scene.add(newInstance.root);

  // Replace old clone entry in clones array.
  const idx = clones.indexOf(oldClone);
  if (idx !== -1) {
    clones[idx] = newInstance;
  }
}

/**
 * Update loop to wrap rooms around the player and simulate an infinite tunnel.
 * Called once per frame after updating the player's position. Each clone
 * individually checks its distance to the player along its own forward axis
 * (x or z) and decides whether to wrap from front to back or vice versa.
 */
export function updateCorridor() {
  if (!corridorLoaded || clones.length === 0) return;

  // Determine the player object (dolly in XR, otherwise camera).
  const playerObject = (renderer.xr?.isPresenting && dolly) ? dolly : camera;
  if (!playerObject) return;

  for (const clone of clones.slice()) {
    const tmpl = clone.root.userData.module;
    const forwardAxis = tmpl.forwardAxis;
    const segLen = tmpl.segmentLength * TILE_FORWARD_MULT;
    const cloneCoord = clone.root.position[forwardAxis];
    const playerCoord = playerObject.position[forwardAxis];
    const diff = cloneCoord - playerCoord;

    let idx = clone.root.userData.tileIndex;

    if (diff > segLen * 2) {
      // Too far ahead of the player: wrap behind.
      const newIndex = idx - NUM_CLONES;
      repositionClone(clone, newIndex, 'behind');
      clone.root.userData.tileIndex = newIndex;
    } else if (diff < -segLen * 2) {
      // Too far behind the player: wrap ahead.
      const newIndex = idx + NUM_CLONES;
      repositionClone(clone, newIndex, 'ahead');
      clone.root.userData.tileIndex = newIndex;
    }
  }
}