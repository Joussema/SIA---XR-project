// Import Three.js components
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// Global variables
let scene, camera, renderer, controller1, controller2;
let moveSpeed = 0.05;
let keys = {};
let mouseX = 0, mouseY = 0;
let dolly; // For VR movement


// functions
async function onButtonClicked() {
    try {
        const session = await navigator.xr.requestSession("immersive-vr", {
            optionalFeatures: ['local-floor', 'hand-tracking']
        });
        
        session.addEventListener('end', () => {
            console.log('VR session ended');
        });
        
        await renderer.xr.setSession(session);
    } catch (error) {
        console.error('Error starting VR session:', error);
        alert('Failed to start VR session: ' + error.message);
    }
}

// Setup VR controllers
function setupVRControllers() {
    // Create a dolly (camera rig) for movement in VR
    dolly = new THREE.Group();
    dolly.position.set(0, 0, 0);
    dolly.add(camera);
    scene.add(dolly);
    
    // Controller 1 (right hand typically)
    controller1 = renderer.xr.getController(0);
    controller1.addEventListener('selectstart', onSelectStart);
    controller1.addEventListener('selectend', onSelectEnd);
    controller1.addEventListener('connected', function(event) {
        this.add(buildController(event.data));
    });
    controller1.addEventListener('disconnected', function() {
        this.remove(this.children[0]);
    });
    dolly.add(controller1);
    
    // Controller 2 (left hand typically)
    controller2 = renderer.xr.getController(1);
    controller2.addEventListener('selectstart', onSelectStart);
    controller2.addEventListener('selectend', onSelectEnd);
    controller2.addEventListener('connected', function(event) {
        this.add(buildController(event.data));
    });
    controller2.addEventListener('disconnected', function() {
        this.remove(this.children[0]);
    });
    dolly.add(controller2);
}

// Build controller visualization
function buildController(data) {
    let geometry, material;
    
    switch(data.targetRayMode) {
        case 'tracked-pointer':
            geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute([0.5, 0.5, 0.5, 0, 0, 0], 3));
            
            material = new THREE.LineBasicMaterial({
                vertexColors: true,
                blending: THREE.AdditiveBlending
            });
            
            return new THREE.Line(geometry, material);
            
        case 'gaze':
            geometry = new THREE.RingGeometry(0.02, 0.04, 32).translate(0, 0, -1);
            material = new THREE.MeshBasicMaterial({
                opacity: 0.5,
                transparent: true
            });
            return new THREE.Mesh(geometry, material);
    }
}

// Controller select events
function onSelectStart(event) {
    const controller = event.target;
    controller.userData.isSelecting = true;
}

function onSelectEnd(event) {
    const controller = event.target;
    controller.userData.isSelecting = false;
}

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

function createTunnel() {
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











































// Setup desktop controls
function setupControls() {
    // Keyboard controls
    document.addEventListener('keydown', (event) => {
        keys[event.key.toLowerCase()] = true;
    });

    document.addEventListener('keyup', (event) => {
        keys[event.key.toLowerCase()] = false;
    });

    // Mouse controls for desktop
    document.addEventListener('mousemove', (event) => {
        mouseX = (event.clientX / window.innerWidth) * 2 - 1;
        mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // Apply mouse look (only in desktop mode)
        if (!renderer.xr.isPresenting) {
            camera.rotation.y = -mouseX * 3.14;
            camera.rotation.x = mouseY * 3.14;
        }
    });
}

// Handle movement for both desktop and VR
function updateMovement() {
    const moveTarget = renderer.xr.isPresenting ? dolly : camera;
    
    // Get current rotation for forward movement
    const rotation = renderer.xr.isPresenting ? dolly.rotation : camera.rotation;
    
    // Calculate forward/backward direction based on camera rotation
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyEuler(rotation);
    forward.y = 0; // Keep movement horizontal
    forward.normalize();
    
    const right = new THREE.Vector3(1, 0, 0);
    right.applyEuler(rotation);
    right.y = 0;
    right.normalize();
    
    // VR Controller movement (thumbstick)
    if (renderer.xr.isPresenting && controller1) {
        const session = renderer.xr.getSession();
        if (session) {
            const inputSources = session.inputSources;
            
            for (let i = 0; i < inputSources.length; i++) {
                const inputSource = inputSources[i];
                const gamepad = inputSource.gamepad;
                
                if (gamepad && gamepad.axes.length >= 4) {
                    // Left thumbstick (axes 2,3) or right thumbstick (axes 0,1)
                    const axisX = gamepad.axes[2] || gamepad.axes[0];
                    const axisY = gamepad.axes[3] || gamepad.axes[1];
                    
                    if (Math.abs(axisX) > 0.1 || Math.abs(axisY) > 0.1) {
                        dolly.position.addScaledVector(forward, -axisY * moveSpeed);
                        dolly.position.addScaledVector(right, axisX * moveSpeed);
                    }
                }
            }
        }
    }
    
    // Desktop WASD movement
    if (!renderer.xr.isPresenting) {
        if (keys['w'] || keys['arrowup']) {
            camera.position.addScaledVector(forward, moveSpeed);
        }
        if (keys['s'] || keys['arrowdown']) {
            camera.position.addScaledVector(forward, -moveSpeed);
        }
        if (keys['a'] || keys['arrowleft']) {
            camera.position.addScaledVector(right, -moveSpeed);
        }
        if (keys['d'] || keys['arrowright']) {
            camera.position.addScaledVector(right, moveSpeed);
        }
        
        // Up/Down movement
        if (keys[' ']) {
            camera.position.y += moveSpeed;
        }
        if (keys['shift']) {
            camera.position.y -= moveSpeed;
        }
    }
}

// Animation loop
function animate() {
    updateMovement();
    renderer.render(scene, camera);
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Initialize the application
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x222222, 1, 100);

    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 1);

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Add VR button
    document.body.appendChild(VRButton.createButton(renderer));

    // Setup VR controllers
    setupVRControllers();

    // Create the tunnel
    createTunnel();
    
    // Setup desktop controls
    setupControls();
    
    // Start animation loop
    renderer.setAnimationLoop(animate);
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

// Start the application
const activateButton = document.getElementById("enterXR");

if (activateButton) {
    if (navigator.xr) {
        navigator.xr.isSessionSupported("immersive-vr").then((isSupported) => {
            if (isSupported) {
                activateButton.disabled = false;
                activateButton.textContent = "Enter XR";
                activateButton.addEventListener("click", onButtonClicked);
            } else {
                activateButton.textContent = "VR Not Supported";
            }
        });
    } else {
        activateButton.textContent = "WebXR Not Supported";
    }
}

// Initialize when page loads
init();