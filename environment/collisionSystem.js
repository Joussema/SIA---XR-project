// collisionSystem.js
import * as THREE from 'three';

export class CollisionSystem {
    constructor() {
        this.colliders = [];
        this.playerRadius = 0.3; // Reduced a bit
        this.playerHeight = 1.8;
    }
    
    addCollider(object, visible = true) {
        object.traverse((child) => {
            if (child.isMesh) {
                child.visible = visible;
                child.userData.isCollider = true;
                child.geometry.computeBoundingBox();
                
                this.colliders.push({
                    mesh: child,
                    box: new THREE.Box3().setFromObject(child),
                    isContainer: child.name && child.name.includes('room') // Example
                });
            }
        });
    }
    
    /**
     * Checks if we are going to COLLIDE with a wall from the inside
     * Does not block if we are already inside
     */
    checkCollision(newPosition, currentPosition) {
        // Smaller radius for detection
        const detectionRadius = this.playerRadius * 0.8;
        
        // Box for the new position
        const newBox = new THREE.Box3(
            new THREE.Vector3(
                newPosition.x - detectionRadius,
                newPosition.y - 0.1,
                newPosition.z - detectionRadius
            ),
            new THREE.Vector3(
                newPosition.x + detectionRadius,
                newPosition.y + this.playerHeight,
                newPosition.z + detectionRadius
            )
        );
        
        // Box for the current position
        const currentBox = new THREE.Box3(
            new THREE.Vector3(
                currentPosition.x - detectionRadius,
                currentPosition.y - 0.1,
                currentPosition.z - detectionRadius
            ),
            new THREE.Vector3(
                currentPosition.x + detectionRadius,
                currentPosition.y + this.playerHeight,
                currentPosition.z + detectionRadius
            )
        );
        
        for (const collider of this.colliders) {
            // Check if the NEW position will collide
            const willCollide = newBox.intersectsBox(collider.box);
            
            // Check if we are ALREADY colliding (starting position)
            const alreadyColliding = currentBox.intersectsBox(collider.box);
            
            // IMPORTANT: Block only if:
            // 1. We are about to collide AND
            // 2. We were NOT already colliding
            if (willCollide && !alreadyColliding) {
                console.log('🚫 Blocked: about to hit a wall');
                return true;
            }
            
            // If we are already colliding (inside), that's OK
            // We can continue moving inside
        }
        
        return false;
    }
    
    /**
     * Alternative version: Check only the CONTACT POINT
     */
    checkWallCollision(newPosition, currentPosition) {
        // Movement direction
        const direction = new THREE.Vector3()
            .subVectors(newPosition, currentPosition)
            .normalize();
        
        // Raycast from current position
        const raycaster = new THREE.Raycaster(
            currentPosition,
            direction,
            0,
            this.playerRadius + 0.1 // Detection distance
        );
        
        // List of collision meshes
        const colliderMeshes = this.colliders.map(c => c.mesh);
        
        const intersects = raycaster.intersectObjects(colliderMeshes, true);
        
        if (intersects.length > 0) {
            console.log('🚫 Wall detected at distance:', intersects[0].distance);
            return true;
        }
        
        return false;
    }
    
    /**
     * Simple collision check - only prevent going through walls
     * This is the easiest method
     */
    checkSimpleCollision(newPosition) {
        // Create a test point slightly ahead of the player
        const testPoint = newPosition.clone();
        
        // Check only nearby walls
        for (const collider of this.colliders) {
            // Distance between test point and collider center
            const colliderCenter = new THREE.Vector3();
            collider.box.getCenter(colliderCenter);
            
            const distance = testPoint.distanceTo(colliderCenter);
            const colliderSize = collider.box.getSize(new THREE.Vector3()).length();
            
            // If too close to a wall (about to go through)
            if (distance < colliderSize / 2 - this.playerRadius) {
                console.log('🚫 Too close to wall');
                return true;
            }
        }
        
        return false;
    }
    
    clear() {
        this.colliders = [];
    }
    
    update() {
        for (const collider of this.colliders) {
            collider.box.setFromObject(collider.mesh);
        }
    }
    
    // DEBUG: Show colliders
    debug() {
        console.log(`🔍 ${this.colliders.length} colliders:`);
        this.colliders.forEach((c, i) => {
            const size = c.box.getSize(new THREE.Vector3());
            console.log(`  ${i}: ${c.mesh.name || 'unnamed'} - size: ${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)}`);
        });
    }
}

export const collisionSystem = new CollisionSystem();