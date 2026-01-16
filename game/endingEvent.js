import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { scene, camera, renderer, freezePlayerAt, unfreezePlayer } from '../core/init.js';
import { stopMainTheme, playSound, playEndingTheme, stopEndingTheme } from './audioManager.js';
import { showLostScreen } from './uiManager.js';
import { clearWorld } from '../environment/dynamicWorld.js';

// Configuration
const LIGHT_TRIGGER_DIST = 4.0;
const FLOAT_DURATION = 38.0; // Shortened to end after final credit
const FINAL_WAIT_DURATION = 10.0;
const WHITE_LIGHT_POS = new THREE.Vector3(-10, 2, -14);
const FLOAT_SPEED = 2.5; // Units per second

let isActive = false;
let isTriggered = false;
let isFloating = false;
let floatTimer = 0;
let fadeTimer = 0;
let finaleTimer = 0;
let isFinished = false;
let endingRoomRoot = null;
let whiteOverlay = null;

// Sound flags to prevent multiple triggers in update loop
let hasPlayedJumpscare = false; // Kept for consistency, though Jumpscare is now single-trigger at end
let hasPlayedScream = false;

// Sky & Assets
let skyTexture = null;
let sceneObjects = [];
let corridorModel = null;
let originalBackground = null;

export const endingEvent = {
    isActive() { return isActive; },
    init(roomRoot) {
        if (isActive) return;
        isActive = true;
        endingRoomRoot = roomRoot;
        isTriggered = false;
        isFloating = false;
        isFinished = false;
        floatTimer = 0;
        fadeTimer = 0;
        finaleTimer = 0;
        hasPlayedJumpscare = false;
        hasPlayedScream = false;
        sceneObjects = [];
        corridorModel = null;

        // Start Audio Immediately upon room generation
        stopMainTheme();
        playEndingTheme();

        // Create White Overlay (initially invisible)
        const geometry = new THREE.PlaneGeometry(2, 2);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false
        });
        whiteOverlay = new THREE.Mesh(geometry, material);
        whiteOverlay.position.set(0, 0, -0.1);
        whiteOverlay.renderOrder = 99999;
        camera.add(whiteOverlay);

        // Visible Light Source Helper
        const lightGeo = new THREE.SphereGeometry(1, 32, 32);
        const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const lightMesh = new THREE.Mesh(lightGeo, lightMat);
        lightMesh.position.copy(WHITE_LIGHT_POS);
        endingRoomRoot.add(lightMesh);

        const pointLight = new THREE.PointLight(0xffffff, 2, 10);
        pointLight.position.copy(WHITE_LIGHT_POS);
        endingRoomRoot.add(pointLight);

        console.log("Ending Event Initialized");
    },

    update(playerPos) {
        if (!isActive) return;

        // Phase 4: Finale Wait (Back in corridor)
        if (isFinished) {
            finaleTimer += 1.0 / 60.0;

            // End Sequence after 10 seconds
            if (finaleTimer >= FINAL_WAIT_DURATION) {
                // Play Jumpscare Immediately before showing card
                playSound('Jumpscare Effect.mp3', 1.0);

                showLostScreen("YOU WON ?");

                // Play Scream AFTER the game end card (e.g. 2 seconds later)
                setTimeout(() => {
                    playSound('guy screaming.mp3', 1.0);
                }, 2000);

                this.cleanup();
            }
            return;
        }

        // Phase 3: Floating
        if (isFloating) {
            floatTimer += 1.0 / 60.0;
            const dt = 1.0 / 60.0;

            // Move player forward (World -Z)
            const obj = renderer.xr.isPresenting && scene.getObjectByName("dolly") ? scene.getObjectByName("dolly") : camera;
            obj.position.z -= FLOAT_SPEED * dt;

            // Animate Scene Objects
            sceneObjects.forEach(obj => {
                // Rotate
                if (obj.userData.rotateSpeed) {
                    obj.rotation.y += obj.userData.rotateSpeed * dt;
                    obj.rotation.x += (obj.userData.rotateXSpeed || 0) * dt;
                    obj.rotation.z += (obj.userData.rotateZSpeed || 0) * dt;
                }

                // Linear Movement
                if (obj.userData.velocity) {
                    obj.position.add(obj.userData.velocity.clone().multiplyScalar(dt));
                }

                // Sine Wave Oscillation
                if (obj.userData.hoverFreq) {
                    obj.userData.hoverTime = (obj.userData.hoverTime || 0) + dt;
                    obj.position.y += Math.sin(obj.userData.hoverTime * obj.userData.hoverFreq) * obj.userData.hoverAmp * dt;
                }
            });

            if (floatTimer >= FLOAT_DURATION) {
                this.finishSequence();
            }
            return;
        }

        if (!endingRoomRoot) return;

        // Trigger logic
        if (!isFloating && !isFinished) {
            const triggerWorldPos = new THREE.Vector3();
            triggerWorldPos.copy(WHITE_LIGHT_POS);
            triggerWorldPos.applyMatrix4(endingRoomRoot.matrixWorld);

            const dist = playerPos.distanceTo(triggerWorldPos);

            if (!isTriggered && dist < LIGHT_TRIGGER_DIST) {
                isTriggered = true;
                console.log("Ending Triggered - Fading to White");
                // Music already playing from init
            }

            if (isTriggered) {
                fadeTimer += 0.05;
                if (whiteOverlay) whiteOverlay.material.opacity = Math.min(fadeTimer, 1.0);

                if (fadeTimer >= 1.5) {
                    this.startFloatingSequence();
                }
            }
        }
    },

    startFloatingSequence() {
        isFloating = true;
        console.log("Teleporting to Sky");

        freezePlayerAt(null);

        clearWorld(null);
        endingRoomRoot = null;

        originalBackground = scene.background;
        const loader = new THREE.CubeTextureLoader();
        loader.setPath('sky box/sky_10_cubemap_2k/sky_10_cubemap_2k/');
        skyTexture = loader.load(['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png']);
        scene.background = skyTexture;
        scene.fog = null;

        const obj = renderer.xr.isPresenting && scene.getObjectByName("dolly") ? scene.getObjectByName("dolly") : camera;
        obj.position.set(0, 200, 0);
        obj.rotation.set(0, 0, 0);

        if (whiteOverlay) whiteOverlay.material.opacity = 0;

        this.populateScene();
    },

    populateScene() {
        console.log("Populating Sky Canvas - Extended Version");
        const gltfLoader = new GLTFLoader();

        // Helper: Create Text Box
        const createBox = (text, colorHex, pos, rot = [0, 0, 0]) => {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 256;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = colorHex === 0xff0000 ? '#cc0000' : '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = colorHex === 0xff0000 ? '#ffffff' : '#000000';
            ctx.font = 'bold 40px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const lines = Array.isArray(text) ? text : [text];
            const pxLineHeight = 50;
            const startY = (canvas.height - (lines.length * pxLineHeight)) / 2 + (pxLineHeight / 2);
            lines.forEach((l, i) => {
                ctx.fillText(l, canvas.width / 2, startY + i * pxLineHeight);
            });

            const tex = new THREE.CanvasTexture(canvas);
            const mat = new THREE.MeshBasicMaterial({ map: tex });
            const geo = new THREE.BoxGeometry(5, 3, 0.5);
            const mesh = new THREE.Mesh(geo, mat);

            mesh.position.copy(pos);
            mesh.rotation.set(...rot);
            scene.add(mesh);
            sceneObjects.push(mesh);
            return mesh;
        };

        // Helper: Load Model
        const loadAndPlace = (name, pos, scale, rot = [0, 0, 0], animData = {}) => {
            gltfLoader.load(`models/${name}`, (gltf) => {
                const model = gltf.scene;
                model.position.copy(pos);
                model.scale.setScalar(scale);
                model.rotation.set(...rot);

                Object.assign(model.userData, animData);

                scene.add(model);
                sceneObjects.push(model);
            }, undefined, (e) => console.warn(`Failed to load ${name}`, e));
        };

        // --- PLAN (51s @ 2.5u/s = ~127.5 units) ---
        // Player moves Z: 0 -> -127.5

        // 1. Atmosphere (The Void cooking) - Z: 0 to -40
        // Giant Guardian Statue rotating in distance
        loadAndPlace('Ancient_Guardian_Stat.glb', new THREE.Vector3(25, 190, -35), 2.0, [0, -Math.PI / 4, 0], { rotateSpeed: 0.05 });
        // Another one other side
        loadAndPlace('Ancient_Warrior_Monum.glb', new THREE.Vector3(-30, 215, -45), 1.5, [Math.PI / 6, Math.PI, 0], { rotateSpeed: -0.05 });

        // Extra Random Assets Triggered Early
        for (let i = 0; i < 6; i++) {
            const type = Math.random() > 0.5 ? 'Ancient_Stone_Meditat.glb' : 'Ancient_Guardian.glb';
            const xPos = (Math.random() * 60) - 30;
            const yPos = 200 + (Math.random() * 20) - 10;
            const zPos = -10 - (Math.random() * 40);
            loadAndPlace(type, new THREE.Vector3(xPos, yPos, zPos), 0.8 + Math.random(), [Math.random(), Math.random(), Math.random()], {
                rotateSpeed: (Math.random() - 0.5),
                velocity: new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5) * 0.2, -0.5)
            });
        }

        // Moving debris/statues crossing path early on
        loadAndPlace('Ancient_Stone_Meditat.glb', new THREE.Vector3(-40, 200, -20), 1.0, [0, 0, 0], { velocity: new THREE.Vector3(1.5, 0, -0.5), rotateSpeed: 0.2 });

        // 2. Introduction Credit
        // Z = -45
        createBox(["This game was", "developed by"], 0xffffff, new THREE.Vector3(0, 202, -45), [0, 0, 0]);

        // 3. Oussema (Red)
        // Z = -60
        const box2 = createBox(["Oussema Jebali"], 0xff0000, new THREE.Vector3(-6, 205, -60), [0, 0.2, 0]);
        box2.userData.rotateSpeed = 0.3;

        // Dynamic elements between credits (Flying Guardian)
        loadAndPlace('Ancient_Guardian.glb', new THREE.Vector3(40, 190, -65), 1.5, [0, -Math.PI / 2, 0], { velocity: new THREE.Vector3(-2.5, 0.5, 0) });

        // 4. Youssef (Red)
        // Z = -75
        const box3 = createBox(["Youssef Chaari"], 0xff0000, new THREE.Vector3(6, 198, -75), [0, -0.2, 0]);
        box3.userData.rotateSpeed = -0.3;

        // More atmosphere
        for (let i = 0; i < 3; i++) {
            loadAndPlace('Ancient_Stone_Meditat.glb', new THREE.Vector3((i * 15) - 15, 215, -90 - (i * 10)), 0.8, [Math.random(), Math.random(), Math.random()], { rotateSpeed: 0.5, rotateXSpeed: 0.5 });
        }

        // 5. Iheb (Red, Tilted Left)
        // Z = -90
        const box4 = createBox(["Iheb Amri"], 0xff0000, new THREE.Vector3(-6, 200, -90), [0, 0.2, 0]);
        box4.userData.rotateSpeed = 0.3;

        // 6. Finale Swarm
        // Z = -130 to -155
        // A fleet of Fiends flying alongside or towards
        gltfLoader.load('models/Forest_Fiend.glb', (gltf) => {
            const base = gltf.scene;
            for (let i = 0; i < 8; i++) {
                const fiend = base.clone();
                // Random positions around the path end
                const x = (Math.random() - 0.5) * 50;
                const y = 200 + (Math.random() - 0.5) * 40;
                const z = -140 - (Math.random() * 30);

                fiend.position.set(x, y, z);
                fiend.lookAt(0, 200, z + 10); // Look at track

                // Add some chaotic movement
                fiend.userData.velocity = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), 0.5); // Moving towards player slowly or parallel
                fiend.userData.rotateSpeed = (Math.random() - 0.5) * 0.5;

                scene.add(fiend);
                sceneObjects.push(fiend);
            }
        });

        console.log("Sky Canvas Populated - Extended");
    },

    finishSequence() {
        console.log("Returning to Corridor - Waiting for Win Screen");
        isFinished = true;
        isFloating = false;

        // Glitch Sound & Stop Music (Max Safe Volume 1.0)
        playSound('Glitch Sound Effect.mp3', 1.0);
        stopEndingTheme();

        scene.background = new THREE.Color(0x000000);
        scene.fog = new THREE.Fog(0x000000, 2, 15);

        sceneObjects.forEach(m => {
            scene.remove(m);
            if (m.geometry) m.geometry.dispose();
            if (m.material && m.material.map) m.material.map.dispose();
            if (m.material) m.material.dispose();
        });
        sceneObjects = [];

        const obj = renderer.xr.isPresenting ? scene.getObjectByName("dolly") : camera;
        obj.position.set(0, 7, 0);
        obj.rotation.set(0, 0, 0);

        freezePlayerAt(new THREE.Vector3(0, 7, 0));

        const loader = new GLTFLoader();
        loader.load('models/corridor.glb', (gltf) => {
            corridorModel = gltf.scene;
            corridorModel.position.set(0, 6, 0);
            scene.add(corridorModel);
            console.log("Restored Corridor for Finale");
        });
    },

    cleanup() {
        isActive = false;
        isTriggered = false;
        isFloating = false;
        endingRoomRoot = null;

        stopEndingTheme(); // Safety stop
        unfreezePlayer();

        if (whiteOverlay) {
            camera.remove(whiteOverlay);
            if (whiteOverlay.geometry) whiteOverlay.geometry.dispose();
            whiteOverlay = null;
        }

        sceneObjects.forEach(m => {
            scene.remove(m);
            if (m.geometry) m.geometry.dispose();
            if (m.material && m.material.map) m.material.map.dispose();
            if (m.material) m.material.dispose();
        });
        sceneObjects = [];

        if (corridorModel) {
            scene.remove(corridorModel);
            corridorModel = null;
        }

        if (skyTexture) {
            skyTexture.dispose();
            skyTexture = null;
        }
    }
};
