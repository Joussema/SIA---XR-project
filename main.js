import { initScene, renderer, camera, scene, setupVRControllers, onButtonClicked, onWindowResize,updateMovement,  setupControls } from './core/init.js';



import { createTunnel } from './environment/tunnel.js';
import { updateAnomalies } from './anomalies/anomalyManager.js';


function animate() {
  updateMovement();
  updateAnomalies();
  renderer.render(scene, camera);
}

// === MAIN INIT ===
initScene();
createTunnel();
setupControls();
setupVRControllers();
renderer.setAnimationLoop(animate);
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