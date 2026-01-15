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
  // Desktop mode position
  camera.position.set(0, 1, 1);

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
let moveSpeed = 0.05; // WASD movement speed
let xrMoveSpeed = 0.05; // Faster movement speed for XR mode
let handMovement = 0;
let isHandDetectionInitialized = false;
let isIndexPointing = false;
let onIndexSelectCallback = null;
let lastIndexState = false; // Track previous state for edge detection

// XR Cursor for selection
let xrCursor = null;
let xrRaycaster = null;
const XR_CURSOR_DISTANCE = 3; // Distance of cursor from camera

// Initialize hand detection - ONLY IN VR MODE
export async function initializeHandDetection() {
  try {
    const success = await handDetector.initialize();
    if (success) {
      handDetector.setHandStateCallback((handState) => {
        const { isHandOpen, isIndexOnly } = handState;
        
        // OPEN HAND = MOVE FORWARD
        // CLOSED/NO HAND = STOP
        handMovement = isHandOpen ? xrMoveSpeed : 0;
        
        // INDEX ONLY = SELECT (like a click)
        // Detect rising edge (transition from not pointing to pointing)
        if (isIndexOnly && !lastIndexState) {
          console.log('Hand control: INDEX → SELECT (click)');
          isIndexPointing = true;
          // Trigger click for puzzle and other systems
          window.wasClicked = true;
          if (onIndexSelectCallback) {
            onIndexSelectCallback();
          }
        } else {
          isIndexPointing = isIndexOnly;
        }
        lastIndexState = isIndexOnly;
        
        if (isHandOpen) {
          console.log('Hand control: OPEN → FORWARD');
        } else if (!isIndexOnly) {
          console.log('Hand control: CLOSED → STOP');
        }
      });

      console.log('Hand detection initialized - Ready for movement and selection control');
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
    isIndexPointing = false;
    lastIndexState = false;
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
  // VR: 
  dolly.position.set(0, -1.3, 0);
  dolly.add(camera);
  scene.add(dolly);

  // Create XR cursor (small ring that follows head direction)
  createXRCursor();

  // Create XR raycaster
  xrRaycaster = new THREE.Raycaster();

  // NO CONTROLLERS - Movement is handled by hand detection only
  console.log('VR setup complete - Movement controlled by hand gestures');
}

// Create visual cursor for XR mode
function createXRCursor() {
  // Create a ring geometry for the cursor
  const ringGeometry = new THREE.RingGeometry(0.015, 0.025, 32);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
    depthTest: false
  });
  
  xrCursor = new THREE.Mesh(ringGeometry, ringMaterial);
  xrCursor.renderOrder = 9999; // Always render on top
  xrCursor.visible = false; // Hidden until XR mode
  
  // Add a small dot in the center
  const dotGeometry = new THREE.CircleGeometry(0.005, 16);
  const dotMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthTest: false
  });
  const dot = new THREE.Mesh(dotGeometry, dotMaterial);
  dot.position.z = 0.001; // Slightly in front of ring
  xrCursor.add(dot);
  
  scene.add(xrCursor);
  console.log('XR cursor created');
}

// Update XR cursor position (call this in render loop)
export function updateXRCursor() {
  if (!renderer || !renderer.xr.isPresenting || !xrCursor || !camera) {
    if (xrCursor) xrCursor.visible = false;
    return;
  }
  
  // Show cursor in XR mode
  xrCursor.visible = true;
  
  // Get camera world position and direction
  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  camera.getWorldDirection(camDir);
  
  // Position cursor in front of camera
  const cursorPos = camPos.clone().add(camDir.multiplyScalar(XR_CURSOR_DISTANCE));
  xrCursor.position.copy(cursorPos);
  
  // Make cursor face the camera
  xrCursor.lookAt(camPos);
  
  // Update XR raycaster to follow head direction
  if (xrRaycaster) {
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);
    xrRaycaster.set(camPos, camDir);
  }
}

// Get the XR raycaster for use in other modules
export function getXRRaycaster() {
  return xrRaycaster;
}

// Check if in XR mode
export function isInXRMode() {
  return renderer && renderer.xr.isPresenting;
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
  return {
    ...handDetector.getHandState(),
    isIndexPointing: isIndexPointing
  };
}

// Set callback for index finger selection (like click in XR mode)
export function setIndexSelectCallback(callback) {
  onIndexSelectCallback = callback;
  console.log('Index select callback registered for XR mode');
}

// Check if index is currently pointing (for continuous detection)
export function isIndexSelecting() {
  return isIndexPointing;
}

// Clean up
export function cleanup() {
  handDetector.stopDetection();
  onIndexSelectCallback = null;
}
