import { initScene, renderer, camera, scene, setupVRControllers, onButtonClicked, onWindowResize, updateMovement, setupControls, dolly } from './core/init.js';
import * as THREE from 'three';
import { setupFlashlight } from './game/flashlight.js';
import { setupAudio } from './game/audioManager.js';

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
  }

  // Update any active anomalies (animation and cleanup of lifetime).
  updateAnomalies();
  // Refresh overlay continuously in case of dynamic changes (e.g. VR session).
  updateOverlay();
  // Render the scene
  renderer.render(scene, camera);
}

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
  setupVRControllers();
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