import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { handDetector } from './hand-gestures.js';

import { collisionSystem } from '../environment/collisionSystem.js';
//f
export let scene, camera, renderer;

export function initScene() {
  // Scene
  scene = new THREE.Scene();
  // Horror Fog: Black and close
  scene.fog = new THREE.Fog(0x000000, 2, 15);

  // Camera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  // User requested "spawn at 2 tiles higher" -> Y=2
  camera.position.set(0, -0.7, 1);

  // Renderer with MAXIMUM performance optimizations
  renderer = new THREE.WebGLRenderer({
    antialias: false, // Disable antialiasing for performance
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
    logarithmicDepthBuffer: false
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(1); // Force 1x pixel ratio for maximum FPS
  renderer.xr.enabled = true;

  // Disable ALL expensive features
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.autoUpdate = false;
  renderer.sortObjects = false;
  renderer.autoClear = true;

  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  // Resize handling (use shared handler)
  window.addEventListener('resize', onWindowResize);

  // Lights
  // Very dim ambient light to prevent absolute pitch blackness
  const ambientLight = new THREE.AmbientLight(0x111111);
  scene.add(ambientLight);

  console.log('🚀 Scene initialized - MAXIMUM PERFORMANCE MODE');
}

//////////////////////////////////////

const keys = {};
let moveSpeed = 0.05;
let xrMoveSpeed = 0.1; // Faster movement speed for XR mode
let handMovement = 0;
let isHandDetectionInitialized = false;

// Initialize hand detection - ONLY IN VR MODE
export async function initializeHandDetection() {
  try {
    const success = await handDetector.initialize();
    if (success) {
      handDetector.setHandStateCallback((isHandOpen) => {
        // OPEN HAND = MOVE FORWARD
        // CLOSED/NO HAND = STOP
        handMovement = isHandOpen ? xrMoveSpeed : 0;
        console.log('Hand control:', isHandOpen ? 'OPEN → FORWARD' : 'CLOSED → STOP');
      });

      console.log('Hand detection initialized - Ready for movement control');
      isHandDetectionInitialized = true;
      return true;
    }
  } catch (error) {
    console.warn('Hand detection failed:', error);
    isHandDetectionInitialized = false;
    return false;
  }
}

// Stop hand detection when exiting VR
export function stopHandDetection() {
  if (isHandDetectionInitialized) {
    handDetector.stopDetection();
    isHandDetectionInitialized = false;
    handMovement = 0;
    console.log('Hand detection stopped');
  }
}

// Setup keyboard + mouse controls
export function setupControls() {
  document.addEventListener(
    'keydown',
    (e) => (keys[e.key.toLowerCase()] = true)
  );
  document.addEventListener(
    'keyup',
    (e) => (keys[e.key.toLowerCase()] = false)
  );

  if (!renderer) {
    console.warn(
      'setupControls() called before initScene(). Call initScene() first.'
    );
    return;
  }

  // Demander le pointer lock quand on clique sur le canvas
  renderer.domElement.addEventListener('click', () => {
    if (!renderer.xr.isPresenting) {
      renderer.domElement.requestPointerLock();
    }
  });

  // Gérer le changement de pointer lock
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === renderer.domElement) {
      document.addEventListener('mousemove', onMouseMove);
    } else {
      document.removeEventListener('mousemove', onMouseMove);
    }
  });

  function onMouseMove(e) {
    if (!renderer.xr.isPresenting) {
      // Utiliser les mouvements relatifs (movementX/Y) au lieu de la position absolue
      const sensitivity = 0.002;

      camera.rotation.y -= e.movementX * sensitivity;
      camera.rotation.x -= e.movementY * sensitivity;

      // Limiter la rotation verticale pour éviter de se retourner
      camera.rotation.x = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, camera.rotation.x)
      );
    }
  }
}

// Freeze state
let isFrozen = false;
let forcedTarget = null;

export function freezePlayerAt(targetPos) {
  isFrozen = true;
  forcedTarget = targetPos ? targetPos.clone() : null;
  console.log("Player frozen. Target:", forcedTarget);
}

export function unfreezePlayer() {
  isFrozen = false;
  forcedTarget = null;
  console.log("Player unfrozen.");
}

// Update movement every frame
export function updateMovement() {
  if (!renderer || !camera) return;

  const moveTarget = renderer.xr.isPresenting && dolly ? dolly : camera;
  const currentPosition = moveTarget.position.clone();

  // --- FREEZE / FORCED MOVEMENT ---
  if (isFrozen) {
    if (forcedTarget) {
      // Smoothly move towards target (Simple Lerp)
      // We modify the position directly, bypassing collision to ensure we reach the target
      // Preserving Y if needed, but user asked to move 'in place of door'. 
      // Assuming targetPos includes desired Y.
      moveTarget.position.lerp(forcedTarget, 0.005); // 0.005 = Very slow, gentle movement
    }
    // Return early to prevent WASD/Hand movement
    return;
  }

  // Get camera direction for movement
  const cameraWorldDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraWorldDirection);

  // Mouvement horizontal seulement (Y = 0)
  const forward = new THREE.Vector3(
    cameraWorldDirection.x,
    0,
    cameraWorldDirection.z
  ).normalize();
  const right = new THREE.Vector3(
    forward.z,
    0,
    -forward.x
  ).normalize();

  // --- HAND GESTURE MOVEMENT (VR MODE ONLY) ---
  if (renderer.xr.isPresenting && dolly && isHandDetectionInitialized) {
    if (handMovement !== 0) {
      const newPosition = currentPosition.clone();
      newPosition.addScaledVector(forward, handMovement);

      // Utilise la NOUVELLE méthode
      if (!collisionSystem.checkWallCollision(newPosition, currentPosition)) {
        dolly.position.copy(newPosition);
      }
    }
  }

  // --- Desktop WASD movement ---
  if (!renderer.xr.isPresenting) {
    let wantsToMove = false;
    let direction = new THREE.Vector3(0, 0, 0);

    if (keys['z'] || keys['arrowup']) {
      direction.add(forward);
      wantsToMove = true;
    }
    if (keys['s'] || keys['arrowdown']) {
      direction.sub(forward);
      wantsToMove = true;
    }
    if (keys['q'] || keys['arrowleft']) {
      direction.add(right);
      wantsToMove = true;
    }
    if (keys['d'] || keys['arrowright']) {
      direction.sub(right);
      wantsToMove = true;
    }

    if (wantsToMove) {
      direction.normalize();
      const newPosition = currentPosition.clone();
      newPosition.addScaledVector(direction, moveSpeed);

      // Utilise la NOUVELLE méthode
      if (!collisionSystem.checkWallCollision(newPosition, currentPosition)) {
        moveTarget.position.copy(newPosition);
      }
    }

    // Up/Down movement
    if (keys[' ']) moveTarget.position.y += moveSpeed;
    if (keys['shift']) moveTarget.position.y -= moveSpeed;
  }
}

//////////////////////////////////

let controller1, controller2;
export let dolly;

export async function onButtonClicked() {
  try {
    if (!navigator.xr) {
      throw new Error('WebXR not supported in this browser');
    }

    const session = await navigator.xr.requestSession(
      'immersive-vr',
      {
        optionalFeatures: ['local-floor'],
      }
    );

    // START VR SESSION FIRST
    await renderer.xr.setSession(session);
    console.log('VR session started');

    // WAIT A BIT FOR VR TO SETTLE, THEN START HAND DETECTION
    await new Promise(resolve => setTimeout(resolve, 500));

    // NOW START HAND DETECTION
    console.log('Starting hand detection for VR mode...');
    await initializeHandDetection();

    session.addEventListener('end', () => {
      console.log('VR session ended');
      stopHandDetection();
    });

  } catch (error) {
    console.error('Error starting VR session:', error);
    alert('Failed to start VR session: ' + error.message);
  }
}

// SIMPLIFIED VR Setup - No controller movement, just head tracking
export function setupVR() {
  if (!renderer || !scene || !camera) {
    console.warn('setupVR() called before initScene(). Call initScene() first.');
    return;
  }

  // Dolly (camera rig for head tracking only)
  dolly = new THREE.Group();
  // VR: previously -1.2, added 2.0 -> 0.8
  dolly.position.set(0, 0.8, 0);
  dolly.add(camera);
  scene.add(dolly);

  // NO CONTROLLERS - Movement is handled by hand detection only
  console.log('VR setup complete - Movement controlled by hand gestures');
}



//export function onSelectStart(event) {
//  event.target.userData.isSelecting = true;
//}

//export function onSelectEnd(event) {
//  event.target.userData.isSelecting = false;
//}

export function onWindowResize() {
  if (!camera || !renderer) return;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}




// Get hand detection state
export function getHandDetectionState() {
  return handDetector.getHandState();
}

// Clean up
export function cleanup() {
  handDetector.stopDetection();
}
