import * as THREE from 'three';

export function setupFlashlight(camera) {
    // 1. Main Beam (Focused, Bright)
    const mainBeam = new THREE.SpotLight(0xaabbff, 200);
    mainBeam.angle = Math.PI / 8; // Tighter angle for the core beam
    mainBeam.penumbra = 0.2; // Sharpish edge
    mainBeam.decay = 2;
    mainBeam.distance = 60;
    mainBeam.position.set(0, 0, 0);
    mainBeam.target.position.set(0, 0, -1);
    mainBeam.userData.originalIntensity = 200;

    // 2. Spill Beam (Wide, Dim, Soft)
    const spillBeam = new THREE.SpotLight(0xaabbff, 20); // Much dimmer
    spillBeam.angle = Math.PI / 3; // Wide angle
    spillBeam.penumbra = 0.5; // Very soft
    spillBeam.decay = 2;
    spillBeam.distance = 30; // Shorter range
    spillBeam.position.set(0, 0, 0);
    spillBeam.target.position.set(0, 0, -1);
    spillBeam.userData.originalIntensity = 20;

    // Add lights and targets to camera
    camera.add(mainBeam);
    camera.add(mainBeam.target);
    camera.add(spillBeam);
    camera.add(spillBeam.target);

    // Toggle control
    document.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === 'f') {
            const newState = !mainBeam.visible;
            mainBeam.visible = newState;
            spillBeam.visible = newState;
        }
    });

    activeLights = { mainBeam, spillBeam };
    return { mainBeam, spillBeam };
}

let activeLights = null;

export function triggerFlashlightFlicker(duration = 4000) {
    console.log("Triggering Flashlight Flicker...", duration);
    if (!activeLights) {
        console.error("Flashlight Error: No active lights found!");
        return;
    }

    const { mainBeam, spillBeam } = activeLights;
    const startTime = Date.now();

    const flickerInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= duration) {
            clearInterval(flickerInterval);
            // Restore original state
            if (mainBeam.userData.originalIntensity) {
                mainBeam.intensity = mainBeam.userData.originalIntensity;
                spillBeam.intensity = spillBeam.userData.originalIntensity;
            }
            mainBeam.visible = true;
            spillBeam.visible = true;
            return;
        }

        // Random flicker
        const isVisible = Math.random() > 0.4;

        // Use intensity for smoother/more reliable flicker
        if (mainBeam.userData.originalIntensity) {
            mainBeam.intensity = isVisible ? mainBeam.userData.originalIntensity : 0;
            spillBeam.intensity = isVisible ? spillBeam.userData.originalIntensity : 0;
        }
        mainBeam.visible = true;
        spillBeam.visible = true;

    }, 80);
}

// Continuous flicker state
let infiniteFlickerInterval = null;

export function startInfiniteFlicker() {
    if (infiniteFlickerInterval) return; // Already flickering
    if (!activeLights) return;

    const { mainBeam, spillBeam } = activeLights;

    infiniteFlickerInterval = setInterval(() => {
        const isVisible = Math.random() > 0.5;
        if (mainBeam.userData.originalIntensity) {
            mainBeam.intensity = isVisible ? mainBeam.userData.originalIntensity : 0;
            spillBeam.intensity = isVisible ? spillBeam.userData.originalIntensity : 0;
        }
    }, 100);
}

export function stopInfiniteFlicker() {
    if (infiniteFlickerInterval) {
        clearInterval(infiniteFlickerInterval);
        infiniteFlickerInterval = null;
    }
    // Restore lights to ON
    if (activeLights) {
        if (activeLights.mainBeam.userData.originalIntensity) {
            activeLights.mainBeam.intensity = activeLights.mainBeam.userData.originalIntensity;
            activeLights.spillBeam.intensity = activeLights.spillBeam.userData.originalIntensity;
        }
        activeLights.mainBeam.visible = true;
        activeLights.spillBeam.visible = true;
    }
}
