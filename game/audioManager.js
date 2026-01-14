import * as THREE from 'three';

let globalListener = null;
let mainThemeElement = null;

export function setupAudio(camera) {
    // Create an AudioListener and add it to the camera
    const listener = new THREE.AudioListener();
    camera.add(listener);
    globalListener = listener;

    // Create a global audio source
    const sound = new THREE.Audio(listener);

    // Create an HTML5 Audio element for streaming
    const audio = document.createElement('audio');
    audio.src = 'sounds/main_theme.mp3';
    audio.loop = true;
    // Avoid preloading large music tracks; only load metadata until user interaction
    audio.preload = 'none';
    audio.volume = 0.5;

    mainThemeElement = audio;

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

export function stopMainTheme() {
    if (mainThemeElement) {
        mainThemeElement.pause();
        mainThemeElement.currentTime = 0;
        console.log("Main theme stopped.");
    }
}

export function playSound(soundName) {
    const audio = new Audio(`sounds/${soundName}`);
    audio.volume = 1.0;
    audio.play().catch(e => console.error("Failed to play sound:", e));
}

export async function prefetchSound(soundName) {
    // Throttled prefetch - use setTimeout to defer from main thread
    if (!('caches' in window)) return;
    setTimeout(async () => {
        try {
            const cache = await caches.open('exit8-sounds-v1');
            const url = `sounds/${soundName}`;
            const cached = await cache.match(url);
            if (!cached) {
                await cache.add(url);
            }
        } catch (e) {
            console.warn('Failed to prefetch sound:', soundName);
        }
    }, 100); // Defer to next event loop
}

export async function prefetchModel(modelPath) {
    // Throttled prefetch - use setTimeout to defer from main thread
    if (!('caches' in window)) return;
    setTimeout(async () => {
        try {
            const cache = await caches.open('exit8-models-v1');
            const cached = await cache.match(modelPath);
            if (!cached) {
                await cache.add(modelPath);
            }
        } catch (e) {
            console.warn('Failed to prefetch model:', modelPath);
        }
    }, 100); // Defer to next event loop
}

export function playPositionalSound(soundName, parentObject, refDistance = 2, maxDistance = 15, volume = 1.0, playbackRate = 1.0) {
    if (!globalListener) return;
    const sound = new THREE.PositionalAudio(globalListener);
    const audioLoader = new THREE.AudioLoader();
    audioLoader.load(`sounds/${soundName}`, function (buffer) {
        sound.setBuffer(buffer);
        sound.setRefDistance(refDistance);
        sound.setMaxDistance(maxDistance);
        sound.setVolume(volume);
        sound.setPlaybackRate(playbackRate);
        parentObject.add(sound);
        sound.play();
        // Optional: remove sound object after playback if not looping
        sound.onEnded = () => {
            parentObject.remove(sound);
        };
    });
}
