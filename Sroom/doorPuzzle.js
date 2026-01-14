import * as THREE from 'three';

let spheres = [];
let puzzleActive = false;
let puzzleContainer = null;
let statusElement = null;
let hoverElement = null;
let currentAnswer = null;
let puzzleDataCache = null;

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
    const sphereData = [
        { color: 0x0000ff, name: 'blue', x: -1.5, statement: puzzle.blue },
        { color: 0xff0000, name: 'red', x: 0, statement: puzzle.red },
        { color: 0xffffff, name: 'white', x: 1.5, statement: puzzle.white }
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
        sphere.position.set(data.x, 1.5, 4);
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

export function updatePuzzle(raycaster, interactPressed) {
    if (!puzzleActive || !puzzleContainer) return;

    const intersects = raycaster.intersectObjects(spheres);

    if (intersects.length > 0) {
        const hit = intersects[0].object;
        const statement = hit.userData.statement;
        const colorName = hit.userData.name;

        // Update hover text
        hoverElement.textContent = statement;
        hoverElement.style.display = 'block';

        if (interactPressed) {
            if (colorName === currentAnswer) {
                statusElement.textContent = `Correct! ${colorName} was the answer.`;
                statusElement.style.color = '#00ff00';
            } else {
                statusElement.textContent = `Wrong! ${colorName} is not the answer.`;
                statusElement.style.color = '#ff0000';
            }

            // Visual feedback
            hit.material.emissiveIntensity = 2.0;
            setTimeout(() => {
                if (hit.material) hit.material.emissiveIntensity = 0.5;
            }, 200);

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
        hoverElement.style.display = 'none';
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
}
