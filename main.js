//import { initScene, renderer, camera, scene, setupVRControllers, onButtonClicked, onWindowResize, updateMovement, setupControls, dolly } from './core/init.js';
import { initScene, renderer, camera, scene, setupVR, onButtonClicked, onWindowResize, updateMovement, setupControls, dolly, updateXRCursor, getXRRaycaster, isInXRMode } from './core/init.js';
import * as THREE from 'three';
import { setupFlashlight } from './game/flashlight.js';
import { setupAudio, playSound, playPositionalSound, prefetchSound, prefetchModel, stopMainTheme } from './game/audioManager.js';
import { showLostScreen } from './game/uiManager.js';

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
import { initPuzzle, updatePuzzle, cleanupPuzzle } from './Sroom/doorPuzzle.js';
import { runRoomEvent } from './game/runRoomEvent.js';


// Create a game manager instance. The GameManager controls logic for
// generating blueprints, tracking the current step and streak, and
// evaluating decisions.
const gameManager = new GameManager();

// Simple target + raycast helpers
let raycaster = new THREE.Raycaster(); // Restored for main game logic

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

    }
  } catch (e) { console.warn('Prefetch failed:', e); }
}

function animate() {
  // Update player movement (keyboard or VR) first
  updateMovement();

  // Determine the player object for decision detection (dolly in VR or camera otherwise).
  const playerObj = (renderer.xr?.isPresenting && dolly) ? dolly : camera;
  const playerPos = playerObj.position.clone();

  // Check if the player has made a decision.
  const decision = getDecisionForPlayer(playerPos);
  if (decision) {
    // Register the decision with the game manager. This updates state and
    // increments the step counter.
    gameManager.registerDecision(decision);
    // Clear any existing anomaly from the previous step.
    clearAnomaly();
    cleanupPuzzle(); // Ensure puzzle is reset for the new step
    // Determine which buffer becomes the new centre based on the player's choice.
    const chosenBuffer = getBufferInstance(decision);
    // Retrieve the blueprint for the new step.
    const bp = gameManager.getBlueprint(gameManager.currentStep);
    // Rebuild the world around the chosen buffer.
    buildWorldForBlueprint(bp, chosenBuffer);
    // If the blueprint specifies an anomaly, spawn it in the appropriate room.
    if (bp.hasAnomaly) {
      const roomInst = getRoomInstance(bp.anomalyLocation);
      if (roomInst && roomInst.root) {
        // Compute spawn position as the centre of the room's bounding box.
        const bbox = new THREE.Box3().setFromObject(roomInst.root);
        const pos = new THREE.Vector3();
        bbox.getCenter(pos);
        spawnAnomalyManual(bp.anomalyType, pos);
      }
    }
    // Update overlay to reflect new step.
    updateOverlay();
    // Prefetch assets for the new blueprint in the background
    prefetchBlueprintAssets(bp);
  }

  // Note: `prefetchBlueprintAssets` is declared at the module top-level

  // --- NEW SOUND LOGIC START ---
  const state = gameManager.getState();
  const bp = gameManager.getBlueprint(state.currentStep);

  // We only care if the forward room is one of our scary rooms
  if (bp.forwardRoomType === 'scaryladyroom' || bp.forwardRoomType === 'scarygang' || bp.forwardRoomType === 'fiendroom') {
    // Get the forward room instance
    const forwardRoom = getRoomInstance('forward');
    if (forwardRoom && forwardRoom.root) {
      // The root of the room is placed at the entrance connection point.
      // We check if the player is close to this point (entering the room).
      const roomPos = new THREE.Vector3();
      forwardRoom.root.getWorldPosition(roomPos);

      const dist = playerPos.distanceTo(roomPos);

      // Threshold: 10 units seems reasonable for "entering" the room
      if (dist < 10.0) {
        // Check if we already played the sound for this step
        if (!gameManager.soundPlayedForStep) {
          if (bp.forwardRoomType === 'scaryladyroom') {
            playSound('Lady statue.mp3');
          } else if (bp.forwardRoomType === 'scarygang') {
            playSound('Gang sound.mp3');
          } else if (bp.forwardRoomType === 'fiendroom') {
            // Create a dummy object for the sound source
            // Position it slightly into the room (e.g., +Z is forward into the room from entrance?)
            // Actually, forward room is snapped to center end.
            // Let's assume a position relative to the room root.
            const soundSource = new THREE.Object3D();
            // Place it somewhere in the room. 
            // Room root is at entrance.
            soundSource.position.set(3, 4, -4);
            forwardRoom.root.add(soundSource);
            playPositionalSound('fiend breath.mp3', soundSource, 5, 20);
          }
          gameManager.soundPlayedForStep = true;
        }
      }
    }
  }

  // Reset sound flag if we moved to a new step (simple check)
  if (gameManager.lastStepChecked !== state.currentStep) {
    gameManager.soundPlayedForStep = false;
    gameManager.lastStepChecked = state.currentStep;
  }
  // --- NEW SOUND LOGIC END ---

  // --- SROOM PUZZLE LOGIC START ---
  if (bp.forwardRoomType === 'sroom') {
    const forwardRoom = getRoomInstance('forward');
    if (forwardRoom && forwardRoom.root) {
      // Init puzzle if not already active (logic inside initPuzzle handles duality)
      initPuzzle(scene, forwardRoom.root);
    }
  } else {
    // If we are NOT in sroom (or sroom is not forward/current context), cleanup
    cleanupPuzzle();
  }

  // Update raycaster for center of screen (crosshair)
  // Use XR raycaster in VR mode, regular raycaster in desktop mode
  if (isInXRMode()) {
    updateXRCursor();
    const xrRaycaster = getXRRaycaster();
    if (xrRaycaster) {
      updatePuzzle(xrRaycaster, window.wasClicked);
    }
  } else {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    updatePuzzle(raycaster, window.wasClicked);
  }
  window.wasClicked = false; // Reset click flag

  // --- SROOM PUZZLE LOGIC END ---

  // --- RUN ROOM EVENT LOGIC START ---
  if (bp.forwardRoomType === 'runroom') {
    const forwardRoom = getRoomInstance('forward');
    if (forwardRoom && forwardRoom.root) {
      runRoomEvent.init(forwardRoom.root);
      runRoomEvent.update(playerPos);
    }
  } else {
    runRoomEvent.cleanup();
  }
  // --- RUN ROOM EVENT LOGIC END ---

  // Update any active anomalies (animation and cleanup of lifetime).
  updateAnomalies();


  // Refresh overlay continuously in case of dynamic changes (e.g. VR session).
  updateOverlay();
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
  // Initialise the overlay for the first step.
  updateOverlay();

  // --- GAME OVER LOGIC ---
  function handleGhostCatch() {
    console.log('GAME OVER - PLAYER CAUGHT');
    // Stop Main Theme
    stopMainTheme();

    // Show Shared Lost Screen
    showLostScreen();
  }

  // Hook up Ghost Catch Event
  runRoomEvent.onPlayerCaught = handleGhostCatch;


  // Start the render loop.
  renderer.setAnimationLoop(animate);
}

start().catch((err) => {
  console.error('Failed to start game:', err);
});

// Restore Click Interactions (Essential for Puzzle)
window.addEventListener('click', () => { window.wasClicked = true; });
window.addEventListener('pointerdown', () => { window.wasClicked = true; });

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

// Service Worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered:', reg.scope))
      .catch(err => console.warn('SW registration failed:', err));
  });
}

// (PWA install prompt handling removed — app is no longer offering an inline install button)