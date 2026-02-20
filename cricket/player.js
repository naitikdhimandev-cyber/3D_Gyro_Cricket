import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

// Add at the top for easy tuning
export let batBladeLength = 0.7; // Increased further from 0.62 for longer bat
export let batPivotYOffset = 0.08; // Move bat pivot up by 8cm

// Player group (batsman + bat)
const playerGroup = new THREE.Group();
let bat, batsman, batPivot;
let isSwinging = false;
let swingStart = 0;
const SWING_DURATION = 0.4; // seconds
const SWING_START_ANGLE = -Math.PI / 3; // -60 deg
const SWING_END_ANGLE = Math.PI / 9;    // +20 deg

// How much to move the character left (negative = left, positive = right)
export let characterLeftOffset = -0.45; // Move 0.5m left

// Set playerGroup position to batting side crease (in front of batsman's wicket)
playerGroup.position.set(characterLeftOffset, 0.05, 11.06 - 0.7); // moved left (x = -0.3 by default)
playerGroup.rotation.y = Math.PI / 2; // rotate 90deg to face down the pitch

// Helper: fallback batsman (cylinder) and bat (box)
function createFallbackPlayer() {
  // Remove lower body (cylinder) and bat

  // Custom upper body (cuboid with slanted bottom in z axis)
  const width = 0.28, height = 0.38, depth = 0.2;
  const slant = 0.13; // how much to move the bottom face in -z
  const mainBlue = 0x1a237e;
  const stripeBlue = 0x42a5f5;
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    // Top face (y = +height/2)
    -width/2,  height/2, -depth/2, // 0 left top back
     width/2,  height/2, -depth/2, // 1 right top back
     width/2,  height/2,  depth/2, // 2 right top front
    -width/2,  height/2,  depth/2, // 3 left top front
    // Bottom face (y = -height/2, slanted in -z)
    -width/2, -height/2, -depth/2 - slant, // 4 left bottom back
     width/2, -height/2, -depth/2 - slant, // 5 right bottom back
     width/2, -height/2,  depth/2 - slant, // 6 right bottom front
    -width/2, -height/2,  depth/2 - slant  // 7 left bottom front
  ]);
  const indices = [
    // Top
    0, 1, 2, 0, 2, 3,
    // Bottom
    4, 6, 5, 4, 7, 6,
    // Sides
    0, 4, 5, 0, 5, 1, // back
    1, 5, 6, 1, 6, 2, // right
    2, 6, 7, 2, 7, 3, // front
    3, 7, 4, 3, 4, 0  // left
  ];
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const upperBody = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: mainBlue })
  );
  upperBody.position.y = 0.38 + 0.2;

  // Add a lighter blue stripe (Indian team style)
  const stripeGeom = new THREE.BoxGeometry(width * 0.95, height * 0.18, depth * 1.01);
  const stripe = new THREE.Mesh(
    stripeGeom,
    new THREE.MeshStandardMaterial({ color: stripeBlue })
  );
  stripe.position.y = upperBody.position.y + 0.03;
  playerGroup.add(stripe);

  // Shoulders (spheres on left and right, axis perpendicular to pitch)
  const shoulderRadius = 0.09;
  const shoulderY = 0.38 + 0.2 + height/2 - 0.08;
  const shoulderZ = 0; // center on z axis
  const shoulderOffset = width/2 + shoulderRadius * 0.25; // user-adjusted closer shoulders
  const leftShoulder = new THREE.Mesh(
    new THREE.SphereGeometry(shoulderRadius, 16, 16),
    new THREE.MeshStandardMaterial({ color: mainBlue })
  );
  leftShoulder.position.set(-shoulderOffset, shoulderY, shoulderZ);
  const rightShoulder = new THREE.Mesh(
    new THREE.SphereGeometry(shoulderRadius, 16, 16),
    new THREE.MeshStandardMaterial({ color: mainBlue })
  );
  rightShoulder.position.set(shoulderOffset, shoulderY, shoulderZ);

  // Second row of spheres (same x, lower y, offset z)
  const lowerY = shoulderY - 0.2;
  const lowerZ = -0.06; // slight z offset
  const leftLower = new THREE.Mesh(
    new THREE.SphereGeometry(shoulderRadius, 10, 10),
    new THREE.MeshStandardMaterial({ color: mainBlue })
  );
  leftLower.position.set(-shoulderOffset, lowerY, lowerZ);
  const rightLower = new THREE.Mesh(
    new THREE.SphereGeometry(shoulderRadius, 12, 12),
    new THREE.MeshStandardMaterial({ color: mainBlue })
  );
  rightLower.position.set(shoulderOffset, lowerY, lowerZ);

  // Add two smaller spheres below the shoulders, closer together, further down and in z axis
  const smallRadius = shoulderRadius / 2;
  const smallY = lowerY - 0.13; // further down
  const smallZ = lowerZ + 0.29; // more in z axis
  const smallOffset = shoulderOffset * 0.5; // closer together
  const leftSmall = new THREE.Mesh(
    new THREE.SphereGeometry(smallRadius, 10, 10),
    new THREE.MeshStandardMaterial({ color: mainBlue })
  );
  leftSmall.position.set(-smallOffset, smallY, smallZ);
  const rightSmall = new THREE.Mesh(
    new THREE.SphereGeometry(smallRadius, 10, 10),
    new THREE.MeshStandardMaterial({ color: mainBlue })
  );
  rightSmall.position.set(smallOffset, smallY, smallZ);

  // Neck (short cylinder)
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.07, 12),
    new THREE.MeshStandardMaterial({ color: 0xffe0bd })
  );
  neck.position.y = 0.38 + 0.19 + 0.035 + 0.2;

  // Head (oval/ellipsoid)
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xffe0bd })
  );
  head.position.y = 0.38 + 0.19 + 0.07 + 0.22 + 0.2 - 0.07; // move head slightly down
  head.scale.set(0.5, 0.99, 0.8);

  // Helmet (sphere on head)
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 18, 18, 0, Math.PI * 2, 0, Math.PI * 0.7),
    new THREE.MeshStandardMaterial({ color: 0x2d3a4a, metalness: 0.3, roughness: 0.4 })
  );
  helmet.position.set(0, head.position.y + 0.27, 0.01); // sit on top of head, slight forward
  helmet.scale.set(0.9, 0.9, 0.8); // slightly oval, covers more front

  playerGroup.add(upperBody);
  playerGroup.add(leftShoulder);
  playerGroup.add(rightShoulder);
  playerGroup.add(leftLower);
  playerGroup.add(rightLower);
  playerGroup.add(leftSmall);
  playerGroup.add(rightSmall);
  playerGroup.add(neck);
  playerGroup.add(head);
  playerGroup.add(helmet);
  playerGroup.add(stripe);

  // Join each shoulder and lower sphere with a cylinder (arm)
  function addArm(from, to) {
    const armVec = new THREE.Vector3().subVectors(to.position, from.position);
    const armLength = armVec.length();
    const armGeom = new THREE.CylinderGeometry(0.087, 0.089, armLength, 14);
    const armMat = new THREE.MeshStandardMaterial({ color: mainBlue });
    const arm = new THREE.Mesh(armGeom, armMat);
    // Add a lighter blue stripe to the arm
    const stripeArmGeom = new THREE.CylinderGeometry(0.093, 0.093, armLength * 0.22, 14);
    const stripeArm = new THREE.Mesh(stripeArmGeom, new THREE.MeshStandardMaterial({ color: stripeBlue }));
    stripeArm.position.y = armLength * 0.18;
    arm.add(stripeArm);
    // Position at midpoint
    arm.position.copy(from.position).add(to.position).multiplyScalar(0.5);
    // Align with direction
    arm.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      armVec.clone().normalize()
    );
    playerGroup.add(arm);
  }
  addArm(leftShoulder, leftLower);
  addArm(rightShoulder, rightLower);

  // Add arms from lower spheres to new small spheres, with thickness based on their radii
  function addSmoothArm(from, to, fromRadius, toRadius) {
    const armVec = new THREE.Vector3().subVectors(to.position, from.position);
    const armLength = armVec.length();
    const armGeom = new THREE.CylinderGeometry(toRadius, fromRadius, armLength, 14);
    const armMat = new THREE.MeshStandardMaterial({ color: mainBlue });
    const arm = new THREE.Mesh(armGeom, armMat);
    // Add a lighter blue stripe to the arm
    const stripeArmGeom = new THREE.CylinderGeometry(Math.max(toRadius, fromRadius) * 1.05, Math.max(toRadius, fromRadius) * 1.05, armLength * 0.22, 14);
    const stripeArm = new THREE.Mesh(stripeArmGeom, new THREE.MeshStandardMaterial({ color: stripeBlue }));
    stripeArm.position.y = armLength * 0.18;
    arm.add(stripeArm);
    // Position at midpoint
    arm.position.copy(from.position).add(to.position).multiplyScalar(0.5);
    // Align with direction
    arm.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      armVec.clone().normalize()
    );
    playerGroup.add(arm);
  }
  addSmoothArm(leftLower, leftSmall, shoulderRadius, smallRadius);
  addSmoothArm(rightLower, rightSmall, shoulderRadius, smallRadius);

  // Create a realistic bat model
  const batGroup = new THREE.Group();
  // Handle (cylinder)
  const handleLength = 0.32;
  const handleRadius = smallRadius * 0.7;
  const handleGeom = new THREE.CylinderGeometry(handleRadius, handleRadius, handleLength, 16);
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x8d5524 });
  const handle = new THREE.Mesh(handleGeom, handleMat);
  // Position handle so its top is at (0,0,0) (pivot point)
  handle.position.set(0, -handleLength / 2, 0);
  batGroup.add(handle);
  // Blade (cuboid with curved edges)
  const bladeLength = batBladeLength;
  const bladeWidth = 0.11;
  const bladeDepth = 0.035;
  const bladeGeom = new THREE.BoxGeometry(bladeWidth, bladeLength, bladeDepth);
  // Curve the blade's edges
  for (let i = 0; i < bladeGeom.attributes.position.count; i++) {
    const y = bladeGeom.attributes.position.getY(i);
    const z = bladeGeom.attributes.position.getZ(i);
    // Curve the front (hitting side)
    if (z > 0) bladeGeom.attributes.position.setZ(i, z + 0.01 * Math.sin((y / bladeLength + 0.5) * Math.PI));
    // Curve the back (mountain/ridge)
    if (z < 0) bladeGeom.attributes.position.setZ(i, z - 0.012 * Math.sin((y / bladeLength + 0.5) * Math.PI));
  }
  bladeGeom.computeVertexNormals();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xf5e1a4 });
  const blade = new THREE.Mesh(bladeGeom, bladeMat);
  // Position blade so its bottom is at (0,0,0) (pivot point)
  blade.position.set(0, bladeLength / 2, 0);
  // Rotate blade 90 degrees anticlockwise in its own plane (around Y axis)
  blade.rotation.y = -Math.PI / 2;
  batGroup.add(blade);
  // Ridge (mountain) on the back
  const ridgeGeom = new THREE.BoxGeometry(bladeWidth * 0.5, bladeLength * 0.7, bladeDepth * 0.5);
  for (let i = 0; i < ridgeGeom.attributes.position.count; i++) {
    const y = ridgeGeom.attributes.position.getY(i);
    // Make the ridge peak in the middle
    ridgeGeom.attributes.position.setZ(i, ridgeGeom.attributes.position.getZ(i) - 0.018 * Math.cos((y / (bladeLength * 0.7)) * Math.PI));
  }
  ridgeGeom.computeVertexNormals();
  const ridgeMat = new THREE.MeshStandardMaterial({ color: 0xe0c080 });
  const ridge = new THREE.Mesh(ridgeGeom, ridgeMat);
  // Position ridge relative to blade
  ridge.position.set(0, bladeLength * 0.15, -bladeDepth * 0.5);
  batGroup.add(ridge);
  // Position batGroup so pivot (handle-blade joint) is at the midpoint between hands
  const handA = leftSmall.position;
  const handB = rightSmall.position;
  const pivot = new THREE.Vector3().addVectors(handA, handB).multiplyScalar(0.5);
  batGroup.position.copy(pivot);
  // Align handle with vector from handA to handB
  const handleDir = new THREE.Vector3().subVectors(handB, handA).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, handleDir);
  batGroup.quaternion.copy(quat);
  // Rotate bat so blade is upright and parallel to the pitch (z-axis), facing batsman's wicket
  batGroup.rotateY(Math.PI / 2); // 90 deg toward batsman wicket
  // Remove this line to avoid resetting the bat's rotation every time:
  // batGroup.rotation.set(0, Math.PI / 2, 0);
  // Move batGroup forward in z so blade is in front of wicket
  batGroup.position.z += 0.09;
  playerGroup.add(batGroup);
  window.batGroup = batGroup;

  // Expose batGroup globally for external control
  // window.batGroup = batGroup; // This line is now redundant as it's set in loadPlayerModels

  // --- 6-Axis Bat Rotation Control ---
  let manualBatControl = false;
  let lastPointer = null;
  // Remove batEuler and any fixed rotation logic
  // let batEuler = new THREE.Euler(0, 0, SWING_START_ANGLE, 'XYZ');

  // Mouse/touchpad drag to rotate bat
  function onPointerDown(e) {
    if (!(window.isBattingMode && window.isBattingMode())) return;
    manualBatControl = true;
    lastPointer = { x: e.clientX, y: e.clientY };
    document.body.style.cursor = 'grabbing';
  }
  function onPointerMove(e) {
    if (!manualBatControl || !lastPointer) return;
    if (!(window.isBattingMode && window.isBattingMode())) return;
    const dx = e.clientX - lastPointer.x;
    const dy = e.clientY - lastPointer.y;
    // Sensitivity factors
    const sensX = 0.01, sensY = 0.01;
    // Directly update batGroup.rotation incrementally
    batGroup.rotation.y -= dx * sensX; // yaw (left/right)
    batGroup.rotation.x -= dy * sensY; // pitch (up/down)
    lastPointer = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp() {
    manualBatControl = false;
    lastPointer = null;
    document.body.style.cursor = '';
  }
  // (Removed: do not reset batGroup.rotation to batEuler)
  batGroup.userData.manual = true;
  // Attach listeners to canvas
  const canvas = document.querySelector('canvas');
  if (canvas) {
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointerleave', onPointerUp);
  }

  // --- ESP32 Gyro Sensor Integration ---
  // Call this with {x, y, z} (Euler angles in radians) or {x, y, z, w} (quaternion)
  window.setBatRotationFromSensor = function (data) {
    manualBatControl = false;
    if ('w' in data) {
      // Quaternion
      batGroup.quaternion.set(data.x, data.y, data.z, data.w);
    } else {
      // Euler angles
      batGroup.rotation.set(data.x, data.y, data.z);
    }
  };

  // Remove bat swing animation logic and setIdleStance, updatePlayer swing logic
  function setIdleStance() {}
  function updatePlayer() {}
  // Keyboard input
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      // startSwing();
    }
  });

  // Export references for collision
  playerGroup.userData.batMesh = blade; // main bat blade
  playerGroup.userData.bodyParts = [upperBody, leftShoulder, rightShoulder, leftLower, rightLower, leftSmall, rightSmall, head];
  playerGroup.userData.batBlade = blade;
  playerGroup.userData.batHandle = handle;

  // Move the entire character and bat upward by this amount
  const yOffset = 0.25;
  // ... after creating each mesh, add yOffset to .position.y ...
  upperBody.position.y += yOffset;
  stripe.position.y += yOffset;
  leftShoulder.position.y += yOffset;
  rightShoulder.position.y += yOffset;
  leftLower.position.y += yOffset;
  rightLower.position.y += yOffset;
  leftSmall.position.y += yOffset;
  rightSmall.position.y += yOffset;
  neck.position.y += yOffset;
  head.position.y += yOffset;
  // After adding all arms and smooth arms, move them up as well
  // (They are added to playerGroup, so we can traverse and move all cylinders)
  playerGroup.traverse(obj => {
    if (obj.type === 'Mesh' && obj.geometry && (obj.geometry.type === 'CylinderGeometry')) {
      obj.position.y += yOffset;
    }
  });
  // ... existing code ...
  // Move batGroup and its pivot up by yOffset and extra offset
  batGroup.position.y += yOffset + batPivotYOffset;
}

// Load batsman and bat models
function loadPlayerModels(onLoaded) {
  const loader = new GLTFLoader();
  loader.load('batsman.glb', (gltf) => {
    batsman = gltf.scene;
    batsman.position.set(0, 0, 0);
    // Find hand bone or fallback to dummy
    let hand = batsman.getObjectByName('mixamorigRightHand') || batsman;
    batPivot = new THREE.Object3D();
    batPivot.position.set(0.22, 1.0, 0.12); // Approximate hand
    hand.add(batPivot);
    // Load bat OBJ
    const objLoader = new OBJLoader();
    objLoader.load('bat.obj', (batObj) => {
      bat = batObj;
      bat.position.set(0, -0.3, 0);
      bat.rotation.z = SWING_START_ANGLE;
      bat.scale.set(0.6, 0.6, 0.6);
      batPivot.add(bat);
      playerGroup.add(batsman);
      window.batGroup = batGroup;
      onLoaded && onLoaded();
    }, undefined, () => {
      // Bat load failed, fallback
      bat = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.6, 0.18),
        new THREE.MeshStandardMaterial({ color: 0xc2b280 })
      );
      bat.position.set(0, -0.3, 0);
      bat.rotation.z = SWING_START_ANGLE;
      batPivot.add(bat);
      playerGroup.add(batsman);
      window.batGroup = batGroup;
      onLoaded && onLoaded();
    });
  }, undefined, () => {
    // Batsman load failed, fallback
    createFallbackPlayer();
    window.batGroup = batGroup;
    onLoaded && onLoaded();
  });
}

// Expose a setter for live tweaking
window.setCharacterLeftOffset = (x) => {
  characterLeftOffset = x;
  playerGroup.position.x = x;
};

// Remove bat swing animation logic
// Remove setIdleStance, startSwing, updatePlayer swing logic
function setIdleStance() {}
function updatePlayer() {}

// Keyboard input
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    // startSwing();
  }
});

export { playerGroup, loadPlayerModels, updatePlayer, setIdleStance }; 