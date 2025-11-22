import * as THREE from 'three';
import { scene } from '../core/init.js';
import { SimpleModelLoader } from './modelloader.js';
import { RoomModule } from './roomModule.js';
import { rooms } from './rooms.js';



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
  // Only load templates we need for dynamic branching.
  const needed = ['bufferzone', 'corridor', 'sroom', 'scaryladyroom', 'scarygang', 'fiendroom', 'weepingangelroom'];
  for (const def of rooms) {
    if (!needed.includes(def.id)) continue;
    const glbRoot = await loader.load(def.modelPath, THREE);
    // Remove from scene so we control when and how instances are added.
    if (glbRoot.parent === scene) {
      scene.remove(glbRoot);
    }
    const tmpl = new RoomModule(glbRoot, def);
    templates[def.id] = tmpl;
  }
  templatesLoaded = true;
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