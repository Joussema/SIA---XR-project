
import * as THREE from 'three';
import { SimpleModelLoader } from '../environment/modelloader.js';
import { scene } from '../core/init.js';
import { playPositionalSound } from './audioManager.js';
import { startInfiniteFlicker, stopInfiniteFlicker } from './flashlight.js';

export class RunRoomEvent {
    constructor() {
        this.isActive = false;
        this.signModel = null;
        this.ghostModel = null;
        this.ghostTriggered = false;
        this.screamSound = null;

        // Configuration
        this.signSpawnPosition = new THREE.Vector3(0, -1, 2);
        this.ghostSpawnOffset = new THREE.Vector3(0, 1, 10); // Z is magnitude behind sign
        this.triggerDistance = 2.0;
        this.chaseSpeed = 1.3;

        // New Tunables
        this.ghostScale = 1.0;
        this.floatAmplitude = 0.2;
        this.floatFrequency = 0.7;

        this.startTime = 0;
    }

    async init(roomRoot) {
        if (this.isActive) return;
        this.isActive = true;
        this.ghostTriggered = false;
        this.roomRoot = roomRoot;

        const loader = new SimpleModelLoader(scene);

        try {
            // Load Run Sign
            const signGlb = await loader.load('models/run sign.glb', THREE);
            if (signGlb.parent === scene) scene.remove(signGlb);
            this.signModel = signGlb;

            this.signModel.position.copy(this.signSpawnPosition);
            this.signModel.rotation.set(0, 0, 0);

            this.roomRoot.add(this.signModel);
            console.log('RunRoomEvent: Sign spawned');

        } catch (e) {
            console.error('RunRoomEvent: Failed to load assets', e);
        }
    }

    update(playerPos) {
        if (!this.isActive || !this.signModel) return;

        if (this.ghostTriggered) {
            // Chase Logic
            if (this.ghostModel) {
                // Horizontal Chase Only
                const targetX = playerPos.x;
                const targetZ = playerPos.z;

                const ghostPos = this.ghostModel.position;
                const dx = targetX - ghostPos.x;
                const dz = targetZ - ghostPos.z;

                // Normalize direction vector (2D)
                const dist = Math.sqrt(dx * dx + dz * dz);
                const dirX = dist > 0 ? dx / dist : 0;
                const dirZ = dist > 0 ? dz / dist : 0;

                const moveStep = this.chaseSpeed * 0.016;

                ghostPos.x += dirX * moveStep;
                ghostPos.z += dirZ * moveStep;

                // Floating Effect (Y-axis)
                // Base height + sine wave
                const elapsedTime = (Date.now() - this.startTime) / 1000;

                if (this.baseY === undefined) {
                    this.baseY = ghostPos.y;
                }

                ghostPos.y = this.baseY + Math.sin(elapsedTime * this.floatFrequency) * this.floatAmplitude;

                // Look at player (horizontal only for reliable rotation?)
                this.ghostModel.lookAt(new THREE.Vector3(playerPos.x, ghostPos.y, playerPos.z));
            }
            return;
        }

        // Check Trigger
        const signWorldPos = new THREE.Vector3();
        this.signModel.getWorldPosition(signWorldPos);

        // Use 2D distance (XZ) to ignore height differences
        const dx = playerPos.x - signWorldPos.x;
        const dz = playerPos.z - signWorldPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < this.triggerDistance) {
            this.triggerGhost(signWorldPos, playerPos);
        }
    }

    async triggerGhost(signWorldPos, playerPos) {
        this.ghostTriggered = true;
        this.startTime = Date.now();
        console.log('RunRoomEvent: Triggering Ghost & Effects');

        // 1. Flashlight Flicker
        startInfiniteFlicker();

        const loader = new SimpleModelLoader(scene);
        try {
            const ghostGlb = await loader.load('models/mayan ghost.glb', THREE);
            if (ghostGlb.parent === scene) scene.remove(ghostGlb);
            this.ghostModel = ghostGlb;

            // Apply scale
            this.ghostModel.scale.setScalar(this.ghostScale);

            // Calculate spawn position behind the sign relative to player
            // But keep it strictly on the room's forward/backward axis (Z)
            // 1. Get Room's Local Z axis in World Space
            const roomZ = new THREE.Vector3(0, 0, 1).applyQuaternion(this.roomRoot.quaternion).normalize();

            // 2. Vector from Player -> Sign
            const playerToSign = new THREE.Vector3().subVectors(signWorldPos, playerPos);

            // 3. Check if player is approaching from +Z or -Z of the sign relative to roomZ
            // Dot product tells us if the approach vector is aligned with roomZ
            const dot = playerToSign.dot(roomZ);
            const sideFactor = -Math.sign(dot); // Flip sign to ensure spawn is behind the ghost from player's view

            // 4. Ghost distance behind sign (using Z offset from config as distance magnitude)
            const distanceBehind = this.ghostSpawnOffset.z;

            // 5. Place ghost only along the roomZ axis relative to signWorldPos
            // This prevents spawning outside side walls
            const spawnPos = signWorldPos.clone().add(roomZ.multiplyScalar(sideFactor * distanceBehind));

            // Apply Y offset from config
            spawnPos.y += this.ghostSpawnOffset.y;

            this.ghostModel.position.copy(spawnPos);
            this.ghostModel.lookAt(signWorldPos); // Look at sign (towards player approx)

            // Set Initial Base Y for floating
            this.baseY = spawnPos.y;

            scene.add(this.ghostModel);

            // 2. Play Sound Loop
            this.screamSound = playPositionalSound('mayan scream.mp3', this.ghostModel, 2, 25, 1.5, 1.0, true);

        } catch (e) {
            console.error('RunRoomEvent: Failed to load ghost', e);
        }
    }

    cleanup() {
        this.isActive = false;
        this.ghostTriggered = false;
        this.baseY = undefined;

        // Stop effects
        stopInfiniteFlicker();

        if (this.screamSound) {
            if (this.screamSound.isPlaying) this.screamSound.stop();
            if (this.screamSound.parent) this.screamSound.parent.remove(this.screamSound);
            this.screamSound = null;
        }

        if (this.signModel) {
            if (this.signModel.parent) this.signModel.parent.remove(this.signModel);
            this.signModel = null;
        }

        if (this.ghostModel) {
            if (this.ghostModel.parent) this.ghostModel.parent.remove(this.ghostModel);
            this.ghostModel = null;
        }
    }
}

export const runRoomEvent = new RunRoomEvent();
