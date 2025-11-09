import * as THREE from 'three';
import { renderer, camera, scene,dolly } from '../core/init.js';



let currentAnomaly = null;
let lastSpawnTime = 0;
const ANOMALY_PERIOD = 10000; // every 10 seconds
const TEST_EVENT = "FIRE"; // change to "DEMON" or "VOID"

// === Utility ===
function getCameraPosition() {
  if (renderer.xr?.isPresenting && dolly) return dolly.position.clone();
  return camera.position.clone();
}



// === SPAWN ===
function spawnAnomaly(type) {
  const playerPos = getCameraPosition();

   const startPos = new THREE.Vector3(0, 0, -10); // fire start
  const endPos = new THREE.Vector3(0, 0, -20);  // fire end

  const anomaly = {
    type,
    position: playerPos.clone(),
    meshes: [],
    lights: [],
    lifetime: 8000,
    createdAt: Date.now()
  };
  
  switch (type) {
    case "FIRE":
       createFire(anomaly, startPos, endPos, 20);;
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

// === CLEANUP ===
function cleanupAnomaly(a) {
  a.meshes.forEach(m => scene.remove(m));
  a.lights.forEach(l => scene.remove(l));
}






// === Main update loop ===
export function updateAnomalies() {
  const now = Date.now();

  // Spawn new anomaly periodically
  if (!currentAnomaly && now - lastSpawnTime > ANOMALY_PERIOD) {
    spawnAnomaly(TEST_EVENT);
    lastSpawnTime = now;
  }

  // Update and remove after lifetime
  if (currentAnomaly) {
    const age = now - currentAnomaly.createdAt;
    const progress = age / currentAnomaly.lifetime;

    if (age > currentAnomaly.lifetime) {
      cleanupAnomaly(currentAnomaly);
      currentAnomaly = null;
      scene.fog = null;
    } else {
      switch (TEST_EVENT) {
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



//fire    
 function createFire(a, startPos, endPos, count = 15) {
  a.meshes = [];
  a.lights = [];

  const textureLoader = new THREE.TextureLoader();
  const fireTexture = textureLoader.load('images/flame.png');

  // Calculate direction and spacing automatically
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

    // Position fire along the line from startPos to endPos
    fire.position.copy(startPos).add(direction.clone().multiplyScalar(i * spacing));

    scene.add(fire);
    a.meshes.push(fire);

    // Optional: add a point light
    const fireLight = new THREE.PointLight(0xff6600, 1.5, 5);
    fireLight.position.copy(fire.position);
    scene.add(fireLight);
    a.lights.push(fireLight);
  }
}


 function updateFire(a, progress) {
  if (!a.meshes) return;

  a.meshes.forEach((fire, i) => {
    // Flicker opacity
    fire.material.opacity = 0.7 + Math.sin(progress * 20 + i) * 0.3;

    // Slight scale flicker
    const scale = 3 + 0.2 * Math.sin(progress * 10 + i);
    fire.scale.set(scale, scale, 1);

    // Flicker lights
    if (a.lights && a.lights[i]) {
      a.lights[i].intensity = 1.5 + Math.sin(progress * 20 + i) * 0.5;
    }
  });
}





// other anomalies to be created

// 👹 DEMON
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
  const dir = playerPos.clone().sub(a.meshes[0].position).normalize();
  a.meshes[0].position.add(dir.multiplyScalar(0.02));

  const blink = Math.sin(progress * 30) > 0.8;
  a.meshes[1].material.color.setHex(blink ? 0x000000 : 0xff0000);
  a.meshes[2].material.color.setHex(blink ? 0x000000 : 0xff0000);
}

// 🕳️ VOID
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

