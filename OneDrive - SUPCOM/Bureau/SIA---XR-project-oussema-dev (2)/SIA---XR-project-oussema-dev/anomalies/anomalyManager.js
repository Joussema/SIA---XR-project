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

// Dire stone specific variables
let direStoneWarning = null;
let playerDirectionAtWarning = null;
let warningStartTime = null;
const WARNING_DURATION = 5000; // 5 seconds to change direction

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
    case 'DIRE_STONE':
      createDireStone(anomaly);
      break;
    case 'FIRE_BLOCKADE':
      createFireBlockade(anomaly, getCameraPosition());
      break;
    case 'DEMON':
      createDemon(anomaly);
      break;
    case 'VOID':
      createVoid(anomaly);
      break;
    case 'WEEPING_ANGEL':
      createWeepingAngel(anomaly);
      break;
  }

  currentAnomaly = anomaly;
}

// === DIRE STONE ===
function createDireStone(a) {
  const textureLoader = new THREE.TextureLoader();
  const stoneTexture = textureLoader.load('images/fire.png');

  const stoneMaterial = new THREE.SpriteMaterial({
    map: stoneTexture,
    transparent: true,
    opacity: 0.9
  });

  const stone = new THREE.Sprite(stoneMaterial);
  stone.scale.set(1, 1, 1);
  stone.position.copy(a.position);

  scene.add(stone);
  a.meshes.push(stone);

  const light = new THREE.PointLight(0xff3300, 1, 8);
  light.position.copy(a.position);
  scene.add(light);
  a.lights.push(light);

  // Store warning state
  direStoneWarning = a;
  playerDirectionAtWarning = getPlayerDirection();
  warningStartTime = Date.now();

  console.log('Dire Stone appears at position:', a.position);
  console.log('Change direction within 5 seconds!');
}

function updateDireStone(a, progress) {
  const stone = a.meshes[0];
  const light = a.lights[0];

  if (stone) {
    // Flicker opacity
    stone.material.opacity = 0.7 + Math.sin(progress * 20) * 0.3;
  }

  // Flicker lights
  if (light) {
    light.intensity = 1 + Math.sin(progress * 15) * 0.5;
  }
}

// === FIRE BLOCKADE ===
function createFireBlockade(a, playerPos) {
  const forward = getPlayerDirection();
  const frontFireStart = playerPos.clone().add(forward.clone().multiplyScalar(2));
  const frontFireEnd = playerPos.clone().add(forward.clone().multiplyScalar(6));

  const backward = forward.clone().multiplyScalar(-1);
  const backFireStart = playerPos.clone().add(backward.clone().multiplyScalar(2));
  const backFireEnd = playerPos.clone().add(backward.clone().multiplyScalar(6));

  // Reduced fire count from 20 to 10 for better performance
  a.fireGroups.push(createFire(frontFireStart, frontFireEnd, 10));
  a.fireGroups.push(createFire(backFireStart, backFireEnd, 10));

  const blockadeLight = new THREE.PointLight(0xff0000, 2, 15);
  blockadeLight.position.copy(playerPos);
  scene.add(blockadeLight);
  a.lights.push(blockadeLight);

  console.log("FIRE BLOCKADE! You're trapped!");
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

  // Handle dire stone warning timeout
  if (direStoneWarning && warningStartTime) {
    const warningAge = now - warningStartTime;
    if (warningAge > WARNING_DURATION) {
      const currentDirection = getPlayerDirection();
      const hasChanged = hasPlayerChangedDirection(
        playerDirectionAtWarning,
        currentDirection
      );

      if (!hasChanged) {
        console.log("Player didn't change direction! Spawning fire blockade!");
        if (currentAnomaly) {
          cleanupAnomaly(currentAnomaly);
          currentAnomaly = null;
        }
        spawnAnomaly('FIRE_BLOCKADE', getCameraPosition());
      } else {
        console.log('Player changed direction! Dire stone warning cleared.');
      }

      direStoneWarning = null;
      playerDirectionAtWarning = null;
      warningStartTime = null;
    }
  }

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
        case 'DIRE_STONE':
          updateDireStone(currentAnomaly, progress);
          break;
        case 'FIRE_BLOCKADE':
        case 'FIRE':
          updateFire(currentAnomaly, progress);
          break;
        case 'DEMON':
          updateDemon(currentAnomaly, progress);
          break;
        case 'VOID':
          updateVoid(currentAnomaly, progress);
          break;
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
 * @param {string} type The anomaly type ('DIRE_STONE', 'FIRE_BLOCKADE', 'DEMON', 'VOID', 'WEEPING_ANGEL').
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

// === FIRE ===
function createFire(startPos, endPos, count = 15) {
  const fireGroup = {
    meshes: [],
    lights: []
  };

  const textureLoader = new THREE.TextureLoader();
  const fireTexture = textureLoader.load('images/flame.png');

  const direction = new THREE.Vector3().subVectors(endPos, startPos).normalize();
  const totalDistance = startPos.distanceTo(endPos);
  const spacing = totalDistance / (count - 1);

  for (let i = 0; i < count; i++) {
    const fireMaterial = new THREE.SpriteMaterial({
      map: fireTexture,
      color: 0xffaa00,
      transparent: true,
      blending: THREE.AdditiveBlending
    });

    const fire = new THREE.Sprite(fireMaterial);
    fire.scale.set(2, 2, 2);
    fire.position.copy(startPos).add(direction.clone().multiplyScalar(i * spacing));
    scene.add(fire);
    fireGroup.meshes.push(fire);

    const fireLight = new THREE.PointLight(0xff6600, 1.5, 5);
    fireLight.position.copy(fire.position);
    scene.add(fireLight);
    fireGroup.lights.push(fireLight);
  }

  return fireGroup;
}

function updateFire(a, progress) {
  if (!a.fireGroups) return;

  a.fireGroups.forEach(fireGroup => {
    fireGroup.meshes.forEach((fire, i) => {
      // Flicker opacity
      fire.material.opacity = 0.7 + Math.sin(progress * 20 + i) * 0.3;

      // Slight scale flicker
      const scale = 3 + 0.2 * Math.sin(progress * 10 + i);
      fire.scale.set(scale, scale, 1);

      // Flicker lights
      if (fireGroup.lights && fireGroup.lights[i]) {
        fireGroup.lights[i].intensity = 1.5 + Math.sin(progress * 20 + i) * 0.5;
      }
    });
  });
}

// === DEMON ===
function createDemon(a) {
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.5, 2, 8),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  body.position.copy(a.position);
  body.position.y = 1;
  scene.add(body);
  a.meshes.push(body);

  const eyeGeo = new THREE.SphereGeometry(0.1, 6, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });

  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(a.position.x - 0.2, a.position.y + 1.5, a.position.z + 0.3);
  scene.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(a.position.x + 0.2, a.position.y + 1.5, a.position.z + 0.3);
  scene.add(rightEye);

  a.meshes.push(leftEye, rightEye);

  const light = new THREE.PointLight(0xff0000, 1.5, 10);
  light.position.copy(a.position);
  light.position.y = 1.5;
  scene.add(light);
  a.lights.push(light);

  scene.fog = new THREE.Fog(0x330000, 8, 18);
}

function updateDemon(a, progress) {
  const playerPos = getCameraPosition();

  const body = a.meshes[0];
  const leftEye = a.meshes[1];
  const rightEye = a.meshes[2];
  const light = a.lights[0];

  if (!body) return;

  // Move whole demon towards the player
  const dir = playerPos.clone().sub(body.position).normalize();
  const step = dir.multiplyScalar(0.02);

  body.position.add(step);
  if (leftEye) leftEye.position.add(step);
  if (rightEye) rightEye.position.add(step);
  if (light) light.position.add(step);

  // Make demon face the player horizontally
  const angleY = Math.atan2(
    playerPos.x - body.position.x,
    playerPos.z - body.position.z
  );
  body.rotation.y = angleY;

  // Blink eyes
  const blink = Math.sin(progress * 30) > 0.8;
  if (leftEye) leftEye.material.color.setHex(blink ? 0x000000 : 0xff0000);
  if (rightEye) rightEye.material.color.setHex(blink ? 0x000000 : 0xff0000);
}

// === VOID ===
function createVoid(a) {
  const voidSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x000011, transparent: true, opacity: 0.9 })
  );
  voidSphere.position.copy(a.position);
  scene.add(voidSphere);
  a.meshes.push(voidSphere);

  const light = new THREE.PointLight(0x330066, 1.2, 12);
  light.position.copy(a.position);
  scene.add(light);
  a.lights.push(light);

  scene.fog = new THREE.Fog(0x000011, 5, 15);
}

function updateVoid(a, progress) {
  if (a.meshes[0]) {
    a.meshes[0].scale.setScalar(1 + Math.sin(progress * 10) * 0.2);
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


