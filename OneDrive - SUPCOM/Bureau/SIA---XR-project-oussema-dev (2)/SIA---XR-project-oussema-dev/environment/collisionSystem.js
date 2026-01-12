// collisionSystem.js
import * as THREE from "three";

export class CollisionSystem {
  constructor() {
    this.colliders = [];
    this.playerRadius = 0.3;
    this.playerHeight = 1.8;

    // Simplified colliders for performance
    this.simplifiedColliders = [];
    this.colliderMeshes = [];
  }

  addCollider(object, visible = true) {
    object.traverse((child) => {
      if (!child.isMesh) return;

      // Only create collider if name contains "Cube"
      if (!child.name || !child.name.includes("Cube")) return;

      child.visible = visible;
      child.userData.isCollider = true;

      child.geometry.computeBoundingBox();
      const box = new THREE.Box3().setFromObject(child);

      this.colliders.push({
        mesh: child,
        box: box,
        isContainer: child.name.includes("room"),
      });

      // Simplified collider data
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);

      this.simplifiedColliders.push({
        center: center,
        size: size,
        box: box,
      });

      this.colliderMeshes.push(child);
    });
  }

  /**
   * Smart collision check using raycasting
   * Blocks movement only when moving directly into a wall
   */
  checkWallCollision(newPosition, currentPosition) {
    if (this.colliderMeshes.length === 0) return false;

    const direction = new THREE.Vector3()
      .subVectors(newPosition, currentPosition)
      .normalize();

    const distance = currentPosition.distanceTo(newPosition);

    const raycaster = new THREE.Raycaster(
      currentPosition,
      direction,
      0,
      distance + this.playerRadius
    );

    const intersects = raycaster.intersectObjects(
      this.colliderMeshes,
      false
    );

    if (
      intersects.length > 0 &&
      intersects[0].distance < this.playerRadius + 0.1
    ) {
      return true; // Collision detected
    }

    return false;
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

  // DEBUG: Show colliders in console
  debug() {
    console.log(`🔍 ${this.colliders.length} colliders:`);

    this.colliders.forEach((c, i) => {
      const size = c.box.getSize(new THREE.Vector3());

      console.log(
        `  ${i}: ${c.mesh.name || "unnamed"} - size: ${size.x.toFixed(
          1
        )}x${size.y.toFixed(1)}x${size.z.toFixed(1)}`
      );
    });
  }
}

export const collisionSystem = new CollisionSystem();
