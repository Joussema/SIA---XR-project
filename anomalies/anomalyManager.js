import * as THREE from 'three';
import { renderer, camera, scene, dolly } from '../core/init.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let currentAnomaly = null;
// Periodic spawning has been disabled. The dynamic game logic now
// explicitly triggers anomalies when appropriate, so the manager
// maintains currentAnomaly only. These variables remain for API
// compatibility but are no longer used.
let lastSpawnTime = 0;
const ANOMALY_PERIOD = 10000;

// Manual configuration values are no longer used. Anomalies are
// spawned explicitly via exported helper functions.
const MANUAL_EVENT = '';
const MANUAL_STONE_POSITION = new THREE.Vector3(0, -1, -3);

// Performance optimization: limit update frequency
let lastUpdateTime = 0;
const UPDATE_INTERVAL = 50; // Update every 50ms instead of every frame (16ms)

// === Utility ===
function getCameraPosition() {
  if (renderer.xr?.isPresenting && dolly) return dolly.position.clone();
  return camera.position.clone();
}

function getPlayerDirection() {
  const direction = new THREE.Vector3(0, 0, -1)
    .applyEuler(camera.rotation)
    .setY(0)
    .normalize();
  return direction;
}

function hasPlayerChangedDirection(initialDirection, currentDirection, threshold = 0.3) {
  return initialDirection.dot(currentDirection) < threshold;
}

// === SPAWN ===
function spawnAnomaly(type, position) {
  const anomaly = {
    type,
    position: position.clone(),
    fireGroups: [],
    meshes: [],
    lights: [],
    lifetime: type === 'WEEPING_ANGEL' ? 999999999 : 8000,
    createdAt: Date.now(),
    state: undefined
  };

  switch (type) {
    case 'WEEPING_ANGEL':
      createWeepingAngel(anomaly);
      break;
  }

  currentAnomaly = anomaly;
}

// === CLEANUP ===
function cleanupAnomaly(a) {
  a.meshes.forEach(m => scene.remove(m));
  a.lights.forEach(l => scene.remove(l));

  if (a.fireGroups) {
    a.fireGroups.forEach(fireGroup => {
      fireGroup.meshes.forEach(m => scene.remove(m));
      fireGroup.lights.forEach(l => scene.remove(l));
    });
  }
}

// === Main update loop ===
export function updateAnomalies() {
  const now = Date.now();

  // Performance: Skip updates if called too frequently
  if (now - lastUpdateTime < UPDATE_INTERVAL) {
    return; // Skip this frame
  }
  lastUpdateTime = now;

  // Update and remove after lifetime
  if (currentAnomaly) {
    const age = now - currentAnomaly.createdAt;
    const progress = age / currentAnomaly.lifetime;

    if (age > currentAnomaly.lifetime) {
      cleanupAnomaly(currentAnomaly);
      currentAnomaly = null;
      scene.fog = new THREE.Fog(0x222222, 1, 100);
    } else {
      switch (currentAnomaly.type) {
        case 'WEEPING_ANGEL':
          updateWeepingAngel(currentAnomaly, progress);
          break;
      }
    }
  }
}

// === External API ===
/**
 * Spawn an anomaly manually at a given position. Any existing anomaly
 * will be cleared before spawning the new one.
 *
 * @param {string} type The anomaly type ('WEEPING_ANGEL').
 * @param {THREE.Vector3} position The world position at which to spawn the anomaly.
 */
export function spawnAnomalyManual(type, position) {
  if (currentAnomaly) {
    cleanupAnomaly(currentAnomaly);
    currentAnomaly = null;
  }
  if (!type) return;
  spawnAnomaly(type, position);
}

/**
 * Remove the currently active anomaly, if any.
 */
export function clearAnomaly() {
  if (currentAnomaly) {
    cleanupAnomaly(currentAnomaly);
    currentAnomaly = null;
  }
}

// === WEEPING ANGEL ===
function createWeepingAngel(a) {
  // Configuration
  const SPAWN_OFFSET = new THREE.Vector3(2.96, 2, 4); // Spawn at the end of the room (relative to center)
  const INITIAL_ROTATION_Y = -Math.PI / 2; // 90 degrees

  // Load the Weeping Angel model
  const loader = new GLTFLoader();
  loader.load(
    'models/weeping angel statue.glb',
    gltf => {
      const model = gltf.scene;
      model.scale.set(1, 1, 1);

      // Determine player direction to handle backward movement
      const playerDir = getPlayerDirection();
      const isMovingBackward = playerDir.z > 0;

      // Calculate final offset and rotation
      const finalOffset = SPAWN_OFFSET.clone();
      let finalRotation = INITIAL_ROTATION_Y;

      if (isMovingBackward) {
        // Mirror position and flip rotation for backward movement
        finalOffset.x *= -1;
        finalOffset.z *= -1;
        finalRotation += Math.PI;
      }

      // Position: Apply offset to the room center (a.position)
      model.position.copy(a.position).add(finalOffset);
      model.position.y = 0.2; // Initial Y position

      // Rotation: Apply initial rotation
      model.rotation.y = finalRotation;

      scene.add(model);
      a.meshes.push(model);

      // Store state
      a.state = {
        active: false, // Becomes active when player reaches half room
        speed: 1.5, // "slowly not very fast"
        lastPos: model.position.clone(),
        roomCenter: a.position.clone(), // Store room center for activation check
        activationDistance: 2.0, // Configurable offset: smaller = deeper into room
        timeNotLooking: 0, // Timer for delay
        hasDropped: false, // Track if it has dropped to floor
        dropY: -1, // Target Y position when moving
        isPlayingSound: false,
        currentSound: null
      };
    },
    undefined,
    error => {
      console.error('An error happened loading Weeping Angel:', error);
    }
  );
}

function updateWeepingAngel(a, progress) {
  if (!a.meshes.length || !a.state) return;

  const angel = a.meshes[0];
  const playerPos = getCameraPosition();
  const playerDir = getPlayerDirection();

  // 1. Check if player reached half the room (activation trigger)
  const distToCenter = playerPos.distanceTo(a.state.roomCenter);

  if (!a.state.active) {
    // Activate if player is within some distance of the center
    // User requested "deeper into the room", so we use the configurable activationDistance
    if (distToCenter < a.state.activationDistance) {
      a.state.active = true;
      console.log('Weeping Angel ACTIVATED');
    }
  }

  if (a.state.active) {
    // 2. Check visibility
    const toAngel = new THREE.Vector3().subVectors(angel.position, playerPos).normalize();
    const dot = playerDir.dot(toAngel);
    const isLooking = dot > 0.4;

    if (!isLooking) {

      // Better: use performance.now() diff if possible, but for now let's use a small increment.
      a.state.timeNotLooking += 1 / 60;

      if (a.state.timeNotLooking > 1.0) {
        // 3. Movement Logic

        // Drop to floor if not already dropped
        if (!a.state.hasDropped) {
          angel.position.y = a.state.dropY;
          a.state.hasDropped = true;
        }

        // Move towards player
        const moveDir = new THREE.Vector3().subVectors(playerPos, angel.position).normalize();
        moveDir.y = 0;

        const moveStep = moveDir.multiplyScalar(a.state.speed * 0.02);
        angel.position.add(moveStep);

        // Make angel face the player
        angel.lookAt(playerPos.x, angel.position.y, playerPos.z);

        // Play sound if not playing
        if (!a.state.isPlayingSound) {
          // "simple string + rand[1,2] type of situation"
          const randNum = Math.floor(Math.random() * 2) + 1;
          const soundPath = `sounds/sliding_sound${randNum}.mp3`;

          const sound = new Audio(soundPath);
          sound.volume = 0.6;
          sound.play().catch(e => console.warn("Audio play failed", e));

          a.state.isPlayingSound = true;
          a.state.currentSound = sound;

          // Reset flag when sound ends
          sound.onended = () => {
            a.state.isPlayingSound = false;
            a.state.currentSound = null;
          };
        }

        // Stop if too close
        if (playerPos.distanceTo(angel.position) < 1.0) {
          angel.position.sub(moveStep);
        }
      }
    } else {
      // Reset timer if looking
      a.state.timeNotLooking = 0;
      // Optional: Stop sound if looking? "Statue freezes".
      // The user didn't explicitly say stop sound, but it makes sense for a weeping angel.
      // Let's pause sounds.
      if (a.state.currentSound && !a.state.currentSound.paused) {
        a.state.currentSound.pause();
        a.state.isPlayingSound = false;
      }
    }
  }
}



