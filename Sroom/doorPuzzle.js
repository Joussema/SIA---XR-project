import * as THREE from 'three';
import { freezePlayerAt, camera, renderer, dolly, scene } from '../core/init.js';
import { playPositionalSound, stopMainTheme } from '../game/audioManager.js';
import { triggerFlashlightFlicker } from '../game/flashlight.js';
import { SimpleModelLoader } from '../environment/modelloader.js';
import { showLostScreen } from '../game/uiManager.js';

let spheres = [];
let puzzleActive = false;
let puzzleContainer = null;
let statusElement = null;
let hoverElement = null;
let currentAnswer = null;
let puzzleDataCache = null;

// VR 3D text panel
let vrTextPanel = null;
let vrTextCanvas = null;
let vrTextContext = null;
let vrTextTexture = null;

// Create 3D text panel for VR mode
function createVRTextPanel() {
    // Create canvas for text
    vrTextCanvas = document.createElement('canvas');
    vrTextCanvas.width = 512;
    vrTextCanvas.height = 128;
    vrTextContext = vrTextCanvas.getContext('2d');

    // Create texture from canvas
    vrTextTexture = new THREE.CanvasTexture(vrTextCanvas);
    vrTextTexture.minFilter = THREE.LinearFilter;

    // Create plane geometry for the panel
    const geometry = new THREE.PlaneGeometry(1.5, 0.4);
    const material = new THREE.MeshBasicMaterial({
        map: vrTextTexture,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: false
    });

    vrTextPanel = new THREE.Mesh(geometry, material);
    vrTextPanel.renderOrder = 9998;
    vrTextPanel.visible = false;

    return vrTextPanel;
}

// Update VR text panel content
function updateVRTextPanel(text, show = true) {
    if (!vrTextContext || !vrTextPanel) return;

    // Clear canvas
    vrTextContext.clearRect(0, 0, vrTextCanvas.width, vrTextCanvas.height);

    if (show && text) {
        // Draw background
        vrTextContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
        vrTextContext.roundRect(0, 0, vrTextCanvas.width, vrTextCanvas.height, 10);
        vrTextContext.fill();

        // Draw text
        vrTextContext.fillStyle = 'white';
        vrTextContext.font = '24px sans-serif';
        vrTextContext.textAlign = 'center';
        vrTextContext.textBaseline = 'middle';

        // Word wrap
        const words = text.split(' ');
        let lines = [];
        let currentLine = '';
        const maxWidth = vrTextCanvas.width - 40;

        for (const word of words) {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const metrics = vrTextContext.measureText(testLine);
            if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        lines.push(currentLine);

        // Draw lines
        const lineHeight = 28;
        const startY = (vrTextCanvas.height - lines.length * lineHeight) / 2 + lineHeight / 2;
        lines.forEach((line, i) => {
            vrTextContext.fillText(line, vrTextCanvas.width / 2, startY + i * lineHeight);
        });

        vrTextPanel.visible = true;
    } else {
        vrTextPanel.visible = false;
    }

    // Update texture
    vrTextTexture.needsUpdate = true;
}

// Position VR text panel in front of camera
function positionVRTextPanel() {
    if (!vrTextPanel || !camera) return;

    const camPos = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);

    // Position panel in front of camera, slightly below center
    const panelPos = camPos.clone().add(camDir.multiplyScalar(2));
    panelPos.y -= 0.3; // Slightly below eye level
    vrTextPanel.position.copy(panelPos);

    // Face the camera
    vrTextPanel.lookAt(camPos);
}

async function loadPuzzleData() {
    if (puzzleDataCache) return puzzleDataCache;
    try {
        const response = await fetch('Sroom/3doors/doors.json');
        if (!response.ok) throw new Error('Network response was not ok');
        puzzleDataCache = await response.json();
    } catch (e) {
        console.error("Failed to load puzzle data:", e);
        puzzleDataCache = []; // Fallback empty array
    }
    return puzzleDataCache;
}

export async function initPuzzle(scene, roomRoot) {
    if (puzzleActive) return;
    puzzleActive = true;
    spheres = [];
    currentAnswer = null;

    // Create VR text panel if it doesn't exist
    if (!vrTextPanel) {
        createVRTextPanel();
        scene.add(vrTextPanel);
    }

    // Create UI elements if they don't exist
    if (!document.getElementById('puzzle-status')) {
        statusElement = document.createElement('div');
        statusElement.id = 'puzzle-status';
        statusElement.style.position = 'absolute';
        statusElement.style.top = '20px';
        statusElement.style.left = '50%';
        statusElement.style.transform = 'translateX(-50%)';
        statusElement.style.color = 'white';
        statusElement.style.fontSize = '24px';
        statusElement.style.fontFamily = 'sans-serif';
        statusElement.style.textShadow = '2px 2px 4px black';
        statusElement.style.pointerEvents = 'none';
        document.body.appendChild(statusElement);

        hoverElement = document.createElement('div');
        hoverElement.id = 'puzzle-hover';
        hoverElement.style.position = 'absolute';
        hoverElement.style.bottom = '40%';
        hoverElement.style.left = '50%';
        hoverElement.style.transform = 'translateX(-50%)';
        hoverElement.style.color = 'white';
        hoverElement.style.fontSize = '18px';
        hoverElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        hoverElement.style.padding = '8px';
        hoverElement.style.borderRadius = '4px';
        hoverElement.style.fontFamily = 'sans-serif';
        hoverElement.style.textShadow = '1px 1px 2px black';
        hoverElement.style.textAlign = 'center';
        hoverElement.style.maxWidth = '80%';
        hoverElement.style.pointerEvents = 'none';
        hoverElement.style.display = 'none';
        document.body.appendChild(hoverElement);
    } else {
        statusElement = document.getElementById('puzzle-status');
        hoverElement = document.getElementById('puzzle-hover');
        statusElement.style.display = 'block';
        statusElement.textContent = ""; // Clear previous status
    }

    // Load data
    const puzzles = await loadPuzzleData();
    if (!puzzles || puzzles.length === 0) {
        statusElement.textContent = "Error loading puzzle data.";
        return;
    }

    // Pick random puzzle
    const puzzle = puzzles[Math.floor(Math.random() * puzzles.length)];
    // Normalize solution to lowercase
    currentAnswer = puzzle.solution.toLowerCase();

    // Sphere data - Ordered: Blue, Red, White
    // Customized positions (X, Y, Z) for each sphere
    const sphereData = [
        { color: 0x0000ff, name: 'blue', pos: { x: -6, y: 0, z: -2 }, statement: puzzle.blue },
        { color: 0xff0000, name: 'red', pos: { x: -6, y: 0, z: -4 }, statement: puzzle.red },
        { color: 0xffffff, name: 'white', pos: { x: -6, y: 0, z: -6 }, statement: puzzle.white }
    ];

    const puzzleGroup = new THREE.Group();

    sphereData.forEach(data => {
        const geometry = new THREE.SphereGeometry(0.3, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: data.color,
            emissive: data.color,
            emissiveIntensity: 0.5
        });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.set(data.pos.x, data.pos.y, data.pos.z);
        sphere.userData = {
            name: data.name,
            isPuzzleSphere: true,
            statement: data.statement
        };
        puzzleGroup.add(sphere);
        spheres.push(sphere);
    });

    // Check if we are still active before adding to scene (async race)
    if (puzzleActive) {
        roomRoot.add(puzzleGroup);
        puzzleContainer = puzzleGroup;

        // Find Skulls & Stands directly by name (Hardcoded Mapping)
        const doors = {};
        const skulls = {};
        const stands = {};

        roomRoot.traverse((child) => {
            // Doors
            if (child.name === 'Door_Door_0002') doors['blue'] = child;   // Left
            if (child.name === 'Door_Door_0') doors['red'] = child;      // Center
            if (child.name === 'Door_Door_0001') doors['white'] = child; // Right

            // Skulls - Hardcoded mapping
            // Left (Blue) -> ...0002
            // Center (Red) -> ...0001
            // Right (White) -> ...0 (Default)
            if (child.name === 'Skull_02_-_Default_0002') skulls['blue'] = child;
            if (child.name === 'Skull_02_-_Default_0001') skulls['red'] = child;
            if (child.name === 'Skull_02_-_Default_0') skulls['white'] = child;

            // Stands - Hardcoded mapping
            // Left (Blue) -> ...003
            // Center (Red) -> ...002
            // Right (White) -> ...001
            if (child.name === 'SM_stonepattern003') stands['blue'] = child;
            if (child.name === 'SM_stonepattern002') stands['red'] = child;
            if (child.name === 'SM_stonepattern001') stands['white'] = child;
        });

        puzzleContainer.userData.doors = doors;
        puzzleContainer.userData.skulls = skulls;
        puzzleContainer.userData.stands = stands;
        puzzleContainer.userData.roomRoot = roomRoot; // Save for audio source

        console.log("Puzzle Connections (Final):",
            "\nBlue (Left) Group:",
            doors['blue']?.name,
            skulls['blue']?.name,
            stands['blue']?.name,
            "\nRed (Center) Group:",
            doors['red']?.name,
            skulls['red']?.name,
            stands['red']?.name,
            "\nWhite (Right) Group:",
            doors['white']?.name,
            skulls['white']?.name,
            stands['white']?.name
        );

        // --- NEW LOGIC: PRE-REMOVE CORRECT PATH OBSTACLES ---
        // The correct door (currentAnswer) should NOT have obstacles behind it.
        // The wrong doors (dead ends) SHOULD have Skulls/Stands.

        if (currentAnswer) {
            const correctSkull = skulls[currentAnswer];
            const correctStand = stands[currentAnswer];

            if (correctSkull && correctSkull.parent) {
                correctSkull.parent.remove(correctSkull);
                console.log(`Init: Removed Correct Skull (${currentAnswer}) so path is clear.`);
                delete skulls[currentAnswer];
            }
            if (correctStand && correctStand.parent) {
                correctStand.parent.remove(correctStand);
                console.log(`Init: Removed Correct Stand (${currentAnswer}) so path is clear.`);
                delete stands[currentAnswer];
            }
        }
    }
}

// Fiend Jumpscare State
let fiend = null;
let fiendActive = false;
let fiendSoundPlayed = false;
const fiendSpeed = 12.0; // High speed

// Jumpscare Configuration (Global for tuning)
window.JUMPSCARE_CONFIG = {
    fiendHeightOffset: 0, // Lower the fiend
    delayBells: 2000,        // Time before bells start (from freeze)
    delayFootsteps: 5000,    // Time after bells to start footsteps
    delayGrowl: 2000,        // Time after footsteps to start growl
    delayLaunch: 10000,      // Time after growl to launch fiend

    // Audio Tuning
    footstepsRate: 0.8,      // 20% slower (0.8)
    growlVolume: 2.0         // Louder (2.0)
};

export function updatePuzzle(raycaster, interactPressed) {
    if (!puzzleActive || !puzzleContainer) return;

    // --- FIEND JUMPSCARE LOGIC ---
    if (fiendActive && fiend) {
        // Target player head
        const targetObj = (renderer.xr.isPresenting && dolly) ? dolly : camera;
        const targetPos = targetObj.position.clone();

        // Flatten target to Fiend's height immediately
        // This stops it from looking up/down or moving up/down
        const flatTarget = new THREE.Vector3(targetPos.x, fiend.position.y, targetPos.z);

        // Face player (Horizontal only)
        fiend.lookAt(flatTarget);

        // Calculate horizontal distance
        const distance = fiend.position.distanceTo(flatTarget);

        // 1. TRIGGER SOUND at 5 tiles
        if (distance <= 15.0 && !fiendSoundPlayed) {
            console.log("Fiend proximity sound trigger!");
            fiendSoundPlayed = true;
            // Use playPositionalSound attached to camera for "global" loud sound
            playPositionalSound('Jumpscare Effect.mp3', camera, 1, 100, 5.0); // Volume 5.0
        }

        // 2. TRIGGER GAME OVER SCREEN at 1.5 tiles (Contact)
        if (distance <= 1.5) {
            console.log("Fiend grabbed player! GAME OVER.");

            // STOP MAIN MUSIC
            stopMainTheme();

            // Create/Show Game Over Screen
            // Create/Show Game Over Screen
            showLostScreen();

            // Disable Fiend Loop
            fiendActive = false;
        }

        // Move towards player if far enough
        if (distance > 1.5) {
            const direction = new THREE.Vector3().subVectors(flatTarget, fiend.position).normalize();
            fiend.position.add(direction.multiplyScalar(fiendSpeed * 0.016)); // Approx 60fps delta
        }
    }

    const intersects = raycaster.intersectObjects(spheres);

    // Check if in VR mode
    const isVR = renderer && renderer.xr.isPresenting;

    if (intersects.length > 0) {
        const hit = intersects[0].object;
        const statement = hit.userData.statement;
        const colorName = hit.userData.name;

        // Update hover text - use VR panel in VR mode, HTML in desktop
        if (isVR) {
            updateVRTextPanel(statement, true);
            positionVRTextPanel();
            // Hide HTML element in VR
            hoverElement.style.display = 'none';
        } else {
            hoverElement.textContent = statement;
            hoverElement.style.display = 'block';
            // Hide VR panel in desktop
            if (vrTextPanel) vrTextPanel.visible = false;
        }

        if (interactPressed) {
            if (colorName === currentAnswer) {
                statusElement.textContent = `Correct! ${colorName} was the answer.`;
                statusElement.style.color = '#00ff00';
            } else {
                statusElement.textContent = `Wrong! ${colorName} is not the answer.`;
                statusElement.style.color = '#ff0000';

                // --- WRONG ANSWER EVENT ---
                const doors = puzzleContainer.userData.doors;
                if (doors && doors[colorName]) {
                    const targetDoor = doors[colorName];
                    const targetPos = new THREE.Vector3();
                    targetDoor.getWorldPosition(targetPos);

                    // Adjust Y for player mode
                    if (renderer.xr.isPresenting && dolly) {
                        targetPos.y = dolly.position.y;
                    } else {
                        targetPos.y = camera.position.y;
                    }

                    console.log(`Wrong choice! Freezing player and moving to ${colorName} door at`, targetPos);
                    freezePlayerAt(targetPos);

                    // --- JUMPSCARE SEQUENCE ---
                    const cfg = window.JUMPSCARE_CONFIG;
                    const entrance = puzzleContainer.userData.roomRoot;

                    if (entrance) {
                        // 1. Bells of Doom
                        setTimeout(() => {
                            console.log("Sequence: Bells of Doom");
                            playPositionalSound('bells of doom.mp3', entrance, 5, 50);

                            // Flashlight Flicker: 3s after bells, for 4s
                            setTimeout(() => {
                                console.log("Sequence: Flashlight Flicker");
                                triggerFlashlightFlicker(9000);
                            }, 3000);

                            // 2. Heavy Footsteps (chained)
                            setTimeout(() => {
                                console.log("Sequence: Heavy Footsteps");
                                // 20% slower = 0.8 rate
                                playPositionalSound('Heavy foot.mp3', entrance, 5, 50, 1.0, cfg.footstepsRate);

                                // 3. Growl (chained)
                                setTimeout(() => {
                                    console.log("Sequence: Growl");
                                    // Louder = 2.0 volume
                                    playPositionalSound('growl.mp3', entrance, 5, 50, cfg.growlVolume);

                                    // 4. Launch Fiend (chained)
                                    setTimeout(async () => {
                                        console.log("Sequence: Launching Fiend!");
                                        const loader = new SimpleModelLoader(scene);
                                        try {
                                            const model = await loader.load('models/Forest_Fiend.glb', THREE);
                                            fiend = model;

                                            // Spawn Position
                                            const spawnPos = new THREE.Vector3();
                                            entrance.getWorldPosition(spawnPos);
                                            spawnPos.y += cfg.fiendHeightOffset; // Apply height offset

                                            fiend.position.copy(spawnPos);
                                            scene.add(fiend);

                                            fiendActive = true;
                                        } catch (e) {
                                            console.error("Failed to spawn fiend:", e);
                                        }
                                    }, cfg.delayLaunch);

                                }, cfg.delayGrowl);

                            }, cfg.delayFootsteps);

                        }, cfg.delayBells);
                    }
                }
            }

            // Visual feedback
            hit.material.emissiveIntensity = 2.0;
            setTimeout(() => {
                if (hit.material) hit.material.emissiveIntensity = 0.5;
            }, 200);

            // Play Door Sound
            const audio = new Audio('sounds/door.mp3');
            audio.play().catch(e => console.error("Error playing sound:", e));

            // Removal Logic: ONLY REMOVE DOOR
            const doors = puzzleContainer.userData.doors;

            // Remove Door
            if (doors && doors[colorName]) {
                const target = doors[colorName];
                if (target.parent) {
                    target.parent.remove(target);
                    console.log(`Removed Door: ${target.name}`);
                    delete doors[colorName];
                }
            }
        }
    } else {
        // Hide hover when not looking at sphere
        if (isVR) {
            updateVRTextPanel('', false);
        } else {
            hoverElement.style.display = 'none';
        }
    }
}

export function cleanupPuzzle() {
    if (!puzzleActive) return;
    puzzleActive = false;
    currentAnswer = null;

    if (puzzleContainer) {
        // Remove from parent
        if (puzzleContainer.parent) {
            puzzleContainer.parent.remove(puzzleContainer);
        }
        // Cleanup geometries/materials
        spheres.forEach(s => {
            s.geometry.dispose();
            s.material.dispose();
        });
        spheres = [];
        puzzleContainer = null;
    }

    if (statusElement) statusElement.style.display = 'none';
    if (hoverElement) hoverElement.style.display = 'none';
    if (vrTextPanel) vrTextPanel.visible = false;
}
