import * as THREE from 'three';
import { scene } from '../core/init.js';
import { SimpleModelLoader } from './modelloader.js';
import { RoomModule } from './roomModule.js';
import { rooms } from './rooms.js';

// Ajoute en haut avec les autres imports:
import { collisionSystem } from './collisionSystem.js';

// Map of template id to RoomModule instances. These templates are
// loaded once from GLB files on init. Keys correspond to ids in
// environment/rooms.js.
const templates = {};
let templatesLoaded = false;

// Instances for the current step. These are RoomModule clones whose
// roots are added to the scene. They are replaced each step except
// when reusing the centre buffer for continuity.
let centerBuffer = null;
let forwardRoom = null;
let forwardBuffer = null;
let backwardRoom = null;
let backwardBuffer = null;

// World-space bounding boxes used to determine which buffer the player
// occupies. These are recomputed whenever the world is rebuilt.
let centerBB = null;
let forwardBB = null;
let backwardBB = null;

// Decision tracking. lastBuffer records which buffer the player was
// previously in, and decisionMade prevents multiple decisions per step.
let lastBuffer = null;
let decisionMade = false;

/**
 * Load the necessary room templates (bufferzone, corridor and sroom)
 * from GLB files. Templates are stored as RoomModule instances. This
 * function should be awaited before any world-building occurs.
 */
export async function initDynamicWorld() {
  if (templatesLoaded) return;
  const loader = new SimpleModelLoader(scene);
  // Minimal set to load initially (only what's needed for first step)
  const essential = ['bufferzone', 'corridor', 'weepingangelroom'];
  const lazy = ['sroom', 'scaryladyroom', 'scarygang', 'fiendroom', 'deadend', 'runroom'];

  // Load essential templates first so the app can start quickly.
  for (const def of rooms) {
    if (!essential.includes(def.id)) continue;
    try {
      const glbRoot = await loader.load(def.modelPath, THREE);
      if (glbRoot.parent === scene) scene.remove(glbRoot);
      templates[def.id] = new RoomModule(glbRoot, def);
    } catch (e) {
      console.error('Failed to load essential template:', def.id, e);
    }
  }
  templatesLoaded = true;
  console.log(' Essential templates loaded, starting game');

  // Kick off background loading of heavy/rare templates.
  loadLazyTemplates(loader, lazy).catch(e => console.error('Failed to load lazy templates:', e));
}

async function loadLazyTemplates(loader, lazyIds) {
  // Stagger loading to avoid network/CPU saturation.
  for (const id of lazyIds) {
    const def = rooms.find(r => r.id === id);
    if (!def) continue;
    // Longer delay between loads to reduce lag spikes
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      const glbRoot = await loader.load(def.modelPath, THREE);
      if (glbRoot.parent === scene) scene.remove(glbRoot);
      templates[def.id] = new RoomModule(glbRoot, def);
      console.log(' Lazy-loaded template:', id);
    } catch (e) {
      console.warn('Lazy load failed for template:', id, e);
    }
  }
  console.log(' All templates loaded');
}

/**
 *
 * @param {RoomModule|null} fromBuffer The buffer instance to retain as
 *   the new centre, or null to discard everything.
 */
function clearWorld(fromBuffer) {
  const toRemove = [forwardRoom, forwardBuffer, backwardRoom, backwardBuffer];
  toRemove.forEach((inst) => {
    if (inst && inst.root && (!fromBuffer || inst.root !== fromBuffer.root)) {
      scene.remove(inst.root);
    }
  });
  forwardRoom = null;
  forwardBuffer = null;
  backwardRoom = null;
  backwardBuffer = null;
  // Bounding boxes will be recalculated on the next build.
}

/**
 *
 * @param {object} blueprint The StepBlueprint describing the layout.
 * @param {RoomModule|null} fromBuffer If provided, this buffer will be
 *   used as the centre; otherwise a new bufferzone instance is created.
 */
export function buildWorldForBlueprint(blueprint, fromBuffer = null) {
  // Remove current world, preserving fromBuffer if present.
  // Defer collision system update until after all objects are positioned
  clearWorld(fromBuffer);
  if (fromBuffer) {
    centerBuffer = fromBuffer;
  } else {
    // Create a new centre buffer at the origin. Bufferzone acts as a
    // neutral transition space and is the player's start position.
    const tmpl = templates['bufferzone'];
    centerBuffer = tmpl.clone();
    scene.add(centerBuffer.root);
  }

  // --- Forward branch ---
  const forwardTmpl = templates[blueprint.forwardRoomType] || templates['corridor'];
  // If the requested template is missing, start a background load so future steps can use it.
  if (!templates[blueprint.forwardRoomType]) {
    const missing = blueprint.forwardRoomType;
    backgroundLoadTemplate(missing);
  }
  forwardRoom = forwardTmpl.clone();
  forwardBuffer = templates['bufferzone'].clone();
  // Snap the forward room to the centre: its start attaches to the centre's end.
  forwardRoom.snapTo(centerBuffer, 'start', 'end');
  // Snap the forward buffer to the forward room: its start attaches to the room's end.
  forwardBuffer.snapTo(forwardRoom, 'start', 'end');
  scene.add(forwardRoom.root);
  scene.add(forwardBuffer.root);

  // --- Backward branch ---
  const backwardTmpl = templates[blueprint.backwardRoomType] || templates['corridor'];
  if (!templates[blueprint.backwardRoomType]) {
    const missing = blueprint.backwardRoomType;
    backgroundLoadTemplate(missing);
  }
  backwardRoom = backwardTmpl.clone();
  backwardBuffer = templates['bufferzone'].clone();
  // Snap the first backward room with a 180° flip: its start connects to the centre's start.
  backwardRoom.snapTo(centerBuffer, 'start', 'start');
  // Snap the backward buffer to the backward room: its start attaches to the room's end.
  backwardBuffer.snapTo(backwardRoom, 'start', 'end');
  scene.add(backwardRoom.root);
  scene.add(backwardBuffer.root);

  // Update world matrices so bounding boxes are accurate.
  centerBuffer.root.updateMatrixWorld(true);
  forwardBuffer.root.updateMatrixWorld(true);
  backwardBuffer.root.updateMatrixWorld(true);

  // Compute bounding boxes for decision detection. These boxes
  // approximate the volume occupied by each buffer and are used to
  // determine when the player enters a branch.
  centerBB = new THREE.Box3().setFromObject(centerBuffer.root);
  forwardBB = new THREE.Box3().setFromObject(forwardBuffer.root);
  backwardBB = new THREE.Box3().setFromObject(backwardBuffer.root);

  // Expand the bounding boxes slightly to make decision detection more forgiving.
  const expansion = 1;
  centerBB.expandByScalar(expansion);
  forwardBB.expandByScalar(expansion);
  backwardBB.expandByScalar(expansion);

  // Batch collision updates to reduce overhead
  collisionSystem.clear();
  const colliderRoots = [
    centerBuffer?.root,
    forwardRoom?.root,
    forwardBuffer?.root,
    backwardRoom?.root,
    backwardBuffer?.root
  ].filter(Boolean);

  // Add all colliders at once
  colliderRoots.forEach(root => collisionSystem.addCollider(root, true));

  // Reset decision detection state.
  lastBuffer = 'center';
  decisionMade = false;
}

/**
 * Determine whether the player has left the centre buffer and entered
 * a decision buffer. Decisions are only detected when moving from the
 * centre to either the forward or backward buffer. Once a decision
 * occurs, this function returns null until the next world is built.
 *
 * @param {THREE.Vector3} playerPos The player's position in world coordinates.
 * @returns {string|null} 'forward' or 'backward' if a decision has been made; otherwise null.
 */
export function getDecisionForPlayer(playerPos) {
  // If a decision has already been made or bounding boxes are not ready, return null.
  if (decisionMade || !centerBB || !forwardBB || !backwardBB) return null;

  // Helper to test whether a point lies within a bounding box in the XZ plane.
  const inBox2D = (box, pos) => {
    return (
      pos.x >= box.min.x &&
      pos.x <= box.max.x &&
      pos.z >= box.min.z &&
      pos.z <= box.max.z
    );
  };

  let current = null;
  if (inBox2D(forwardBB, playerPos)) {
    current = 'forward';
  } else if (inBox2D(backwardBB, playerPos)) {
    current = 'backward';
  } else if (inBox2D(centerBB, playerPos)) {
    current = 'center';
  } else {
    current = null;
  }

  let result = null;
  // Trigger a decision only when leaving the centre for a branch.
  if (lastBuffer === 'center' && (current === 'forward' || current === 'backward')) {
    decisionMade = true;
    result = current;
  }
  if (current !== null) {
    lastBuffer = current;
  }
  return result;
}

/**
 * Return the buffer instance corresponding to a branch label. This
 * method is used by the main loop to determine which buffer becomes
 * the centre for the next step after a decision.
 *
 * @param {'forward'|'backward'|'center'} branch
 * @returns {RoomModule|null} The buffer instance for the requested branch.
 */
export function getBufferInstance(branch) {
  if (branch === 'forward') return forwardBuffer;
  if (branch === 'backward') return backwardBuffer;
  return centerBuffer;
}

/**
 * Return the room instance corresponding to a location label. When an
 * anomaly should appear, the caller can use this to determine the
 * appropriate room whose bounding box centre will become the spawn
 * position. The centre buffer counts as both a room and a buffer.
 *
 * @param {'forward'|'backward'|'center'} location
 * @returns {RoomModule|null}
 */
export function getRoomInstance(location) {
  if (location === 'forward') return forwardRoom;
  if (location === 'backward') return backwardRoom;
  return centerBuffer;
}

/**
 * Trigger a background load of a template if it's not already available.
 * This is intentionally fire-and-forget to avoid blocking the caller.
 */
function backgroundLoadTemplate(id) {
  if (!id || templates[id]) return;
  const def = rooms.find(r => r.id === id);
  if (!def) return;
  const loader = new SimpleModelLoader(scene);
  (async () => {
    try {
      const glbRoot = await loader.load(def.modelPath, THREE);
      if (glbRoot.parent === scene) scene.remove(glbRoot);
      templates[def.id] = new RoomModule(glbRoot, def);
      console.log('Background-loaded template:', id);
    } catch (e) {
      console.warn('Background load failed for template:', id, e);
    }
  })();
}