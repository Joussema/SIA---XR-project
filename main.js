//import { initScene, renderer, camera, scene, setupVRControllers, onButtonClicked, onWindowResize, updateMovement, setupControls, dolly } from './core/init.js';
import { initScene, renderer, camera, scene, setupVR, onButtonClicked, onWindowResize,updateMovement,  setupControls, dolly } from './core/init.js';
import * as THREE from 'three';
import { setupFlashlight } from './game/flashlight.js';
import { setupAudio, playSound, playPositionalSound, prefetchSound, prefetchModel } from './game/audioManager.js';

// Exit8 step-based imports
import { GameManager } from './game/gameManager.js';
import {
  initDynamicWorld,
  buildWorldForBlueprint,
  getDecisionForPlayer,
  getBufferInstance,
  getRoomInstance,
} from './environment/dynamicWorld.js';
import { updateAnomalies, spawnAnomalyManual, clearAnomaly } from './anomalies/anomalyManager.js';


// Create a game manager instance. The GameManager controls logic for
// generating blueprints, tracking the current step and streak, and
// evaluating decisions.
const gameManager = new GameManager();

// UI element for displaying game state and blueprint information.
let infoDiv;



function updateOverlay() {
  if (!infoDiv) return;
  const state = gameManager.getState();
  // Retrieve the blueprint for the current step for display. Note that
  // getBlueprint will generate a blueprint if one does not already
  // exist, but because the current step has not yet advanced past the
  // blueprint used to build the world it will reflect the current
  // layout.
  const bp = gameManager.getBlueprint(state.currentStep);
  
 
  
  infoDiv.innerHTML =
    `<div style="background: rgba(0,0,0,0.5); padding: 8px; font-family: sans-serif;">
      <strong>Step:</strong> ${state.currentStep}<br/>
      <strong>Streak:</strong> ${state.exitCount} / ${state.targetExit}<br/>
      <strong>Forward Room:</strong> ${bp.forwardRoomType}<br/>
      <strong>Backward Room:</strong> ${bp.backwardRoomType}<br/>
      <strong>Anomaly:</strong> ${bp.hasAnomaly ? bp.anomalyType + ' @ ' + bp.anomalyLocation : 'None'}<br/>
      <strong>Expected Decision:</strong> ${bp.expectedDecision}<br/>
      <strong>Last Decision:</strong> ${state.lastDecision ?? '-'}<br/>
      <strong>Last Correct:</strong> ${state.lastCorrect == null ? '-' : state.lastCorrect}
     </div>`;
}

// Prefetch forward/backward models and likely sounds in the background
function prefetchBlueprintAssets(bp) {
  if (!bp) return;
  try {
    prefetchModel(`models/${bp.forwardRoomType}.glb`);
    prefetchModel(`models/${bp.backwardRoomType}.glb`);
    if (bp.hasAnomaly && bp.anomalyType) {
      // Example: if the anomaly type references a specific sound name use that. Map types as needed.
      if (bp.anomalyType === 'DEMON') {
        prefetchSound('fiend breath.mp3');
      }
    }
  } catch (e) { console.warn('Prefetch failed:', e); }
}

function animate() {
  // Calculate FPS
  const currentTime = performance.now();
  frameCount++;
  if (currentTime >= lastTime + 1000) {
    fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
    frameCount = 0;
    lastTime = currentTime;
    // Only update overlay once per second, not every frame
    updateOverlay();
  }
  
  // Update player movement (keyboard or VR) first
  updateMovement();

  // Determine the player object for decision detection (dolly in VR or camera otherwise).
  const playerObj = (renderer.xr?.isPresenting && dolly) ? dolly : camera;
  const playerPos = playerObj.position.clone();

  // Check if the player has made a decision.
  const decision = getDecisionForPlayer(playerPos);
  if (decision) {
    gameManager.registerDecision(decision);
    clearAnomaly();
    const chosenBuffer = getBufferInstance(decision);
    const bp = gameManager.getBlueprint(gameManager.currentStep);
    buildWorldForBlueprint(bp, chosenBuffer);
    if (bp.hasAnomaly) {
      const roomInst = getRoomInstance(bp.anomalyLocation);
      if (roomInst && roomInst.root) {
        const bbox = new THREE.Box3().setFromObject(roomInst.root);
        const pos = new THREE.Vector3();
        bbox.getCenter(pos);
        spawnAnomalyManual(bp.anomalyType, pos);
      }
    }
    updateOverlay();
    // Prefetch assets for the new blueprint in the background (deferred)
    setTimeout(() => prefetchBlueprintAssets(bp), 200);
  }

  // Sound logic - only check every 10 frames for performance
  if (frameCount % 10 === 0) {
    const state = gameManager.getState();
    const bp = gameManager.getBlueprint(state.currentStep);

    if (bp.forwardRoomType === 'scaryladyroom' || bp.forwardRoomType === 'scarygang' || bp.forwardRoomType === 'fiendroom') {
      const forwardRoom = getRoomInstance('forward');
      if (forwardRoom && forwardRoom.root) {
        const roomPos = new THREE.Vector3();
        forwardRoom.root.getWorldPosition(roomPos);
        const dist = playerPos.distanceTo(roomPos);

        if (dist < 10.0) {
          if (!gameManager.soundPlayedForStep) {
            if (bp.forwardRoomType === 'scaryladyroom') {
              playSound('Lady statue.mp3');
            } else if (bp.forwardRoomType === 'scarygang') {
              playSound('Gang sound.mp3');
            } else if (bp.forwardRoomType === 'fiendroom') {
              const soundSource = new THREE.Object3D();
              soundSource.position.set(3, 4, -4);
              forwardRoom.root.add(soundSource);
              playPositionalSound('fiend breath.mp3', soundSource, 5, 20);
            }
            gameManager.soundPlayedForStep = true;
          }
        }
      }
    }

    if (gameManager.lastStepChecked !== state.currentStep) {
      gameManager.soundPlayedForStep = false;
      gameManager.lastStepChecked = state.currentStep;
    }
  }

  // Update anomalies (already throttled internally)
  updateAnomalies();
  
  // Render the scene
  renderer.render(scene, camera);
}
// Expose for debugging and manual prefetching via console.
window.prefetchBlueprintAssets = prefetchBlueprintAssets;

// === MAIN INIT ===
// Wrap startup in an async function to allow awaiting GLB loading.
async function start() {
  // Initialise Three.js scene, camera and renderer.
  initScene();
  setupFlashlight(camera);
  setupAudio(camera);
  // Load room templates for dynamic world. This loads the GLB files
  // required for bufferzone, corridor and sroom before any world
  // construction occurs.
  await initDynamicWorld();
  // Setup input controls and VR controllers after renderer is ready.
  setupControls();
  setupVR();
      // ADD SMALL DELAY TO ENSURE MEDIAPIPE IS LOADED
  await new Promise(resolve => setTimeout(resolve, 1000));
    // ADD THIS LINE - Initialize hand detection
    
  // Create a simple overlay for debug and game state information.
  infoDiv = document.createElement('div');
  infoDiv.id = 'gameInfo';
  infoDiv.style.position = 'absolute';
  infoDiv.style.top = '10px';
  infoDiv.style.left = '10px';
  infoDiv.style.color = '#fff';
  infoDiv.style.zIndex = '100';
  document.body.appendChild(infoDiv);
  // Reset the game manager.
  gameManager.initGame();
  // Build the initial world (step 0).
  const initialBlueprint = gameManager.getBlueprint(0);
  buildWorldForBlueprint(initialBlueprint, null);
  // Prefetch assets for initial blueprint in the background
  prefetchBlueprintAssets(initialBlueprint);
  // If the initial blueprint has an anomaly, spawn it now.
  if (initialBlueprint.hasAnomaly) {
    const roomInst = getRoomInstance(initialBlueprint.anomalyLocation);
    if (roomInst && roomInst.root) {
      const bbox = new THREE.Box3().setFromObject(roomInst.root);
      const pos = new THREE.Vector3();
      bbox.getCenter(pos);
      spawnAnomalyManual(initialBlueprint.anomalyType, pos);
    }
  }
  // Initialise the overlay for the first step.
  updateOverlay();
  // Start the render loop.
  renderer.setAnimationLoop(animate);
}

start().catch((err) => {
  console.error('Failed to start game:', err);
});

window.addEventListener('resize', onWindowResize);

// XR setup remains mostly unchanged: check if XR is supported and
// wire up the button to start an immersive VR session. The logic for
// building steps is independent of whether the player is in VR or not.
const activateButton = document.getElementById('enterXR');

if (activateButton) {
  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-vr').then((isSupported) => {
      if (isSupported) {
        activateButton.disabled = false;
        activateButton.textContent = 'Enter XR';
        activateButton.addEventListener('click', onButtonClicked);
      } else {
        activateButton.textContent = 'VR Not Supported';
      }
    });
  } else {
    activateButton.textContent = 'WebXR Not Supported';
  }
}

// Service Worker registration - Re-enabled with optimizations
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered:', reg.scope))
      .catch(err => console.warn('SW registration failed:', err));
  });
}

// (PWA install prompt handling removed — app is no longer offering an inline install button)