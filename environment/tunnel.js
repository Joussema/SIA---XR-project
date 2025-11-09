import * as THREE from 'three';
import { scene } from '../core/init.js';




// ========================================
// BLOCK 1: LOAD TEXTURES
// ========================================
function loadTextures() {
    const textureLoader = new THREE.TextureLoader();
    
    // Wall texture
    const wallTexture = textureLoader.load(
        'images/white-wall.jpg',
        function(texture) {
            console.log('Wall texture loaded');
        },
        undefined,
        function(error) {
            console.log('Wall texture failed to load, using color only');
        }
    );
    wallTexture.wrapS = THREE.RepeatWrapping;
    wallTexture.wrapT = THREE.RepeatWrapping;
    wallTexture.repeat.set(2, 2);

    // Floor texture
    const floorTexture = textureLoader.load(
        'images/seamless-texture.jpg',
        function(texture) {
            console.log('Floor texture loaded');
        },
        undefined,
        function(error) {
            console.log('Floor texture failed to load, using color only');
        }
    );
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(8, 20);

    return { wallTexture, floorTexture };
}

// ========================================
// BLOCK 2: CREATE FORWARD TUNNEL
// ========================================
function createForwardTunnel(a,b,c,segments,wallGeometry,wallMaterial) {
    
    
    for (let i = 0; i < segments; i++) {
        // Left wall
        const leftWall = new THREE.Mesh(wallGeometry, wallMaterial);
        leftWall.position.set(a, 0, -i * 4);
        leftWall.scale.set(0.5, 1, 1);
        scene.add(leftWall);

        

        
        // Ceiling
        const ceiling = new THREE.Mesh(wallGeometry, wallMaterial);
        ceiling.position.set(c, 2.5, -i * 4);
        ceiling.scale.set(1, 0.3, 1);
        scene.add(ceiling);
   }
    for(let i=0; i<segments+3; i++){
        // Right wall
        const rightWall = new THREE.Mesh(wallGeometry, wallMaterial);
        rightWall.position.set(b, 0, -i * 4 + 6);
        rightWall.scale.set(0.5, 1, 1);
        scene.add(rightWall);

}
}
// ========================================
// BLOCK 3: CREATE NEON FRAMES
// ========================================
//function createNeonFrames(segments) {
//    for (let i = 0; i < segments; i++) {
//       createNeonFrame(0, 0, -i * 4);
//    }
//}

//function createNeonFrame(x, y, z) {
//    const frameGroup = new THREE.Group();
    
    // Frame dimensions
//    const width = 6;
//    const height = 4;
//    const thickness = 0.1;
    
    // Create glowing material
 //   const neonMaterial = new THREE.MeshBasicMaterial({
   //     color: 0x00ffff,
   //     transparent: true,
//        opacity: 0.8
  //  });
    
    // Create frame segments (top, bottom, left, right)
  //  const segments = [
    //    { pos: [0, height/2, 0], scale: [width, thickness, thickness] },
      //  { pos: [0, -height/2, 0], scale: [width, thickness, thickness] },
 //       { pos: [-width/2, 0, 0], scale: [thickness, height, thickness] },
   //     { pos: [width/2, 0, 0], scale: [thickness, height, thickness] }
    //];
    
   // segments.forEach(segment => {
     //   const geometry = new THREE.BoxGeometry(1, 1, 1);
       // const frame = new THREE.Mesh(geometry, neonMaterial);
       // frame.position.set(...segment.pos);
   //     frame.scale.set(...segment.scale);
     //   frameGroup.add(frame);
        
        // Add point light for each segment
       // const light = new THREE.PointLight(0x00ffff, 0.8, 15);
       // light.position.set(...segment.pos);
      //  frameGroup.add(light);
   // });
    
    // Add central bright light
   // const centerLight = new THREE.PointLight(0x00ffff, 1.5, 20);
   // centerLight.position.set(0, 0, 0);
  //  frameGroup.add(centerLight);
    
    // Position the entire frame
 //   frameGroup.position.set(x, y, z);
  //  scene.add(frameGroup);
//}

// ========================================
// BLOCK 4: CREATE FLOOR
// ========================================
function createFloor(floorTexture,florx,flory,florz) {
    const floorGeometry = new THREE.PlaneGeometry(100, 100);
    const floorMaterial = new THREE.MeshLambertMaterial({ 
        map: floorTexture,
        color: 0x444444
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = florx;
    floor.position.y = flory;
    floor.position.z = florz;
    scene.add(floor);
}

// ========================================
// BLOCK 5: CREATE LIGHTING
// ========================================
function createLighting() {
    // Atmospheric lighting
    const ambientLight = new THREE.AmbientLight(0xe2e2f1, 0.3);
    scene.add(ambientLight);

    // Main directional light
    const directionalLight = new THREE.DirectionalLight(0xe4e4f5, 0.5);
    directionalLight.position.set(0, 5, 5);
    scene.add(directionalLight);
}


function createLeftTurnTunnel( a,b,c,segments,wallGeometry,wallMaterial) {
    
  
        for (let i = 0; i < segments; i++) {

        
                // Right wall
        const leftWall = new THREE.Mesh(wallGeometry, wallMaterial);
        leftWall.position.set(-6*i-6, 0,b);
        leftWall.scale.set(1, 1, 1);
        scene.add(leftWall);
    }
for(let i=0; i<segments+2; i++){
            // Create left wall (inner curve)
        const rightWall = new THREE.Mesh(wallGeometry, wallMaterial);
        rightWall.position.set(-6*i, 0,a);
        rightWall.scale.set(1, 1, 1);
        scene.add(rightWall);
                
        // Ceiling
        const ceiling = new THREE.Mesh(wallGeometry, wallMaterial);
        ceiling.position.set(-i*6, 2.5, c);
        ceiling.scale.set(1, 0.3, 1.5);
        scene.add(ceiling);
}
}

export function createTunnel() {
    // Load textures
    const { wallTexture, floorTexture } = loadTextures();
    
    // Create wall material
    const wallMaterial = new THREE.MeshLambertMaterial({ 
        map: wallTexture,
        color: 0xffffff
    });
    
    // Build tunnel components
    const segments = 5;
    const wallGeometry = new THREE.BoxGeometry(6, 4, 4);
    createForwardTunnel(-4,4,0,segments,wallGeometry,wallMaterial);
    createForwardTunnel(-32,-40,-36,segments,wallGeometry,wallMaterial);
    //createNeonFrames(segments);
    createFloor(floorTexture, -Math.PI / 2, -2, -30);
    createLighting();
    // Just call this one function
    createLeftTurnTunnel(9,0,4.5,segments,wallGeometry,wallMaterial);
    createLeftTurnTunnel(-25,-16,-21,segments,wallGeometry,wallMaterial);
}
