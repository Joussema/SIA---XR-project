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

    // 2. Spill Beam (Wide, Dim, Soft)
    const spillBeam = new THREE.SpotLight(0xaabbff, 20); // Much dimmer
    spillBeam.angle = Math.PI / 3; // Wide angle
    spillBeam.penumbra = 0.5; // Very soft
    spillBeam.decay = 2;
    spillBeam.distance = 30; // Shorter range
    spillBeam.position.set(0, 0, 0);
    spillBeam.target.position.set(0, 0, -1);

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
            // Optional: Play a click sound
        }
    });

    activeLights = { mainBeam, spillBeam };
    return { mainBeam, spillBeam };
}

let activeLights = null;

export function triggerFlashlightFlicker(duration = 4000) {
    if (!activeLights) return;

    const { mainBeam, spillBeam } = activeLights;
    const originalState = mainBeam.visible;
    const startTime = Date.now();

    // Ensure lights are on for the flicker effect if they were off? 
    // Or just flicker whatever state they are in? 
    // Usually horror flicker implies it turns OFF and ON.
    // Let's assume user wants it to flicker *on/off*.

    const flickerInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= duration) {
            clearInterval(flickerInterval);
            // Restore original state (or force ON if desire is to ensure player can see after?)
            // Let's restore original state to be safe, or Force ON if it's critical.
            // Horror trope: Flashlight usually stays ON after flicker.
            mainBeam.visible = true;
            spillBeam.visible = true;
            return;
        }

        // Random flicker
        const isVisible = Math.random() > 0.5;
        mainBeam.visible = isVisible;
        spillBeam.visible = isVisible;

    }, 100); // Fast flicker every 100ms
}
