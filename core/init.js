import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { handDetector } from './hand-gestures.js';

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
  camera.position.set(0, 0, 1);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  // Resize handling (use shared handler)
  window.addEventListener('resize', onWindowResize);

  // Lights
  // Very dim ambient light to prevent absolute pitch blackness
  const ambientLight = new THREE.AmbientLight(0x111111);
  scene.add(ambientLight);
}

//////////////////////////////////////

const keys = {};
let moveSpeed = 0.05;
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
        handMovement = isHandOpen ? moveSpeed : 0;
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

// Update movement every frame
export function updateMovement() {
  if (!renderer || !camera) return;

  const moveTarget = renderer.xr.isPresenting && dolly ? dolly : camera;

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
      dolly.position.addScaledVector(forward, handMovement);
    }
  }
  

  // --- Desktop WASD movement ---
  if (!renderer.xr.isPresenting) {
    if (keys['z'] || keys['arrowup'])
      moveTarget.position.addScaledVector(forward, moveSpeed);
    if (keys['s'] || keys['arrowdown'])
      moveTarget.position.addScaledVector(forward, -moveSpeed);
    if (keys['q'] || keys['arrowleft'])
      moveTarget.position.addScaledVector(right, moveSpeed);
    if (keys['d'] || keys['arrowright'])
      moveTarget.position.addScaledVector(right, -moveSpeed);
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
  dolly.position.set(0, -1.2, 0);
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
