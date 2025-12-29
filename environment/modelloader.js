// SimpleModelLoader.js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Global cache for loaded models to prevent reloading
const modelCache = new Map();
const loader = new GLTFLoader();

export class SimpleModelLoader {
  constructor(scene) {
    this.scene = scene;
    this.model = null;
  }

  /**
   * Load a GLTF/GLB model with caching for performance
   * @param {string} path - Path to the .glb/.gltf file
   * @param {THREE} THREE - Reference to THREE for fallback
   */
  async load(path, THREE) {
    // Check cache first
    if (modelCache.has(path)) {
      console.log(`Using cached model: ${path}`);
      // Return a clone of the cached model (don't add to scene here)
      this.model = modelCache.get(path).clone();
      return this.model;
    }

    try {
      const gltf = await loader.loadAsync(path);

      this.model = gltf.scene || gltf.scenes[0];
      this.model.scale.set(1, 1, 1);
      
      // Cache the model for future use
      modelCache.set(path, this.model.clone());
      
      console.log(`Model loaded and cached: ${path}`);
      return this.model;

    } catch (error) {
      console.error('Failed to load model:', error);

      // fallback cube (optional)
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
      this.model = new THREE.Mesh(geometry, material);
      console.log('Fallback cube added to scene.');

      return this.model;
    }
  }
  
  /**
   * Clear model cache (useful for memory management)
   */
  static clearCache() {
    modelCache.clear();
  }
}