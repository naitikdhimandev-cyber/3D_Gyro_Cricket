import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue fallback

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Oval ground (ellipse): 125m (x, short), 145m (z, long)
const groundShape = new THREE.Shape();
groundShape.absellipse(0, 0, 62.5, 72.5, 0, Math.PI * 2, false, 0);
const groundGeometry = new THREE.ShapeGeometry(groundShape);
const groundMaterial = new THREE.MeshPhongMaterial({ color: 0x8fd694 }); // fallback, will be covered by squares
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Chessboard pattern (4x4m squares, dark/medium green)
const groundTexture = new THREE.TextureLoader().load('ground.jpg');
groundTexture.wrapS = THREE.ClampToEdgeWrapping;
groundTexture.wrapT = THREE.ClampToEdgeWrapping;
groundTexture.minFilter = THREE.LinearFilter;
groundTexture.magFilter = THREE.LinearFilter;
const squareSize = 4;
const xMin = -62.5, xMax = 62.5, zMin = -72.5, zMax = 72.5;
const darkGreen = 0x388e3c, mediumGreen = 0x66bb6a;
for (let x = xMin; x < xMax; x += squareSize) {
  for (let z = zMin; z < zMax; z += squareSize) {
    // Only draw if center of square is inside oval
    const cx = x + squareSize / 2;
    const cz = z + squareSize / 2;
    if ((cx * cx) / (62.5 * 62.5) + (cz * cz) / (72.5 * 72.5) <= 1) {
      // Use ground.jpg for both dark and light squares
      const squareGeom = new THREE.PlaneGeometry(squareSize, squareSize);
      const squareMat = new THREE.MeshPhongMaterial({ map: groundTexture });
      const square = new THREE.Mesh(squareGeom, squareMat);
      square.position.set(cx, 0.01, cz);
      square.rotation.x = -Math.PI / 2;
      scene.add(square);
    }
  }
}
// Add 5 more rows/columns of squares outside the main ellipse (extended grass)
const extXMin = -62.5 - 5 * squareSize, extXMax = 62.5 + 5 * squareSize;
const extZMin = -72.5 - 5 * squareSize, extZMax = 72.5 + 5 * squareSize;
for (let x = extXMin; x < extXMax; x += squareSize) {
  for (let z = extZMin; z < extZMax; z += squareSize) {
    const cx = x + squareSize / 2;
    const cz = z + squareSize / 2;
    const inMain = (cx * cx) / (62.5 * 62.5) + (cz * cz) / (72.5 * 72.5) <= 1;
    const inExtended = (cx * cx) / ((62.5 + 5 * squareSize) * (62.5 + 5 * squareSize)) + (cz * cz) / ((72.5 + 5 * squareSize) * (72.5 + 5 * squareSize)) <= 1;
    if (!inMain && inExtended) {
      // Use ground.jpg for both dark and light squares
      const squareGeom = new THREE.PlaneGeometry(squareSize, squareSize);
      const squareMat = new THREE.MeshPhongMaterial({ map: groundTexture });
      const square = new THREE.Mesh(squareGeom, squareMat);
      square.position.set(cx, 0.01, cz);
      square.rotation.x = -Math.PI / 2;
      scene.add(square);
    }
  }
}

// Boundary line (white ellipse) - now at 73m (was 70m)
const boundaryPoints = [];
for (let i = 0; i <= 128; i++) {
  const theta = (i / 128) * Math.PI * 2;
  boundaryPoints.push(new THREE.Vector3(62.5 * Math.cos(theta), 0.02, 72.5 * Math.sin(theta)));
}
const boundaryGeometry = new THREE.BufferGeometry().setFromPoints(boundaryPoints);
const boundaryMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 3 });
const boundary = new THREE.LineLoop(boundaryGeometry, boundaryMaterial);
scene.add(boundary);

// Add a 1.5m high grey barrier of cuboid rods at 2m outside the boundary, forming a circular wall
debugger;
const barrierHeight = 1.5;
const barrierRadiusX = 62.5 + 2; // 2m outside boundary
const barrierRadiusZ = 72.5 + 2;
const rodWidth = 0.18;
const rodDepth = 0.7; // make rods look like a wall
const barrierMaterial = new THREE.MeshPhongMaterial({ color: 0x888888 });
for (let deg = 0; deg < 360; deg += 0.08) {
  const theta = deg * Math.PI / 180;
  const x = barrierRadiusX * Math.cos(theta);
  const z = barrierRadiusZ * Math.sin(theta);
  // Place rod at (x, y, z)
  const rodGeom = new THREE.BoxGeometry(rodWidth, barrierHeight, rodDepth);
  const rod = new THREE.Mesh(rodGeom, barrierMaterial);
  rod.position.set(x, barrierHeight / 2, z);
  // Rotate so the face is tangent to the ellipse (inward)
  const tangent = Math.atan2(barrierRadiusZ * Math.cos(theta), -barrierRadiusX * Math.sin(theta));
  rod.rotation.y = tangent;
  scene.add(rod);
}

// Add a multicolored audience wall behind the grey barrier
const audienceHeight = 9;
const audienceBaseRadiusX = barrierRadiusX + 2; // 2m behind grey barrier
const audienceBaseRadiusZ = barrierRadiusZ + 2;
const audienceRodWidth = 0.22;
const audienceRodDepth = 1.2;
const audienceColors = [0xffe066, 0xff6666, 0x66b3ff, 0x66ff66, 0xffb366, 0xcc99ff, 0xff99cc, 0x99ffcc];
let audienceColorIdx = 0;
const crowdMeshes = [];
for (let deg = 0; deg < 360; deg += 0.08) {
  const theta = deg * Math.PI / 180;
  // Base position of rod
  const baseX = audienceBaseRadiusX * Math.cos(theta);
  const baseZ = audienceBaseRadiusZ * Math.sin(theta);
  // Calculate tilt: top should be 2.5m further away from the grey wall horizontally
  // Find direction vector from center to base
  const dir = new THREE.Vector3(baseX, 0, baseZ).normalize();
  // Top position is base + dir * 2.5 (horizontal offset)
  const topX = baseX + dir.x * 2.5;
  const topZ = baseZ + dir.z * 2.5;
  // The rod will be placed at the midpoint between base and top
  const midX = (baseX + topX) / 2;
  const midZ = (baseZ + topZ) / 2;
  // The rod should be tilted outward
  const rodGeom = new THREE.BoxGeometry(audienceRodWidth, audienceHeight, audienceRodDepth);
  const rodMat = new THREE.MeshPhongMaterial({ color: audienceColors[audienceColorIdx % audienceColors.length] });
  audienceColorIdx++;
  const rod = new THREE.Mesh(rodGeom, rodMat);
  rod.position.set(midX, audienceHeight / 2, midZ);
  // Calculate tilt angle
  const tiltVec = new THREE.Vector3(topX - baseX, audienceHeight, topZ - baseZ).normalize();
  // Find rotation axis (perpendicular to ground and direction)
  const rotAxis = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  // Angle between up (0,1,0) and tiltVec
  const tiltAngle = Math.acos(new THREE.Vector3(0, 1, 0).dot(tiltVec));
  rod.setRotationFromAxisAngle(rotAxis, tiltAngle);
  // Rotate so the face is tangent to the ellipse (inward at base)
  const tangent = Math.atan2(audienceBaseRadiusZ * Math.cos(theta), -audienceBaseRadiusX * Math.sin(theta));
  rod.rotateY(tangent);
  scene.add(rod);
  // Banners: every 30 degrees, add a banner above the rods
  if (Math.abs(deg % 30) < 0.08) {
    const bannerWidth = 8;
    const bannerHeight = 1.6;
    const bannerGeom = new THREE.PlaneGeometry(bannerWidth, bannerHeight);
    const bannerColors = [0xff2222, 0x22ff22, 0x2222ff, 0xffcc00, 0x00e6e6];
    const bannerMat = new THREE.MeshBasicMaterial({ color: bannerColors[(Math.floor(deg / 30)) % bannerColors.length], side: THREE.DoubleSide });
    const banner = new THREE.Mesh(bannerGeom, bannerMat);
    // Place banner 2m above the top of the rod, facing inward
    const bannerX = topX - dir.x * 2.5;
    const bannerZ = topZ - dir.z * 2.5;
    banner.position.set(bannerX, audienceHeight + 2.8, bannerZ);
    banner.lookAt(0, audienceHeight + 2.8, 0);
    scene.add(banner);
  }
}
// Export crowdMeshes for animation
export { scene, camera, renderer, ambientLight, sun, controls, allStumps, allBails, crowdMeshes, allWicketAreas };

// Pitch (22.12m x 3.05m, tan), rotated 90deg to align with wickets, raised above ground
const pitchTexture = new THREE.TextureLoader().load('pitch.jpg');
pitchTexture.wrapS = THREE.ClampToEdgeWrapping;
pitchTexture.wrapT = THREE.ClampToEdgeWrapping;
pitchTexture.minFilter = THREE.LinearFilter;
pitchTexture.magFilter = THREE.LinearFilter;
const pitchGeometry = new THREE.PlaneGeometry(22.12, 3.05);
const pitchMaterial = new THREE.MeshPhongMaterial({ map: pitchTexture });
const pitch = new THREE.Mesh(pitchGeometry, pitchMaterial);
pitch.position.y = 0.05; // slightly above ground
pitch.rotation.x = -Math.PI / 2;
pitch.rotation.z = Math.PI / 2; // rotate 90deg so long side is along Z
scene.add(pitch);

// Crease lines (white, 0.6m from each wicket, do not exceed pitch width, thick)
function addCreaseLine(z) {
  const length = 3.05; // width of pitch
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-length / 2, 0.011, z),
    new THREE.Vector3(length / 2, 0.011, z)
  ]);
  const material = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 8 });
  const line = new THREE.Line(geometry, material);
  line.position.y = 0.05 + 0.011; // slightly above pitch
  scene.add(line);
}
addCreaseLine(-11.06 + 0.6); // bowler's end crease
addCreaseLine(11.06 - 0.6);  // batsman's end crease

// Side crease lines (white, 0.6m left/right of each wicket, parallel to pitch axis, do not exceed pitch)
function addSideCreaseLine(x, z) {
  const length = 0.6; // length of side crease, but clamp to pitch
  const maxLength = 22.12; // pitch length
  const halfLen = Math.min(length / 2, maxLength / 2);
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x, 0.011, z - halfLen),
    new THREE.Vector3(x, 0.011, z + halfLen)
  ]);
  const material = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 8 });
  const line = new THREE.Line(geometry, material);
  line.position.y = 0.05 + 0.011; // slightly above pitch
  scene.add(line);
}
// For both wickets
[10.78, -10.78].forEach(z => {
  addSideCreaseLine(0.6, z);
  addSideCreaseLine(-0.6, z);
});

// Wickets (real dimensions: 3 stumps, 0.71m high, 0.045m dia, 0.2286m apart, thicker)
const allStumps = [];
const allBails = [];
const allWicketAreas = [];

function addWicketArea(z) {
  const gap = 0.1143;
  const stumpDia = 0.045;
  const width = 2 * gap + stumpDia; // 0.2736m, exactly covers the stumps
  const depth = stumpDia * 2; // Reasonable coverage: covers stumps and a little behind
  const stumpHeight = 0.71;
  const geometry = new THREE.BoxGeometry(width, stumpHeight, depth);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0 });
  const area = new THREE.Mesh(geometry, material);
  area.position.set(0, stumpHeight / 2 + 0.05, z); // base at ground, center at half height
  scene.add(area);
  allWicketAreas.push(area);
}

function addWickets(z) {
  addWicketArea(z); // Add purple area first
  const stumpHeight = 0.71, stumpDia = 0.045, gap = 0.1143;
  const y = stumpHeight / 2 + 0.05; // match pitch height
  const stumps = [];
  for (let i = -1; i <= 1; i++) {
    const stumpGroup = new THREE.Group();
    stumpGroup.position.set(i * gap, 0.05, z); // base at ground
    const stump = new THREE.Mesh(
      new THREE.CylinderGeometry(stumpDia / 2, stumpDia / 2, stumpHeight, 16),
      new THREE.MeshPhongMaterial({ color: 0xf5deb3 })
    );
    stump.position.y = stumpHeight / 2; // so base is at group origin
    stumpGroup.add(stump);
    scene.add(stumpGroup);
    stumps.push(stumpGroup);
    allStumps.push(stumpGroup);
  }
}
addWickets(-11.06); // bowler's end
addWickets(11.06);  // batsman's end

// Ambient Light
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// Directional Sunlight
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(-30, 60, 40);
sun.castShadow = true;
scene.add(sun);

// Camera: above batsman's wicket, looking down pitch
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);
camera.position.set(0, 8, 11.06 + 2.5); // 2.5m behind batsman's wicket
camera.lookAt(0, 0.8, 0);

// Orbit controls for 360° view
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.8, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 6;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI / 2.1;
controls.minPolarAngle = 0.2;

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}); 