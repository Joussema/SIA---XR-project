import { initScene, renderer, camera, scene, setupVRControllers, onButtonClicked, onWindowResize, updateMovement, setupControls } from './core/init.js';
import { setupFlashlight } from './game/flashlight.js';
import { setupAudio } from './game/audioManager.js';

import { createTunnel } from './environment/tunnel.js';
import { updateAnomalies } from './anomalies/anomalyManager.js';


function animate() {
  // Update player movement (keyboard or VR) first
  updateMovement();
  // Reposition corridor segments around the player
  //updateCorridor();
  // Update any active anomalies
  updateAnomalies();
  // Render the scene
  renderer.render(scene, camera);
}

// === MAIN INIT ===
initScene();
setupFlashlight(camera);
setupAudio(camera);

// Initialise the corridor.  Because loading the GLB is asynchronous,
// wait for it to complete before starting the rest of the app.  If
// createTunnel rejects, the error will be logged to the console.
createTunnel().then(() => {
  setupControls();
  setupVRControllers();
  renderer.setAnimationLoop(animate);
}).catch((err) => {
  console.error('Failed to create tunnel:', err);
});

window.addEventListener('resize', onWindowResize);


// Start the application
const activateButton = document.getElementById("enterXR");

if (activateButton) {
  if (navigator.xr) {
    navigator.xr.isSessionSupported("immersive-vr").then((isSupported) => {
      if (isSupported) {
        activateButton.disabled = false;
        activateButton.textContent = "Enter XR";
        activateButton.addEventListener("click", onButtonClicked);
      } else {
        activateButton.textContent = "VR Not Supported";
      }
    });
  } else {
    activateButton.textContent = "WebXR Not Supported";
  }
}