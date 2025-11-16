// SimpleModelLoader.js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class SimpleModelLoader {
  constructor(scene) {
    this.scene = scene;
    this.model = null;
  }

  /**
   * Load a GLTF/GLB model and add it to the scene
   * @param {string} path - Path to the .glb/.gltf file
   * @param {THREE} THREE - Reference to THREE for fallback
   */
  async load(path, THREE) {
    const loader = new GLTFLoader();

    try {
      const gltf = await loader.loadAsync(path);

      this.model = gltf.scene || gltf.scenes[0];
      this.model.scale.set(1, 1, 1); // scale if needed
      this.scene.add(this.model);

      console.log(`Model loaded successfully: ${path}`);
      return this.model;

    } catch (error) {
      console.error('Failed to load model:', error);

      // fallback cube (optional)
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
      this.model = new THREE.Mesh(geometry, material);
      this.scene.add(this.model);
      console.log('Fallback cube added to scene.');

      return this.model;
    }
  }
}