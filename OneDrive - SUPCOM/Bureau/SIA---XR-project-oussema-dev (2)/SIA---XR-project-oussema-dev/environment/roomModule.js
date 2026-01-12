// RoomModule.js
//
// A reusable wrapper around loaded GLB "rooms". Each room has one or more
// entrance sockets defined in its local coordinate space. By describing
// where these entrances are and which way they face, we can snap rooms
// together so that their entrances align perfectly. Optional pre-rotation
// allows rooms authored along a different axis (e.g. along X) to be rotated
// into the common corridor axis (along Z).

import * as THREE from 'three';

/**
 * Helper: convert an arbitrary vector-like value into a THREE.Vector3.
 * Accepts arrays [x,y,z], plain objects {x,y,z} or Vector3 instances.
 * Falls back to the provided default (or zero) if no valid value is passed.
 *
 * @param {any} v
 * @param {THREE.Vector3} fallback
 * @returns {THREE.Vector3}
 */
function toVector3(v, fallback) {
  if (v instanceof THREE.Vector3) return v.clone();
  if (Array.isArray(v) && v.length === 3) {
    return new THREE.Vector3(v[0], v[1], v[2]);
  }
  if (typeof v === 'object' && v !== null &&
      typeof v.x === 'number' && typeof v.y === 'number' && typeof v.z === 'number') {
    return new THREE.Vector3(v.x, v.y, v.z);
  }
  if (fallback) return fallback.clone();
  return new THREE.Vector3(0, 0, 0);
}

/**
 * Represents a single entrance socket on a room. Entrances live in the
 * room's local coordinate space. Each entrance has a position, a forward
 * direction (pointing outwards through the door), and optionally an up
 * direction (defaults to [0,1,0]). Upon construction we normalise and
 * orthogonalise these directions.
 */
export class EntranceSocket {
  /**
   * @param {Object} params
   * @param {string} params.id              - Identifier for this socket.
   * @param {THREE.Vector3|number[]} params.position - Local centre of the doorway.
   * @param {THREE.Vector3|number[]} params.forward  - Local outward direction.
   * @param {THREE.Vector3|number[]} [params.up]     - Local up direction.
   */
  constructor(params) {
    if (!params || !params.id) {
      throw new Error('EntranceSocket requires an id');
    }
    this.id = params.id;

    this.position = toVector3(params.position, new THREE.Vector3(0, 0, 0));
    this.forward = toVector3(params.forward, new THREE.Vector3(0, 0, 1)).normalize();
    this.up = toVector3(params.up, new THREE.Vector3(0, 1, 0)).normalize();

    // Re-orthogonalise up so that it is perpendicular to forward.
    const right = new THREE.Vector3().crossVectors(this.up, this.forward).normalize();
    this.up = new THREE.Vector3().crossVectors(this.forward, right).normalize();
  }

  /**
   * Rotate this socket by a quaternion. Returns a new EntranceSocket
   * representing the rotated socket (does not mutate the original).
   *
   * @param {THREE.Quaternion} quat
   * @returns {EntranceSocket}
   */
  rotated(quat) {
    const newPos = this.position.clone().applyQuaternion(quat);
    const newFwd = this.forward.clone().applyQuaternion(quat).normalize();
    const newUp = this.up.clone().applyQuaternion(quat).normalize();
    return new EntranceSocket({
      id: this.id,
      position: newPos,
      forward: newFwd,
      up: newUp
    });
  }
}

/**
 * A wrapper around a loaded room/glb. Provides helpers to compute bounding
 * box, centre, forward/side axis, segment length and to snap one room onto
 * another via matching entrances.
 */
export class RoomModule {
  /**
   * Construct a RoomModule from a loaded Object3D and a config.
   *
   * Config requires:
   *  - id: string identifier
   *  - entrances: array of objects with {id, position, forward, up?}
   * Optionally:
   *  - defaultUp: default up vector if not specified on entrances
   *  - preRotation: a rotation in radians about the Y axis to apply before
   *    measuring bounding boxes and constructing sockets. This is useful for
   *    rooms authored along a different axis (e.g. along X) that you want to
   *    align to the common corridor axis (along Z).
   *
   * @param {THREE.Object3D} root
   * @param {Object} config
   */
  constructor(root, config) {
    if (!root) {
      throw new Error('RoomModule requires a root Object3D');
    }
    if (!config || !Array.isArray(config.entrances) || config.entrances.length === 0) {
      throw new Error('RoomModule requires a non-empty entrances array in config');
    }
    this.id = config.id || 'room';

    // Clone the root so each RoomModule owns its own instance.
    this.root = root;

    // Apply optional preRotation around the Y axis before doing any measurement
    // or constructing sockets. This rotates the entire mesh and will also be
    // applied to the entrance definitions below.
    let preRotQuat = null;
    if (typeof config.preRotation === 'number' && config.preRotation !== 0) {
      preRotQuat = new THREE.Quaternion();
      preRotQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), config.preRotation);
      // rotate the root mesh
      this.root.setRotationFromQuaternion(preRotQuat.multiply(this.root.quaternion));
      this.root.updateMatrixWorld(true);
    }

    // Compute bounding box in local space.
    const box = new THREE.Box3().setFromObject(this.root);
    this.bboxLocal = box.clone();
    const size = new THREE.Vector3();
    box.getSize(size);
    this.size = size.clone();

    const centre = new THREE.Vector3();
    box.getCenter(centre);
    this.centerLocal = centre.clone();

    // Use default up if provided; otherwise default to world up.
    this.defaultUp = toVector3(config.defaultUp, new THREE.Vector3(0, 1, 0)).normalize();

    // Build sockets map. Apply preRotation to socket definitions if provided.
    this.sockets = new Map();
    for (const e of config.entrances) {
      let socket = new EntranceSocket({
        id: e.id,
        position: e.position,
        forward: e.forward,
        up: e.up || this.defaultUp
      });
      if (preRotQuat) {
        socket = socket.rotated(preRotQuat);
      }
      this.sockets.set(socket.id, socket);
    }

    // Determine the room's forward axis (x or z) based on the largest distance
    // between its defined start/end entrances. We assume two entrances with ids
    // 'start' and 'end' exist. If they don't, forwardAxis will default to 'z'.
    const start = this.sockets.get('start');
    const end = this.sockets.get('end');
    if (start && end) {
      const dx = Math.abs(end.position.x - start.position.x);
      const dz = Math.abs(end.position.z - start.position.z);
      this.forwardAxis = dx >= dz ? 'x' : 'z';
      this.sideAxis = this.forwardAxis === 'x' ? 'z' : 'x';
      this.segmentLength = this.forwardAxis === 'x' ? dx : dz;
      // In addition to linear length, compute Euclidean span between the two entrances
      this.span = start.position.distanceTo(end.position);
    } else {
      // fallback values
      this.forwardAxis = 'z';
      this.sideAxis = 'x';
      this.segmentLength = 1;
      this.span = 1;
    }

    // Remember initial quaternion so cloned instances can preserve original orientation.
    this.initialQuaternion = this.root.quaternion.clone();
  }

  /**
   * Clone this RoomModule, including cloning its underlying Object3D.
   * Optimized to share geometries and materials for better performance.
   *
   * @returns {RoomModule}
   */
  clone() {
    // Clone the scene graph but share geometry/material references
    const clonedRoot = new THREE.Group();
    
    // Recursively copy structure while sharing geometry and materials
    const cloneNode = (source, target) => {
      source.children.forEach((child) => {
        let clonedChild;
        if (child.isMesh) {
          // Create new mesh but share geometry and material
          clonedChild = new THREE.Mesh(child.geometry, child.material);
          clonedChild.position.copy(child.position);
          clonedChild.rotation.copy(child.rotation);
          clonedChild.scale.copy(child.scale);
          clonedChild.name = child.name;
          clonedChild.castShadow = child.castShadow;
          clonedChild.receiveShadow = child.receiveShadow;
        } else if (child.isGroup || child.isObject3D) {
          clonedChild = new THREE.Group();
          clonedChild.position.copy(child.position);
          clonedChild.rotation.copy(child.rotation);
          clonedChild.scale.copy(child.scale);
          clonedChild.name = child.name;
        } else {
          // For other types, do a shallow clone
          clonedChild = child.clone();
        }
        
        target.add(clonedChild);
        
        // Recursively clone children
        if (child.children.length > 0) {
          cloneNode(child, clonedChild);
        }
      });
    };
    
    // Copy root properties
    clonedRoot.name = this.root.name;
    cloneNode(this.root, clonedRoot);
    
    // Reset transform so the clone starts at identity orientation/position.
    clonedRoot.position.set(0, 0, 0);
    clonedRoot.quaternion.copy(this.initialQuaternion);
    clonedRoot.updateMatrixWorld(true);

    // Reuse config used to build this module
    const entrances = [];
    for (const socket of this.sockets.values()) {
      entrances.push({
        id: socket.id,
        // Clone positions and directions for the config so each clone has its own objects
        position: [socket.position.x, socket.position.y, socket.position.z],
        forward: [socket.forward.x, socket.forward.y, socket.forward.z],
        up: [socket.up.x, socket.up.y, socket.up.z]
      });
    }
    const config = {
      id: this.id,
      defaultUp: [this.defaultUp.x, this.defaultUp.y, this.defaultUp.z],
      entrances: entrances,
      preRotation: 0
    };
    return new RoomModule(clonedRoot, config);
  }

  /**
   * Get a socket by id. Throws if it doesn't exist.
   * @param {string} id
   * @returns {EntranceSocket}
   */
  getSocket(id) {
    const s = this.sockets.get(id);
    if (!s) {
      throw new Error(`Socket "${id}" not found on module "${this.id}"`);
    }
    return s;
  }

  /**
   * Get world-space position and directions of a socket given the current
   * transform of the root. Useful for computing distances or snapping logic.
   *
   * @param {string} id
   * @returns {{position: THREE.Vector3, forward: THREE.Vector3, up: THREE.Vector3}}
   */
  getSocketWorld(id) {
    const socket = this.getSocket(id);
    const worldPos = this.root.localToWorld(socket.position.clone());
    const worldFwd = socket.forward.clone().applyQuaternion(this.root.quaternion).normalize();
    const worldUp = socket.up.clone().applyQuaternion(this.root.quaternion).normalize();
    return { position: worldPos, forward: worldFwd, up: worldUp };
  }

  /**
   * Compute the transform (position and rotation) required to snap the
   * socket on this module (mySocketId) onto a socket on another module
   * (theirSocketId on targetModule). The result ensures the two sockets
   * coincide in world space, with this module's forward direction facing
   * into the other module's socket (i.e. forward vectors oppose).
   *
   * @param {string} mySocketId
   * @param {RoomModule} target
   * @param {string} theirSocketId
   * @returns {{position: THREE.Vector3, quaternion: THREE.Quaternion}}
   */
  computeSnapTransform(mySocketId, target, theirSocketId) {
    const mySocket = this.getSocket(mySocketId);
    const targetWorld = target.getSocketWorld(theirSocketId);

    // Desired world forward is opposite of target's forward.
    const desiredForward = targetWorld.forward.clone().multiplyScalar(-1).normalize();
    const desiredUp = targetWorld.up.clone().normalize();

    // Local basis of my socket.
    const localFwd = mySocket.forward.clone().normalize();
    const localUp = mySocket.up.clone().normalize();
    const localRight = new THREE.Vector3().crossVectors(localUp, localFwd).normalize();
    const localUpOrtho = new THREE.Vector3().crossVectors(localFwd, localRight).normalize();

    // Target basis.
    const worldFwd = desiredForward;
    const worldUpOrtho = desiredUp;
    const worldRight = new THREE.Vector3().crossVectors(worldUpOrtho, worldFwd).normalize();
    const worldUpFinal = new THREE.Vector3().crossVectors(worldFwd, worldRight).normalize();

    // Build basis matrices.
    const localMat = new THREE.Matrix4();
    localMat.makeBasis(localRight, localUpOrtho, localFwd);

    const worldMat = new THREE.Matrix4();
    worldMat.makeBasis(worldRight, worldUpFinal, worldFwd);

    // Compute rotation quaternion that takes local basis to world basis.
    const invLocal = new THREE.Matrix4().copy(localMat).invert();
    const rotationMat = new THREE.Matrix4().multiplyMatrices(worldMat, invLocal);
    const rotationQuat = new THREE.Quaternion().setFromRotationMatrix(rotationMat);

    // Rotate local socket position to world.
    const rotatedPos = mySocket.position.clone().applyQuaternion(rotationQuat);

    // Translate so rotated socket sits at target socket world position.
    const worldPos = targetWorld.position.clone().sub(rotatedPos);

    return { position: worldPos, quaternion: rotationQuat };
  }

  /**
   * Apply the computed snap transform to this module, aligning its mySocketId
   * onto targetModule's theirSocketId.
   *
   * @param {RoomModule} target
   * @param {string} mySocketId
   * @param {string} theirSocketId
   */
  snapTo(target, mySocketId, theirSocketId) {
    const { position, quaternion } = this.computeSnapTransform(mySocketId, target, theirSocketId);
    this.root.position.copy(position);
    // Prepend the module's initial quaternion so we preserve any baked rotation.
    const finalQuat = quaternion.clone().multiply(this.initialQuaternion);
    this.root.quaternion.copy(finalQuat);
    this.root.updateMatrixWorld(true);
  }
}