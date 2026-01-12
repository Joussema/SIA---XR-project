// collisionSystem.js
import * as THREE from 'three';

export class CollisionSystem {
    constructor() {
        this.colliders = [];
        this.playerRadius = 0.3; // Reduced a bit
        this.playerHeight = 1.8;
        this.simplifiedColliders = []; // Simplified bounding boxes for performance
    }
    
    addCollider(object, visible = true) {
        object.traverse((child) => {
            if (child.isMesh) {
                child.visible = visible;
                child.userData.isCollider = true;
                child.geometry.computeBoundingBox();
                
                const box = new THREE.Box3().setFromObject(child);
                
                this.colliders.push({
                    mesh: child,
                    box: box,
                    isContainer: child.name && child.name.includes('room')
                });
                
                // Create simplified collider (just the bounding box) for fast checks
                const center = new THREE.Vector3();
                const size = new THREE.Vector3();
                box.getCenter(center);
                box.getSize(size);
                
                this.simplifiedColliders.push({
                    center: center,
                    size: size,
                    box: box
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
     * Smart collision check - only blocks if moving directly into a wall
     * Uses raycasting in movement direction for accurate detection
     */
    checkWallCollision(newPosition, currentPosition) {
        // Only do collision check if we have colliders
        if (this.simplifiedColliders.length === 0) return false;
        
        // Calculate movement direction
        const direction = new THREE.Vector3()
            .subVectors(newPosition, currentPosition)
            .normalize();
        
        const distance = currentPosition.distanceTo(newPosition);
        
        // Raycast from current position in movement direction
        const raycaster = new THREE.Raycaster(
            currentPosition,
            direction,
            0,
            distance + this.playerRadius
        );
        
        // Check against only actual geometry (not bounding boxes)
        const meshesToCheck = this.colliders
            .filter(c => c.mesh && c.mesh.geometry)
            .map(c => c.mesh);
        
        if (meshesToCheck.length === 0) return false;
        
        const intersects = raycaster.intersectObjects(meshesToCheck, false);
        
        // Only block if we're hitting something very close (basically at contact)
        if (intersects.length > 0 && intersects[0].distance < this.playerRadius + 0.1) {
            return true; // Collision - too close to wall
        }
        
        return false; // Safe to move
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
        this.simplifiedColliders = [];
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