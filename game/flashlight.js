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

    return { mainBeam, spillBeam };
}
