import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

export let scene, camera, renderer;

export function initScene() {
  // Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x222222, 1, 100);

  // Camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 1);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  // Resize handling
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}



//////////////////////////////////////


const keys = {};
let moveSpeed = 0.05;

// Setup keyboard + mouse controls
export function setupControls() {
  document.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
  document.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

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
      camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, camera.rotation.x));
    }
  }
}

// Update movement every frame
export function updateMovement() {
  const moveTarget = renderer.xr.isPresenting ? dolly : camera;
  
  // TOUJOURS utiliser la direction de la CAMÉRA pour le mouvement
  const cameraWorldDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraWorldDirection);
  
  // Mouvement horizontal seulement (Y = 0)
  const forward = new THREE.Vector3(cameraWorldDirection.x, 0, cameraWorldDirection.z).normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize(); // Perpendiculaire à forward

  // --- VR movement (controller thumbstick) ---
  if (renderer.xr.isPresenting && controller1) {
    const session = renderer.xr.getSession();
    if (session) {
      for (const inputSource of session.inputSources) {
        const gamepad = inputSource.gamepad;
        if (gamepad && gamepad.axes.length >= 4) {
          const [axisX, axisY] = [gamepad.axes[2] || gamepad.axes[0], gamepad.axes[3] || gamepad.axes[1]];
          if (Math.abs(axisX) > 0.1 || Math.abs(axisY) > 0.1) {
            // MAINTENANT: Tous les mouvements sont relatifs à la direction de la tête
            dolly.position.addScaledVector(forward, -axisY * moveSpeed); // Avant/arrière
            dolly.position.addScaledVector(right, -axisX * moveSpeed);    // Gauche/droite
          }
        }
      }
    }
  }

  // --- Desktop WASD movement ---
  if (!renderer.xr.isPresenting) {
    if (keys['z'] || keys['arrowup']) moveTarget.position.addScaledVector(forward, moveSpeed);
    if (keys['s'] || keys['arrowdown']) moveTarget.position.addScaledVector(forward, -moveSpeed);
    if (keys['d'] || keys['arrowleft']) moveTarget.position.addScaledVector(right, moveSpeed);
    if (keys['q'] || keys['arrowright']) moveTarget.position.addScaledVector(right, -moveSpeed);
    if (keys[' ']) moveTarget.position.y += moveSpeed;
    if (keys['shift']) moveTarget.position.y -= moveSpeed;
  }
}

//////////////////////////////////

let controller1, controller2;
export let dolly;

export async function onButtonClicked() {
  try {
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'hand-tracking']
    });

    session.addEventListener('end', () => console.log('VR session ended'));
    await renderer.xr.setSession(session);
  } catch (error) {
    console.error('Error starting VR session:', error);
    alert('Failed to start VR session: ' + error.message);
  }
}

export function setupVRControllers() {
  // Dolly (camera rig)
  dolly = new THREE.Group();
  dolly.position.set(0, -1.2, 0);
  dolly.add(camera);
  scene.add(dolly);

  // Controller setup helper
  function setupController(index) {
    const controller = renderer.xr.getController(index);
    controller.addEventListener('selectstart', onSelectStart);
    controller.addEventListener('selectend', onSelectEnd);
    controller.addEventListener('connected', (event) => controller.add(buildController(event.data)));
    controller.addEventListener('disconnected', function() { this.remove(this.children[0]); });
    dolly.add(controller);
    return controller;
  }

  controller1 = setupController(0);
  controller2 = setupController(1);
}

export function buildController(data) {
  let geometry, material;
  if (data.targetRayMode === 'tracked-pointer') {
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3));
    material = new THREE.LineBasicMaterial({ color: 0xffffff });
    return new THREE.Line(geometry, material);
  }
  if (data.targetRayMode === 'gaze') {
    geometry = new THREE.RingGeometry(0.02, 0.04, 32).translate(0, 0, -1);
    material = new THREE.MeshBasicMaterial({ opacity: 0.5, transparent: true });
    return new THREE.Mesh(geometry, material);
  }
}

export function onSelectStart(event) {
  event.target.userData.isSelecting = true;
}

export function onSelectEnd(event) {
  event.target.userData.isSelecting = false;
}
export function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}