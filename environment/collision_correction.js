// collisionSystem.js
import * as THREE from 'three';

export class CollisionSystem {
  constructor() {
    this.colliders = [];
    this.playerRadius = 0.3; // Reduced a bit
    this.playerHeight = 1.8;
    this.simplifiedColliders = []; // Simplified bounding boxes for performance
    this.colliderMeshes = [];
  }

  addCollider(object, visible = true) {
   object.traverse((child) => {
      if (child.isMesh) {
        // Only create a collider if the name contains "Cube"
        if (!child.name || !child.name.includes('Cube')) return;

        child.visible = visible;
        child.userData.isCollider = true;

        // Ensure bounding box exists
        if (child.geometry && child.geometry.computeBoundingBox) {
          child.geometry.computeBoundingBox();
        }

        const box = new THREE.Box3().setFromObject(child);

        this.colliders.push({
          mesh: child,
          box: box,
          isContainer: child.name && child.name.includes('room'),
        });

        // Simplified colliders
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);

        this.simplifiedColliders.push({
          center: center,
          size: size,
          box: box,
        });

        // Store meshes for raycasting
        if (!this.colliderMeshes) this.colliderMeshes = [];
        this.colliderMeshes.push(child);
      }
    });
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
    if (!this.colliderMeshes || this.colliderMeshes.length === 0) return false;

    const intersects = raycaster.intersectObjects(this.colliderMeshes, false);

    // Only block if we're hitting something very close (basically at contact)
    if (intersects.length > 0 && intersects[0].distance < this.playerRadius + 0.1) {
      return true; // Collision - too close to wall
    }

    return false; // Safe to move
  }

  clear() {
    this.colliders = [];
    this.simplifiedColliders = [];
    this.colliderMeshes = [];
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
      console.log(
        `${i}: ${c.mesh.name || 'unnamed'} - size: ${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)}`
      );
    });
  }
}

export const collisionSystem = new CollisionSystem();
