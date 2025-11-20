import * as THREE from 'three';

export function setupAudio(camera) {
    // Create an AudioListener and add it to the camera
    const listener = new THREE.AudioListener();
    camera.add(listener);

    // Create a global audio source
    const sound = new THREE.Audio(listener);

    // Create an HTML5 Audio element for streaming
    const audio = document.createElement('audio');
    audio.src = 'sounds/main_theme.mp3';
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0.5;

    // Connect the audio element to the Three.js audio source
    sound.setMediaElementSource(audio);

    // Attempt to play immediately
    audio.play().then(() => {
        console.log("Audio playing");
    }).catch(e => {
        console.log("Autoplay blocked, waiting for interaction");
    });

    // Handle browser autoplay policies
    function resumeAudio() {
        if (listener.context.state === 'suspended') {
            listener.context.resume();
        }
        // Try to play the HTML audio element if it's paused
        if (audio.paused) {
            audio.play().catch(e => console.error("Play failed:", e));
        }

        // Remove listeners once audio is started/resumed
        if (listener.context.state === 'running' && !audio.paused) {
            document.removeEventListener('click', resumeAudio);
            document.removeEventListener('keydown', resumeAudio);
        }
    }

    document.addEventListener('click', resumeAudio);
    document.addEventListener('keydown', resumeAudio);

    return sound;
}
