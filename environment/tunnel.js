// Tunnel loader and tiling logic for the corridor
//
// This implementation replaces the original box-built tunnel with a GLB-based
// corridor.  A single corridor segment is exported from Blender as
// `corridor.glb` (stored in the `models` directory).  At runtime we
// asynchronously load the GLB, compute its bounding box to determine
// the segment length (along the Z axis), and then clone the segment
// multiple times.  These clones are positioned along the forward
// direction to create the illusion of an infinite corridor.  As the
// player moves forward or backward, clones that drift too far ahead or
// behind are repositioned around the player to maintain continuity.

import * as THREE from 'three';
import { scene, camera, renderer, dolly } from '../core/init.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Internal state for corridor tiling
let clones = [];
let segmentLength = 0;
let corridorLoaded = false;

// Which axis the corridor extends along ("x" or "z").  Determined at
// load time based on bounding box dimensions.  Used for placing
// clones and clamping lateral movement.
let corridorAxis = 'z';

// Half the usable corridor width.  This is computed after loading the
// GLB and used to clamp the player's lateral movement so that they
// cannot walk through the walls.  A small margin is subtracted to
// avoid clipping into the geometry.
let halfWidth = 0;

// -----------------------------------------------------------------------------
// Tiling configuration constants
//
// These constants control how far apart segments are placed along the forward
// axis and how much they shift along the side axis.  Adjust these values to
// experiment with different tiling behaviours.  You can change them without
// touching the rest of the code.

// Multiply the default segment length by this value to determine how far
// apart segments are spaced along the corridor.  A value of 1.0 means
// segments are placed exactly one after the other.  Increasing this value
// creates gaps; decreasing it creates overlap.
const TILE_FORWARD_MULT = 0.855;

// The amount to shift each successive segment along the side axis (in world
// units).  Positive values shift to the right (in Three.js +X or +Z depending
// on the corridor orientation), negative values to the left.  Set to zero
// for no sideways shift.  A typical value might be 4.0 if your corridor
// width is around 8 units.
const TILE_SIDE_SHIFT = 13;

// A base offset along the side axis applied to all segments (world units).
// This shifts the entire corridor sideways.  Useful if you want to align
// the origin differently relative to the mesh.  Usually set to 0.
const TILE_SIDE_BASE = 0;

// -----------------------------------------------------------------------------

// Global axis names for the forward (tiling) and side (shifting) directions.
// These are set during corridor loading based on the model's bounding box.
let forwardAxis = 'z';
let sideAxis = 'x';

// Number of corridor segments to maintain at any given time.  A
// larger value means more segments will exist simultaneously, which
// reduces the likelihood of visible popping as the player moves.
const NUM_CLONES = 7;

/**
 * Load the corridor model and build the tiled environment.
 *
 * This function should be called during initialization.  It
 * returns a Promise that resolves once the model has been loaded
 * and all clones have been added to the scene.  Other game logic
 * should wait for this promise before starting the render loop.
 */
export async function createTunnel() {
  // Clear any existing clones (in case of reinitialization).
  clones.forEach((c) => scene.remove(c));
  clones = [];
  corridorLoaded = false;

  const loader = new GLTFLoader();
  // Load the corridor GLB from the models directory.  If this
  // promise rejects, an error will propagate to the caller.
  const gltf = await loader.loadAsync('models/corridor.glb');
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  // Compute the bounding box of the corridor to determine its
  // dimensions.  The longer dimension (between X and Z) is used as
  // the forward direction for tiling, and the shorter dimension is

  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);

  // Decide whether the corridor runs along X or Z.  Use a default if
  // both dimensions are invalid.  `corridorAxis` informs the
  // placement of clones and the clamping axis in updateCorridor().
  if (size.x >= size.z) {
    corridorAxis = 'x';
    segmentLength = size.x;
    halfWidth = size.z && size.z > 0 ? size.z * 0.5 - 0.25 : 5;
  } else {
    corridorAxis = 'z';
    segmentLength = size.z;
    halfWidth = size.x && size.x > 0 ? size.x * 0.5 - 0.25 : 5;
  }

  // Set forward and side axis names based on the chosen corridor axis.
  forwardAxis = corridorAxis;
  sideAxis = corridorAxis === 'x' ? 'z' : 'x';

  // Apply a uniform material colour to the corridor to make it
  // visible.  We traverse the GLB hierarchy and assign a simple
  // Lambert material to each mesh.  You can change the colour here
  // to customise the appearance of the tunnel.
  // Assign a double-sided lambert material to each mesh so that the
  // inside of the corridor is visible.  Without double sided rendering
  // the interior faces may be culled depending on the winding order of
  // the geometry.  We also store a reference to the material so
  // neon edges can inherit this colour if desired.
  const material = new THREE.MeshLambertMaterial({ color: 0x8080c0, side: THREE.DoubleSide });
  root.traverse((child) => {
    if (child.isMesh) {
      child.material = material;
      // Add neon edges to highlight the silhouette of the corridor.
      const edgesGeom = new THREE.EdgesGeometry(child.geometry);
      const neonLine = new THREE.LineSegments(
        edgesGeom,
        new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 })
      );
      // Attach the neon line as a child so it inherits the mesh's
      // transform.  This draws bright outlines on all edges.
      child.add(neonLine);
    }
  });

  // Determine the offset so that clones are centred around the
  // origin.  For example, with 7 clones we place clones at
  // positions z = -3*L, -2*L, -1*L, 0, 1*L, 2*L, 3*L.  If you
  // increase NUM_CLONES make sure this offset still centres the
  // corridor around the player on load.
  const offset = Math.floor(NUM_CLONES / 2);

  // Clone the corridor multiple times and add each clone to the scene.
  // Each clone is assigned a logical tileIndex so we can reposition it
  // consistently during runtime.  Use TILE_FORWARD_MULT and
  // TILE_SIDE_SHIFT to compute its forward and sideways offsets.
  for (let i = 0; i < NUM_CLONES; i++) {
    // Deep clone the GLB hierarchy.  `true` ensures materials and
    // geometries are cloned rather than shared.
    const clone = root.clone(true);
    const tileIndex = i - offset;
    // Store the logical index on the clone for later reuse.
    clone.userData.tileIndex = tileIndex;
    // Compute forward offset.  Multiply by TILE_FORWARD_MULT to allow
    // experimentation with different spacing.
    const forwardOffset = tileIndex * segmentLength * TILE_FORWARD_MULT;
    // Compute side offset.  Use world units (TILE_SIDE_SHIFT) and base
    // offset (TILE_SIDE_BASE).  Adjust this constant to shift each
    // successive segment sideways.  If no shift is desired, set
    // TILE_SIDE_SHIFT to 0.
    const sideOffset = TILE_SIDE_BASE + tileIndex * TILE_SIDE_SHIFT;
    // Reset all coordinates to zero before assigning.  Then assign
    // forward and side coordinates based on the chosen axes.
    clone.position.set(0, 0, 0);
    clone.position[forwardAxis] = forwardOffset;
    clone.position[sideAxis] = sideOffset;
    scene.add(clone);
    clones.push(clone);
  }

  // Add some lights so the corridor is illuminated.  An ambient
  // light softens shadows, while a directional light simulates light
  // coming from above.  Feel free to tweak intensities and
  // positions.
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 10, 5);
  scene.add(dirLight);

  corridorLoaded = true;
}

/**
 * Update the positions of corridor segments relative to the player.
 *
 * Call this once per frame (e.g. from your animation loop) after
 * updating the player's position.  It repositions clones when they
 * drift too far from the player, giving the impression of an
 * endless corridor.  If the corridor has not been loaded yet, this
 * function does nothing.
 */
export function updateCorridor() {
  if (!corridorLoaded || segmentLength === 0) return;

  // Determine which object represents the player (camera or dolly)
  const playerObject = (renderer.xr?.isPresenting && dolly) ? dolly : camera;
  if (!playerObject) return;

  // Determine the player's coordinate along the forward axis.  Use the
  // dynamic forwardAxis determined during loading.
  const playerCoord = playerObject.position[forwardAxis];

  // The total span covered by all clones.  We use this when
  // repositioning segments that move beyond the visible range.
  const span = segmentLength * TILE_FORWARD_MULT * NUM_CLONES;

  clones.forEach((clone) => {
    // Compute the difference between the clone's coordinate along
    // the forward axis and the player's coordinate.
    const cloneCoord = clone.position[forwardAxis];
    const diff = cloneCoord - playerCoord;

    // Access the tile index stored on the clone.  If undefined, fall
    // back to zero.  tileIndex represents how many segments away from
    // the origin this clone is.
    let idx = clone.userData.tileIndex ?? 0;

    if (diff > segmentLength * TILE_FORWARD_MULT * 2) {
      // Too far ahead of the player: wrap behind by decreasing the index
      idx -= NUM_CLONES;
    } else if (diff < -segmentLength * TILE_FORWARD_MULT * 2) {
      // Too far behind the player: wrap in front by increasing the index
      idx += NUM_CLONES;
    } else {
      // No wrapping needed
      return;
    }

    // Update the stored index
    clone.userData.tileIndex = idx;
    // Recalculate positions using the updated index and tiling constants
    const newForward = idx * segmentLength * TILE_FORWARD_MULT;
    const newSide = TILE_SIDE_BASE + idx * TILE_SIDE_SHIFT;
    clone.position[forwardAxis] = newForward;
    clone.position[sideAxis] = newSide;
  });

}