import * as THREE from 'three';
import { renderer, camera, scene, dolly } from '../core/init.js';

let currentAnomaly = null;
let lastSpawnTime = 0;
const ANOMALY_PERIOD = 10000; // every 10 seconds

// === MANUAL CONFIGURATION - SET THESE VALUES ===
const MANUAL_EVENT = "DEMON"; // Change to: "DIRE_STONE", "FIRE_BLOCKADE", "DEMON", "VOID"
const MANUAL_STONE_POSITION = new THREE.Vector3(0, -1,-3); // Set your desired position here (x, y, z)
// ==============================================

// Dire stone specific variables
let direStoneWarning = null;
let playerDirectionAtWarning = null;
let warningStartTime = null;
const WARNING_DURATION = 5000; // 5 seconds to change direction

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
    position: position.clone(), // Use the manually specified position
    fireGroups: [],
    meshes: [],
    lights: [],
    lifetime: 8000,
    createdAt: Date.now()
  };

  switch (type) {
    case "DIRE_STONE":
      createDireStone(anomaly);
      break;
    case "FIRE_BLOCKADE":
      createFireBlockade(anomaly, getCameraPosition());
      break;
    case "DEMON":
      createDemon(anomaly);
      break;
    case "VOID":
      createVoid(anomaly);
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
  stone.position.copy(a.position); // Uses the static position you set
  
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
  
  console.log("Dire Stone appears at position:", a.position);
  console.log("Change direction within 5 seconds!");
}

function updateDireStone(a, progress) {
  const stone = a.meshes[0];
  const light = a.lights[0];
  
  if (stone) {
    // Flicker opacity - similar to fire but using the stone's index (0)
    stone.material.opacity = 0.7 + Math.sin(progress * 20 + 0) * 0.3;

  }

  // Flicker lights - similar to fire
  if (light) {
    light.intensity = 1 + Math.sin(progress * 15 + 0) * 0.5;
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

  a.fireGroups.push(createFire(frontFireStart, frontFireEnd, 20));
  a.fireGroups.push(createFire(backFireStart, backFireEnd, 20));

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

  // Spawn new anomaly periodically using manual configuration
  if (!currentAnomaly && now - lastSpawnTime > ANOMALY_PERIOD) {
    spawnAnomaly(MANUAL_EVENT, MANUAL_STONE_POSITION);
    lastSpawnTime = now;
  }

  // Handle dire stone warning timeout
  if (direStoneWarning && warningStartTime) {
    const warningAge = now - warningStartTime;
    if (warningAge > WARNING_DURATION) {
      const currentDirection = getPlayerDirection();
      const hasChanged = hasPlayerChangedDirection(playerDirectionAtWarning, currentDirection);
      
      if (!hasChanged) {
        console.log("Player didn't change direction! Spawning fire blockade!");
        if (currentAnomaly) {
          cleanupAnomaly(currentAnomaly);
          currentAnomaly = null;
        }
        spawnAnomaly("FIRE_BLOCKADE", getCameraPosition());
      } else {
        console.log("Player changed direction! Dire stone warning cleared.");
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
        case "DIRE_STONE":
          updateDireStone(currentAnomaly, progress);
          break;
        case "FIRE_BLOCKADE":
          updateFire(currentAnomaly, progress);
          break;
        case "FIRE":
          updateFire(currentAnomaly, progress);
          break;
        case "DEMON":
          updateDemon(currentAnomaly, progress);
          break;
        case "VOID":
          updateVoid(currentAnomaly, progress);
          break;
      }
    }
  }
}

// 

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
      blending: THREE.AdditiveBlending,
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
  a.meshes[0].scale.setScalar(1 + Math.sin(progress * 10) * 0.2);
}