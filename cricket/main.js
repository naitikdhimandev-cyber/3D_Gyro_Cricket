import * as THREE from 'three';
import { scene, camera, renderer, ambientLight, sun, controls, allStumps, allBails, crowdMeshes, allWicketAreas } from './sceneSetup.js';
import { playerGroup, loadPlayerModels, updatePlayer, setIdleStance } from './player.js';

// Ball config (copied from ball.js, but for red sphere only)
const BALL_RADIUS = 0.045;
const BALL_INIT_Z = -11.06;
const BOUNCE_Y = 0.045 + BALL_RADIUS;
// Realistic physics constants
const AIR_DRAG = 0.12;         // Air resistance coefficient (tweak for realism)
const GROUND_FRICTION = 0.88;  // Ground friction (tweak for realism)
const BALL_TYPES = {
  normal: {
    releaseY: [1.78, 2.12], releaseX: [-0.6, 0.6], bounceZ: [2.5, 4], bounce: 0.55, spin: 0, airCurve: 0 },
  fast:   {
    releaseY: [1.9, 2.1],   releaseX: [-0.6, 0.6], bounceZ: [5, 7],   bounce: 0.45, spin: 0, airCurve: 0 },
  bouncer:{
    releaseY: [2.1, 2.4],   releaseX: [-0.6, 0.6], bounceZ: [8, 10],  bounce: 0.7,  spin: 0, airCurve: 0 },
  yorker: {
    releaseY: [1.5, 1.7],   releaseX: [-0.6, 0.6], bounceZ: [0.5, 1.2],bounce: 0.3,  spin: 0, airCurve: 0 },
  spin: {
    releaseY: [1.8, 2.0],
    releaseX: [-0.5, 0.5], // within crease lines
    bounceZ: [5.5, 7.5],
    bounce: 0.55,
    spin: 0.5,      // moderate spin
    airCurve: 0.5   // moderate curve
  }
};

let mainBall = null;
let isAnimating = false;

// Camera angle logic
const CAMERA_ANGLES = {
  field: 'Field',
  fpv: 'FPV',
  ball: 'Ball View'
};
let currentCameraAngle = 'field';
let battingMode = false; // Batting mode state

// Store original positions/rotations for stumps and bails for reset
const originalStumpStates = allStumps.map(stump => ({
  position: stump.position.clone(),
  rotation: stump.rotation.clone()
}));
const originalBailStates = allBails.map(bail => ({
  position: bail.position.clone(),
  rotation: bail.rotation.clone()
}));

// Red blinking lines for wicket light effect
let wicketBlinkLines = [];
let wicketBlinkInterval = null;
function showWicketBlink() {
  // Remove any existing lines
  for (const line of wicketBlinkLines) scene.remove(line);
  wicketBlinkLines = [];
  // Add red lines to each stump
  for (const stump of allStumps) {
    const geom = new THREE.CylinderGeometry(0.012, 0.012, 0.7, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const line = new THREE.Mesh(geom, mat);
    line.position.copy(stump.position);
    line.position.y = stump.position.y;
    scene.add(line);
    wicketBlinkLines.push(line);
  }
  // Blink effect
  let visible = true;
  wicketBlinkInterval = setInterval(() => {
    visible = !visible;
    for (const line of wicketBlinkLines) line.visible = visible;
  }, 120);
}
function hideWicketBlink() {
  for (const line of wicketBlinkLines) scene.remove(line);
  wicketBlinkLines = [];
  if (wicketBlinkInterval) clearInterval(wicketBlinkInterval);
  wicketBlinkInterval = null;
}

function randomBetween(a, b) { return a + Math.random() * (b - a); }

function createRedBall() {
  if (mainBall) scene.remove(mainBall);
  const geometry = new THREE.SphereGeometry(BALL_RADIUS, 16, 16);
  const material = new THREE.MeshStandardMaterial({ color: 0xd32f2f });
  mainBall = new THREE.Mesh(geometry, material);
  mainBall.position.set(0, 0.05, BALL_INIT_Z);
  scene.add(mainBall);
}

function launchRedBall(type = 'normal', speed = 16) {
  if (!mainBall || isAnimating) return;
  const cfg = BALL_TYPES[type] || BALL_TYPES.normal;
  // Release point
  const relX = randomBetween(cfg.releaseX[0], cfg.releaseX[1]);
  const relY = randomBetween(cfg.releaseY[0], cfg.releaseY[1]);
  const relZ = BALL_INIT_Z;
  // Wicket positions
  const batsmanZ = 11.06 - 0.7;
  const wicketX = 0;
  // Target y for wicket (bottom, middle, top)
  let targetY = 0.7;
  if (type === 'yorker') targetY = 0.05; // Bottom of the stumps, just above pitch
  if (type === 'bouncer') targetY = 1.3;
  if (type === 'out') targetY = 0.355; // Middle of the stumps
  // Bounce point logic
  let bounceZ, bounceX, endZ, endX;
  if (type === 'yorker') {
    bounceZ = batsmanZ - 0.1;
    bounceX = relX;
    endZ = batsmanZ;
    endX = randomBetween(-0.6, 0.6); // aim between side creases
  } else if (type === 'bouncer') {
    bounceZ = (relZ + batsmanZ) / 2;
    bounceX = relX;
    endZ = batsmanZ;
    endX = randomBetween(-0.6, 0.6);
  } else if (type === 'spin') {
    bounceZ = batsmanZ - randomBetween(cfg.bounceZ[0], cfg.bounceZ[1]);
    bounceX = relX + (cfg.airCurve || 0);
    endZ = batsmanZ;
    const stumpsWidth = 2 * 0.1143 + 0.045; // 0.2736m
    endX = randomBetween(-stumpsWidth/2 + 0.01, stumpsWidth/2 - 0.01);
  } else {
    bounceZ = batsmanZ - randomBetween(cfg.bounceZ[0], cfg.bounceZ[1]);
    bounceX = relX + (cfg.airCurve || 0);
    endZ = batsmanZ;
    endX = randomBetween(-0.6, 0.6);
  }
  if (cfg.spin) {
    endX += cfg.spin * 1.2;
  }
  // Stage 1: release -> bounce
  mainBall.position.set(relX, relY, relZ);
  isAnimating = true;
  createBallTrail();
  clearBallTrail();
  let t = 0;
  const airTime = Math.abs(bounceZ - relZ) / speed * 1.2;
  const start = new THREE.Vector3(relX, relY, relZ);
  const bounce = new THREE.Vector3(bounceX, BOUNCE_Y, bounceZ);
  const spin = cfg.spin || 0;
  const airCurve = cfg.airCurve || 0;
  let gravity = -9.8;
  let afterBounce = false;
  let t2 = 0;
  let ballHasHitWicket = false;
  let batHit = false;
  let bodyHit = false;
  let bodyBounceCount = 0;
  const maxBodyBounces = 3;
  let hitInitialSpeed = null;
  let hitInitialAngle = null;
  let ballViewAutoSwitch = false;
  let ballStoppedTimeout = null;
  let prevCameraAngleBeforeBallView = null;
  let ballHasBounced = false;
  let ballHasCrossedBoundary = false;
  function animateToBounce() {
    if (!isAnimating) return;
    t += 1 / 60;
    const alpha = Math.min(t / airTime, 1);
    let curveX = relX + (airCurve * Math.sin(Math.PI * alpha));
    mainBall.position.lerpVectors(start, bounce, alpha);
    mainBall.position.x = curveX;
    if (alpha < 1) {
      requestAnimationFrame(animateToBounce);
    } else {
      afterBounce = true;
      animateAfterBounce();
    }
  }
  function animateAfterBounce() {
    const afterTime = Math.abs(endZ - bounce.z) / speed * 1.1;
    function anim2() {
      if (!isAnimating) return;
      t2 += 1 / 60;
      const alpha = Math.min(t2 / afterTime, 1);
      mainBall.position.lerpVectors(bounce, new THREE.Vector3(endX, targetY, endZ), alpha);
      mainBall.position.y += Math.sin(Math.PI * alpha) * cfg.bounce * 1.2;
      if (spin) mainBall.position.x += spin * (1 - Math.cos(Math.PI * alpha)) * 0.7;
      if (alpha < 1) {
        requestAnimationFrame(anim2);
      } else {
        // Continue with free physics motion
        let velocity = new THREE.Vector3(endX - bounce.x, targetY - bounce.y, endZ - bounce.z).normalize().multiplyScalar(speed * 0.7);
        let ballGravity = -9.8;
        let lastTime = performance.now();
        function freeMotion() {
          if (!isAnimating) return;
          let now = performance.now();
          let dt = Math.min((now - lastTime) / 1000, 0.05);
          lastTime = now;
          // Gravity
          velocity.y += ballGravity * dt;

          // Air resistance (drag) and ground friction
          if (mainBall.position.y > BALL_RADIUS + 0.01) {
            // In the air: apply air drag to all velocity components
            velocity.multiplyScalar(1 - AIR_DRAG * dt);
          } else {
            // On the ground: apply ground friction to x and z only
            velocity.x *= GROUND_FRICTION;
            velocity.z *= GROUND_FRICTION;
            // Don't apply friction to y (vertical)
          }

          mainBall.position.addScaledVector(velocity, dt);
          checkBallTouchesWicketArea(mainBall.position);
          checkBallTouchesPinkArea(mainBall.position);
          // Robust bounce detection
          if (typeof freeMotion.prevY === 'undefined') freeMotion.prevY = mainBall.position.y;
          if (typeof freeMotion.prevVy === 'undefined') freeMotion.prevVy = velocity.y;
          if (typeof freeMotion.prevPx === 'undefined') freeMotion.prevPx = mainBall.position.x;
          if (typeof freeMotion.prevPz === 'undefined') freeMotion.prevPz = mainBall.position.z;
          // Only allow bat (blade and handle), purple wicket area, green ground, and grey boundary to affect the ball
          const batBlade = playerGroup.userData.batBlade;
          const batHandle = playerGroup.userData.batHandle;
          if (!batHit && batBlade) {
            const batBox = new THREE.Box3().setFromObject(batBlade);
            if (batBox.distanceToPoint(mainBall.position) < BALL_RADIUS * 1.1) {
              batHit = true;
              // === Play bat hit sound slightly earlier ===
              playAudio(audioBat);
              // === Start ball trail effect ===
              ballTrailActive = true;
              ballTrailPositions = [];
              // Reset bounce/crossed state on bat hit
              ballHasBounced = false;
              ballHasCrossedBoundary = false;
              // Reflect velocity based on bat orientation
              // Get bat normal (approximate: local +Y axis in world)
              const batNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(batBlade.getWorldQuaternion(new THREE.Quaternion())).normalize();
              // Add some of bat's forward direction (local +Z)
              const batForward = new THREE.Vector3(0, 0, 1).applyQuaternion(batBlade.getWorldQuaternion(new THREE.Quaternion())).normalize();
              // Calculate new velocity: reflect and add some forward
              const v = velocity.clone();
              const reflect = v.clone().reflect(batNormal).multiplyScalar(0.7);
              const forward = batForward.multiplyScalar(v.length() * 0.6 + 7);
              velocity.copy(reflect.add(forward));
              // Add some upward force
              velocity.y = Math.abs(velocity.y) + 3;
              // Store initial speed and angle for post-hit physics
              hitInitialSpeed = velocity.length();
              hitInitialAngle = Math.atan2(velocity.y, Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z));
              // If in FPV mode, switch to ball view after 1 second
              if (currentCameraAngle === 'fpv' && !ballViewAutoSwitch) {
                ballViewAutoSwitch = true;
                prevCameraAngleBeforeBallView = currentCameraAngle;
                setTimeout(() => {
                  if (currentCameraAngle === 'fpv') setCameraAngle('ball');
                }, 1000);
              }
              // === VIBRATION FEATURE ===
              // Calculate impact power (relative to max possible)
              const impactPower = Math.min(1, hitInitialSpeed / 30); // scale 0..1
              const impactSpeed = hitInitialSpeed;
              // Classify shot type (very basic)
              let shotType = 'defensive';
              if (impactPower > 0.7) shotType = 'power';
              else if (impactPower > 0.4) shotType = 'drive';
              else if (impactPower > 0.2) shotType = 'flick';
              // Send vibration command to phone via WebSocket
              if (window.ws && window.ws.readyState === 1) {
                window.ws.send(JSON.stringify({
                  type: 'vibrate',
                  power: impactPower,
                  speed: impactSpeed,
                  shotType: shotType
                }));
              }
            }
          }
          if (!batHit && batHandle) {
            const handleBox = new THREE.Box3().setFromObject(batHandle);
            if (handleBox.distanceToPoint(mainBall.position) < BALL_RADIUS * 1.1) {
              batHit = true;
              // === Play bat hit sound slightly earlier ===
              playAudio(audioBat);
              // === Start ball trail effect ===
              ballTrailActive = true;
              ballTrailPositions = [];
              // Reset bounce/crossed state on bat hit
              ballHasBounced = false;
              ballHasCrossedBoundary = false;
              // Reflect velocity based on bat orientation
              // Get bat normal (approximate: local +Y axis in world)
              const batNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(batHandle.getWorldQuaternion(new THREE.Quaternion())).normalize();
              // Add some of bat's forward direction (local +Z)
              const batForward = new THREE.Vector3(0, 0, 1).applyQuaternion(batHandle.getWorldQuaternion(new THREE.Quaternion())).normalize();
              // Calculate new velocity: reflect and add some forward
              const v = velocity.clone();
              const reflect = v.clone().reflect(batNormal).multiplyScalar(0.7);
              const forward = batForward.multiplyScalar(v.length() * 0.6 + 7);
              velocity.copy(reflect.add(forward));
              // Add some upward force
              velocity.y = Math.abs(velocity.y) + 3;
              // Store initial speed and angle for post-hit physics
              hitInitialSpeed = velocity.length();
              hitInitialAngle = Math.atan2(velocity.y, Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z));
              // If in FPV mode, switch to ball view after 1 second
              if (currentCameraAngle === 'fpv' && !ballViewAutoSwitch) {
                ballViewAutoSwitch = true;
                prevCameraAngleBeforeBallView = currentCameraAngle;
                setTimeout(() => {
                  if (currentCameraAngle === 'fpv') setCameraAngle('ball');
                }, 1000);
              }
              // === VIBRATION FEATURE ===
              // Calculate impact power (relative to max possible)
              const impactPower = Math.min(1, hitInitialSpeed / 30); // scale 0..1
              const impactSpeed = hitInitialSpeed;
              // Classify shot type (very basic)
              let shotType = 'defensive';
              if (impactPower > 0.7) shotType = 'power';
              else if (impactPower > 0.4) shotType = 'drive';
              else if (impactPower > 0.2) shotType = 'flick';
              // Send vibration command to phone via WebSocket
              if (window.ws && window.ws.readyState === 1) {
                window.ws.send(JSON.stringify({
                  type: 'vibrate',
                  power: impactPower,
                  speed: impactSpeed,
                  shotType: shotType
                }));
              }
            }
          }
          // Collision with ground
          if (mainBall.position.y < BALL_RADIUS) {
            mainBall.position.y = BALL_RADIUS;
            if (batHit) {
              // More realistic ground resistance after hit
              let friction = 0.88;
              if (hitInitialAngle !== null && hitInitialAngle < 0.2) friction = 0.82;
              velocity.y *= -0.5;
              velocity.x *= friction;
              velocity.z *= friction;
              if (hitInitialAngle !== null && hitInitialAngle < 0.2) ballGravity = -11.5;
              else ballGravity = -9.8;
            } else {
              velocity.y *= -0.6;
              velocity.x *= 0.95;
              velocity.z *= 0.95;
            }
            if (Math.abs(velocity.y) < 0.5) velocity.y = 0;
          }
          // Purple wicket area physical collision: if ball is inside, stop it
          for (const area of allWicketAreas) {
            const { x: ax, y: ay, z: az } = area.position;
            const width = area.geometry.parameters.width;
            const height = area.geometry.parameters.height;
            const depth = area.geometry.parameters.depth;
            const minX = ax - width / 2;
            const maxX = ax + width / 2;
            const minY = ay - height / 2;
            const maxY = ay + height / 2;
            const minZ = az - depth / 2;
            const maxZ = az + depth / 2;
            if (
              mainBall.position.x >= minX && mainBall.position.x <= maxX &&
              mainBall.position.y >= minY && mainBall.position.y <= maxY &&
              mainBall.position.z >= minZ && mainBall.position.z <= maxZ
            ) {
              // Only trigger if not already red
              if (lastRedWicketArea !== area) {
                area.material.color.set(0xff0000);
                if (lastRedWicketTimeout) clearTimeout(lastRedWicketTimeout);
                lastRedWicketArea = area;
                lastRedWicketTimeout = setTimeout(() => {
                  area.material.color.set(0x8000ff);
                  lastRedWicketArea = null;
                }, 1000);
              }
              return;
            }
          }
          
          // Collision with blue boundary cylinder (physical barrier)
          const boundaryRadiusX = 72.5;
          const boundaryRadiusZ = 82.5;
          const ballXZ = new THREE.Vector2(mainBall.position.x, mainBall.position.z);
          const boundaryDist = Math.sqrt((ballXZ.x * ballXZ.x) / (boundaryRadiusX * boundaryRadiusX) + (ballXZ.y * ballXZ.y) / (boundaryRadiusZ * boundaryRadiusZ));
          
          if (boundaryDist >= 1.0) {
            // Ball has hit the blue boundary cylinder
            // Stop the ball immediately
            velocity.set(0,0,0);
            ballGravity = 0;
        isAnimating = false;
            clearBallTrail();
            // If in FPV view, immediately reset the ball (play next ball)
            if (currentCameraAngle === 'fpv') {
              monitorBallStop();
            } else if (overMode) {
              monitorBallStop();
            }
            return; // Ensure no further updates this frame
          }
          // Only track bounce and boundary after batHit
          if (batHit) {
            // Bounce detection: ball touches ground at any time after bat hit
            if (!ballHasBounced && mainBall.position.y <= BALL_RADIUS) {
              ballHasBounced = true;
            }
            // Robust boundary crossing detection: crosses from inside to outside
            const prevPx = freeMotion.prevPx !== undefined ? freeMotion.prevPx : mainBall.position.x;
            const prevPz = freeMotion.prevPz !== undefined ? freeMotion.prevPz : mainBall.position.z;
            const prevInside = ((prevPx * prevPx) / (62.5 * 62.5) + (prevPz * prevPz) / (72.5 * 72.5)) <= 1;
            const nowPx = mainBall.position.x, nowPz = mainBall.position.z;
            const nowOutside = ((nowPx * nowPx) / (62.5 * 62.5) + (nowPz * nowPz) / (72.5 * 72.5)) > 1;
            if (!ballHasCrossedBoundary && prevInside && nowOutside) {
              ballHasCrossedBoundary = true;
              playAudioClone('auid/shot.mp3', 0.4);
              if (ballHasBounced) showSpecialEffect(4);
              else showSpecialEffect(6);
            }
            freeMotion.prevPx = nowPx;
            freeMotion.prevPz = nowPz;
          }
          // Stop if ball is far away
          if (mainBall.position.y < BALL_RADIUS + 0.01 && Math.abs(velocity.y) < 0.01 && Math.abs(velocity.x) < 0.01 && Math.abs(velocity.z) < 0.01) {
            isAnimating = false;
            clearBallTrail();
            if (overMode) monitorBallStop();
            if (ballViewAutoSwitch) {
              ballViewAutoSwitch = false;
              setTimeout(() => {
                if (currentCameraAngle === 'ball') {
                  if (prevCameraAngleBeforeBallView === 'fpv') setCameraAngle('fpv');
                  else setCameraAngle('field');
                }
                prevCameraAngleBeforeBallView = null;
              }, 800);
            }
            return;
          }
          // Update previous y and vy for next frame
          freeMotion.prevY = mainBall.position.y;
          freeMotion.prevVy = velocity.y;
          requestAnimationFrame(freeMotion);
        }
        freeMotion();
        if (ballHasHitWicket) {
          showWicketBlink();
          setTimeout(() => {
            // Reset stumps
            allStumps.forEach((stump, i) => {
              stump.position.copy(originalStumpStates[i].position);
              stump.rotation.copy(originalStumpStates[i].rotation);
            });
            // Reset bails
            allBails.forEach((bail, i) => {
              bail.position.copy(originalBailStates[i].position);
              bail.rotation.copy(originalBailStates[i].rotation);
            });
            hideWicketBlink();
          }, 3000);
        }
      }
    }
    anim2();
  }
  animateToBounce();
}

// Add player to scene after loading
loadPlayerModels(() => {
  scene.add(playerGroup);
  setIdleStance();
});

// Add red ball to scene
createRedBall();

// === Ball Trail Effect ===
let ballTrailSpheres = [];
let ballTrailPositions = [];
let ballTrailActive = false;
const BALL_TRAIL_MAX_POINTS = 40; // Number of points in the trail
const BALL_TRAIL_COLOR = 0xff69b4; // Pink

function createBallTrail() {
  // Remove old spheres
  for (const s of ballTrailSpheres) scene.remove(s);
  ballTrailSpheres = [];
  // Pre-create spheres for performance
  for (let i = 0; i < BALL_TRAIL_MAX_POINTS; i++) {
    const t = i / (BALL_TRAIL_MAX_POINTS - 1);
    const radius = 0.06 * (1 - t) + 0.018 * t; // Large at head, small at tail
    const opacity = 0.7 * (1 - t) + 0.12 * t;  // More opaque at head
    const geometry = new THREE.SphereGeometry(radius, 12, 12);
    const material = new THREE.MeshBasicMaterial({
      color: BALL_TRAIL_COLOR,
      transparent: true,
      opacity: opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.visible = false;
    scene.add(sphere);
    ballTrailSpheres.push(sphere);
  }
}

function updateBallTrail() {
  if (!ballTrailActive || !mainBall) {
    for (const s of ballTrailSpheres) s.visible = false;
    return;
  }
  // Add current ball position to the front
  const pos = mainBall.position.clone();
  ballTrailPositions.unshift(pos);
  if (ballTrailPositions.length > BALL_TRAIL_MAX_POINTS) ballTrailPositions.pop();
  // Update spheres
  for (let i = 0; i < BALL_TRAIL_MAX_POINTS; i++) {
    if (i < ballTrailPositions.length) {
      ballTrailSpheres[i].position.copy(ballTrailPositions[i]);
      ballTrailSpheres[i].visible = true;
    } else {
      ballTrailSpheres[i].visible = false;
    }
  }
}

function clearBallTrail() {
  ballTrailPositions = [];
  ballTrailActive = false;
  for (const s of ballTrailSpheres) s.visible = false;
}

// === Pink Oval Cylinder for Boundary Detection ===
let pinkBoundaryCylinder = null;
function addPinkBoundaryCylinder() {
  if (pinkBoundaryCylinder) scene.remove(pinkBoundaryCylinder);
  // Create an ellipse path
  const ellipseCurve = new THREE.EllipseCurve(
    0, 0, // ax, aY
    72.5, 62.5, // xRadius, yRadius (swapped)
    0, 2 * Math.PI, // start/end angle
    false,
    0
  );
  const points = ellipseCurve.getPoints(128);
  // Make a closed path
  const path = new THREE.CurvePath();
  const vecs = points.map(p => new THREE.Vector3(p.x, 0, p.y));
  for (let i = 0; i < vecs.length - 1; i++) {
    const line = new THREE.LineCurve3(vecs[i], vecs[i + 1]);
    path.add(line);
  }
  path.add(new THREE.LineCurve3(vecs[vecs.length - 1], vecs[0]));
  // Tube geometry: height 300m (from -150 to +150)
  const extrudeSettings = {
    steps: 1,
    depth: 300,
    bevelEnabled: false,
    extrudePath: new THREE.LineCurve3(new THREE.Vector3(0, -150, 0), new THREE.Vector3(0, 150, 0))
  };
  const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p.x, p.y)));
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const material = new THREE.MeshBasicMaterial({ color: 0xff69b4, transparent: true, opacity: 0.0, side: THREE.DoubleSide });
  pinkBoundaryCylinder = new THREE.Mesh(geometry, material);
  pinkBoundaryCylinder.position.y = 0; // Centered at ground
  scene.add(pinkBoundaryCylinder);
}
addPinkBoundaryCylinder();

// === Blue Oval Cylinder (Physical Barrier) ===
let blueBoundaryCylinder = null;
function addBlueBoundaryCylinder() {
  if (blueBoundaryCylinder) scene.remove(blueBoundaryCylinder);
  // Create an ellipse path
  const ellipseCurve = new THREE.EllipseCurve(
    0, 0, // ax, aY
    72.5, 82.5, // xRadius, yRadius (now 5m less than before)
    0, 2 * Math.PI, // start/end angle
    false,
    0
  );
  const points = ellipseCurve.getPoints(128);
  // Make a closed path
  const path = new THREE.CurvePath();
  const vecs = points.map(p => new THREE.Vector3(p.x, 0, p.y));
  for (let i = 0; i < vecs.length - 1; i++) {
    const line = new THREE.LineCurve3(vecs[i], vecs[i + 1]);
    path.add(line);
  }
  path.add(new THREE.LineCurve3(vecs[vecs.length - 1], vecs[0]));
  // Tube geometry: height 300m (from -150 to +150)
  const extrudeSettings = {
    steps: 1,
    depth: 300,
    bevelEnabled: false,
    extrudePath: new THREE.LineCurve3(new THREE.Vector3(0, -150, 0), new THREE.Vector3(0, 150, 0))
  };
  const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p.x, p.y)));
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const material = new THREE.MeshBasicMaterial({ color: 0x3399ff, transparent: true, opacity: 0.0, side: THREE.DoubleSide });
  blueBoundaryCylinder = new THREE.Mesh(geometry, material);
  blueBoundaryCylinder.position.y = 0; // Centered at ground
  scene.add(blueBoundaryCylinder);
}
addBlueBoundaryCylinder();

// === Stadium Light Towers ===
let lightTowers = [];
let lightArrays = []; // Store light arrays for later control
let stadiumLights = []; // Store actual light sources
let isNightMode = false; // Track day/night mode
function addStadiumLightTowers() {
  // Remove existing towers and light arrays
  for (const tower of lightTowers) {
    scene.remove(tower);
  }
  for (const lightArray of lightArrays) {
    for (const light of lightArray) {
      scene.remove(light);
    }
  }
  for (const light of stadiumLights) {
    scene.remove(light);
  }
  lightTowers = [];
  lightArrays = [];
  stadiumLights = [];
  
  // Tower dimensions
  const towerHeight = 45; // 45m tall
  const towerWidth = 2.5; // 2.5m wide
  const towerDepth = 2.5; // 2.5m deep
  
  // Position towers at corners, outside the boundary
  const towerPositions = [
    { x: 85, z: 95 },   // Top-right corner
    { x: -85, z: 95 },  // Top-left corner  
    { x: 85, z: -95 },  // Bottom-right corner
    { x: -85, z: -95 }  // Bottom-left corner
  ];
  
  // Create tower geometry
  const towerGeometry = new THREE.BoxGeometry(towerWidth, towerHeight, towerDepth);
  const towerMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x444444, // Dark grey
    roughness: 0.8,
    metalness: 0.2
  });
  
  // Create each tower
  for (let i = 0; i < towerPositions.length; i++) {
    const tower = new THREE.Mesh(towerGeometry, towerMaterial);
    tower.position.set(
      towerPositions[i].x,
      towerHeight / 2, // Position so bottom is at ground level
      towerPositions[i].z
    );
    // === ROTATE TOWER TO FACE CENTER ===
    // Calculate angle to center
    const angleToCenter = Math.atan2(-tower.position.x, -tower.position.z);
    tower.rotation.y = angleToCenter;
    
    // Add some structural details (cross beams)
    const crossBeamGeometry = new THREE.BoxGeometry(towerWidth + 1, 0.8, 0.8);
    const crossBeamMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x666666,
      roughness: 0.7,
      metalness: 0.3
    });
    
    // Add cross beams at different heights
    const beamHeights = [towerHeight * 0.3, towerHeight * 0.6, towerHeight * 0.85];
    for (const height of beamHeights) {
      const crossBeam = new THREE.Mesh(crossBeamGeometry, crossBeamMaterial);
      crossBeam.position.set(0, height, 0);
      tower.add(crossBeam);
    }
    
    // Add diagonal support beams
    const supportGeometry = new THREE.BoxGeometry(0.4, towerHeight * 0.4, 0.4);
    const supportMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x555555,
      roughness: 0.6,
      metalness: 0.4
    });
    
    // Add 4 diagonal supports around each tower
    const supportPositions = [
      { x: towerWidth/2 + 0.5, z: towerDepth/2 + 0.5 },
      { x: -towerWidth/2 - 0.5, z: towerDepth/2 + 0.5 },
      { x: towerWidth/2 + 0.5, z: -towerDepth/2 - 0.5 },
      { x: -towerWidth/2 - 0.5, z: -towerDepth/2 - 0.5 }
    ];
    
    for (const pos of supportPositions) {
      const support = new THREE.Mesh(supportGeometry, supportMaterial);
      support.position.set(pos.x, towerHeight * 0.2, pos.z);
      support.rotation.z = Math.PI / 4; // 45 degree rotation
      tower.add(support);
    }
    
    // === Add Light Arrays on top of each tower ===
    const lightArray = addLightArrayToTower(tower, towerPositions[i], towerHeight, angleToCenter);
    lightArrays.push(lightArray);
    
    scene.add(tower);
    lightTowers.push(tower);
  }
  
  console.log(`Added ${lightTowers.length} stadium light towers with light arrays`);
}

// Function to add light array to a specific tower
function addLightArrayToTower(tower, towerPosition, towerHeight, angleToCenter) {
  const lightArray = [];

  // === Create a group for the whole light array ===
  const arrayGroup = new THREE.Group();

  // Light array dimensions - make them more visible from batsman's perspective
  const arrayWidth = 12; // 12m wide (increased for better visibility)
  const arrayDepth = 6;  // 6m deep (increased for better visibility)
  const lightSpacing = 0.8; // 0.8m between lights (closer spacing for more lights)
  const numLayers = 6; // 6 layers for cuboid
  const layerSpacing = 0.7; // 0.7m between layers

  // Calculate grid dimensions
  const lightsPerRow = Math.floor(arrayWidth / lightSpacing) + 1; // 16 lights per row
  const lightsPerColumn = Math.floor(arrayDepth / lightSpacing) + 1; // 8 lights per column
  const totalLights = lightsPerRow * lightsPerColumn * numLayers; // 768 lights total per tower

  // Light bulb properties - make them more visible
  const bulbRadius = 0.2; // 20cm radius (larger for better visibility)
  const bulbGeometry = new THREE.SphereGeometry(bulbRadius, 12, 12);
  const bulbMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x333333, // Dark grey (off)
    emissive: 0x000000, // No emission (off)
    roughness: 0.2, // More metallic for better light reflection
    metalness: 0.8
  });

  // Calculate array position - position for batsman visibility
  const arrayY = towerHeight + 1; // 1m above tower top for better visibility

  // Create light bulbs in 3D cuboid grid (relative to group center)
  const startX = -arrayWidth / 2;
  const startZ = -arrayDepth / 2;
  const startY = 0;
  for (let layer = 0; layer < numLayers; layer++) {
    for (let row = 0; row < lightsPerColumn; row++) {
      for (let col = 0; col < lightsPerRow; col++) {
        const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial.clone());
        // Position bulb in grid (relative to group center)
        const bulbX = startX + col * lightSpacing;
        const bulbZ = startZ + row * lightSpacing;
        const bulbY = startY + layer * layerSpacing;
        bulb.position.set(bulbX, bulbY, bulbZ);
        bulb.userData = {
          isOn: false,
          originalColor: 0x333333,
          onColor: 0xffffaa, // Warm white when on
          emissiveOn: 0x444422,
          emissiveOff: 0x000000,
          towerIndex: lightTowers.length
        };
        arrayGroup.add(bulb);
        lightArray.push(bulb);
      }
    }
  }

  // Add support structure for light array - make it a cuboid
  const supportGeometry = new THREE.BoxGeometry(arrayWidth + 1, numLayers * layerSpacing + 0.4, arrayDepth + 1);
  const supportMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x222222,
    roughness: 0.8,
    metalness: 0.1
  });
  const support = new THREE.Mesh(supportGeometry, supportMaterial);
  support.position.set(0, (numLayers * layerSpacing) / 2 - 0.2, 0); // Centered vertically
  arrayGroup.add(support);

  // Add additional structural elements for realism
  // Vertical support beams at corners
  const cornerSupportGeometry = new THREE.BoxGeometry(0.3, numLayers * layerSpacing + 2, 0.3);
  const cornerSupportMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x333333,
    roughness: 0.7,
    metalness: 0.3
  });
  const cornerPositions = [
    { x: arrayWidth/2 + 0.5, z: arrayDepth/2 + 0.5 },
    { x: -arrayWidth/2 - 0.5, z: arrayDepth/2 + 0.5 },
    { x: arrayWidth/2 + 0.5, z: -arrayDepth/2 - 0.5 },
    { x: -arrayWidth/2 - 0.5, z: -arrayDepth/2 - 0.5 }
  ];
  for (const pos of cornerPositions) {
    const cornerSupport = new THREE.Mesh(cornerSupportGeometry, cornerSupportMaterial);
    cornerSupport.position.set(pos.x, (numLayers * layerSpacing) / 2, pos.z); // Centered vertically
    arrayGroup.add(cornerSupport);
  }

  // === Add white cuboid in front of the light array ===
  // Same width and height as the light array, small thickness (0.4m)
  const faceWidth = arrayWidth;
  const faceHeight = numLayers * layerSpacing;
  const faceThickness = 0.4;
  const faceGeometry = new THREE.BoxGeometry(faceWidth, faceHeight, faceThickness);
  const faceMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.1 });
  // Position the face about 1 meter in front of the light array (relative to group center)
  const face = new THREE.Mesh(faceGeometry, faceMaterial);
  face.position.set(0, faceHeight/2 - 0.2, arrayDepth/2 + faceThickness/2 + 1.05); // 1.05m gap in front
  arrayGroup.add(face);

  // === Rotate and position the group ===
  arrayGroup.position.set(towerPosition.x, arrayY, towerPosition.z);
  arrayGroup.rotation.y = angleToCenter;
  scene.add(arrayGroup);

  // === Add actual light sources for night mode ===
  // Calculate direction to center
  const centerVec = new THREE.Vector3(0, 0, 0).sub(new THREE.Vector3(towerPosition.x, 0, towerPosition.z)).normalize();
  // Calculate tilt: move the spotlight up and out so the angle to vertical is 30 degrees
  const tiltAngle = THREE.MathUtils.degToRad(30); // 30 degrees
  const lightHeightRaw = towerHeight + 1.5 + (numLayers * layerSpacing) / 2; // original height
  const lightDistanceFromPillar = Math.tan(tiltAngle) * lightHeightRaw; // how far out from pillar
  const lightPos = new THREE.Vector3(
    towerPosition.x + centerVec.x * lightDistanceFromPillar,
    lightHeightRaw,
    towerPosition.z + centerVec.z * lightDistanceFromPillar
  );

  // Main spotlight for the field (wider cone, tilted)
  const mainSpotlight = new THREE.SpotLight(0xF8F8FF, 0, 220, Math.PI / 1.5, 0.18, 1);
  mainSpotlight.position.copy(lightPos);
  mainSpotlight.target.position.set(0, 0, 0); // Point to center of field
  scene.add(mainSpotlight.target);
  mainSpotlight.target.updateMatrixWorld();
  mainSpotlight.castShadow = true;
  mainSpotlight.intensity = 0; // Will be set in night mode
  mainSpotlight.shadow.mapSize.width = 2048;
  mainSpotlight.shadow.mapSize.height = 2048;
  mainSpotlight.shadow.camera.near = 0.5;
  mainSpotlight.shadow.camera.far = 350;
  mainSpotlight.visible = false; // Start off
  scene.add(mainSpotlight);
  stadiumLights.push(mainSpotlight);

  // Secondary spotlight for audience area (keep as before, but can also tilt if desired)
  const audienceTarget = new THREE.Vector3(
    towerPosition.x * 1.5,
    0,
    towerPosition.z * 1.5
  );
  const audienceSpotlight = new THREE.SpotLight(0xffffaa, 0, 120, Math.PI / 2.2, 0.22, 1);
  audienceSpotlight.position.copy(lightPos); // Use same tilt for audience light for more realism
  audienceSpotlight.target.position.copy(audienceTarget);
  scene.add(audienceSpotlight.target);
  audienceSpotlight.target.updateMatrixWorld();
  audienceSpotlight.castShadow = true;
  audienceSpotlight.intensity = 0; // Will be set in night mode
  audienceSpotlight.shadow.mapSize.width = 1024;
  audienceSpotlight.shadow.mapSize.height = 1024;
  audienceSpotlight.shadow.camera.near = 0.5;
  audienceSpotlight.shadow.camera.far = 200;
  audienceSpotlight.visible = false; // Start off
  scene.add(audienceSpotlight);
  stadiumLights.push(audienceSpotlight);

  console.log(`Added cuboid light array with ${lightArray.length} bulbs to tower ${lightTowers.length + 1}`);
  return lightArray;
}

// Function to toggle day/night mode
function toggleDayNightMode() {
  isNightMode = !isNightMode;
  
  if (isNightMode) {
    // Night mode: turn off sun, turn on stadium lights
    if (sun) {
      sun.intensity = 0;
    }
    if (ambientLight) {
      ambientLight.intensity = 0.05; // Very low ambient for night
    }
    
    // Turn on stadium lights
    for (const light of stadiumLights) {
      light.intensity = light === stadiumLights[0] ? 2.5 : 1.5; // Main lights brighter
      light.visible = true;
    }
    
    // Turn on light bulbs visually
    for (const lightArray of lightArrays) {
      for (const bulb of lightArray) {
        bulb.material.color.setHex(bulb.userData.onColor);
        bulb.material.emissive.setHex(bulb.userData.emissiveOn);
        bulb.userData.isOn = true;
      }
    }
    
    // Show night sky sphere
    createNightSkySphere();
    if (nightSkySphere) nightSkySphere.visible = true;
    
    console.log('Switched to NIGHT mode');
    // Make face plates glow (even brighter)
    for (const face of facePlates) {
      face.material.color.setHex(0xffffff);
      face.material.emissive.setHex(0xffffff);
      face.material.emissiveIntensity = 5.0;
      face.material.needsUpdate = true;
    }
    // Hide clouds at night
    showClouds(false);
  } else {
    // Day mode: turn on sun, turn off stadium lights
    if (sun) {
      sun.intensity = 1;
    }
    if (ambientLight) {
      ambientLight.intensity = 0.4; // Normal ambient for day
    }
    
    // Turn off stadium lights
    for (const light of stadiumLights) {
      light.intensity = 0;
      light.visible = false;
    }
    
    // Turn off light bulbs visually
    for (const lightArray of lightArrays) {
      for (const bulb of lightArray) {
        bulb.material.color.setHex(bulb.userData.originalColor);
        bulb.material.emissive.setHex(bulb.userData.emissiveOff);
        bulb.userData.isOn = false;
      }
    }
    
    // Hide night sky sphere
    if (nightSkySphere) nightSkySphere.visible = false;
    
    console.log('Switched to DAY mode');
    // Remove glow from face plates
    for (const face of facePlates) {
      face.material.color.setHex(0xffffff);
      face.material.emissive.setHex(0x000000);
      face.material.emissiveIntensity = 1.0;
      face.material.needsUpdate = true;
    }
    // Show clouds in day mode
    if (cloudMeshes.length === 0) addClouds();
    showClouds(true);
  }
  
  // Update button text
  updateDayNightButton();
}

// Function to update the day/night button text
function updateDayNightButton() {
  const dayNightBtn = document.getElementById('dayNightBtn');
  if (dayNightBtn) {
    dayNightBtn.textContent = isNightMode ? '☀️ Day' : '🌙 Night';
  }
}

// Add day/night toggle button
function addDayNightToggle() {
  let dayNightBtn = document.getElementById('dayNightBtn');
  if (!dayNightBtn) {
    dayNightBtn = document.createElement('button');
    dayNightBtn.id = 'dayNightBtn';
    dayNightBtn.style.position = 'fixed';
    dayNightBtn.style.bottom = '20px';
    dayNightBtn.style.left = '20px';
    dayNightBtn.style.background = 'rgba(30,30,30,0.85)';
    dayNightBtn.style.color = '#fff';
    dayNightBtn.style.border = 'none';
    dayNightBtn.style.padding = '12px 24px';
    dayNightBtn.style.borderRadius = '12px';
    dayNightBtn.style.fontSize = '1.1rem';
    dayNightBtn.style.cursor = 'pointer';
    dayNightBtn.style.zIndex = 1002;
    dayNightBtn.style.boxShadow = '0 2px 16px rgba(0,0,0,0.18)';
    dayNightBtn.style.transition = 'all 0.3s ease';
    
    dayNightBtn.addEventListener('mouseenter', () => {
      dayNightBtn.style.background = 'rgba(50,50,50,0.9)';
      dayNightBtn.style.transform = 'scale(1.05)';
    });
    
    dayNightBtn.addEventListener('mouseleave', () => {
      dayNightBtn.style.background = 'rgba(30,30,30,0.85)';
      dayNightBtn.style.transform = 'scale(1)';
    });
    
    dayNightBtn.addEventListener('click', toggleDayNightMode);
    
    document.body.appendChild(dayNightBtn);
  }
  
  updateDayNightButton();
}

addStadiumLightTowers();
addDayNightToggle();

// === Six/Four Detection and Effect ===
let ballHasBounced = false;
let ballHasCrossedBoundary = false;
function showSpecialEffect(num) {
  let effect = document.getElementById('specialEffect');
  if (!effect) {
    effect = document.createElement('div');
    effect.id = 'specialEffect';
    effect.style.position = 'fixed';
    effect.style.top = '50%';
    effect.style.left = '50%';
    effect.style.transform = 'translate(-50%, -50%)';
    effect.style.fontSize = '10rem';
    effect.style.fontWeight = 'bold';
    effect.style.color = num === 6 ? '#ff00ff' : '#00ffff';
    effect.style.textShadow = '0 0 60px #fff, 0 0 120px #ff69b4';
    effect.style.zIndex = 99999;
    effect.style.pointerEvents = 'none';
    document.body.appendChild(effect);
  }
  effect.textContent = num;
  effect.style.display = 'block';
  setTimeout(() => { effect.style.display = 'none'; }, 1800);
}

// Add at the top or near other helpers
function showOutMessage() {
  // Disabled: OUT feature removed
}

// Animation loop
let lastTime = performance.now();
let ballViewAngle = 0; // For orbiting camera in ball view
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  if (window.updatePlayer) window.updatePlayer();

  // Ball view camera follow
  if (currentCameraAngle === 'ball' && mainBall) {
    // Camera orbits around the ball, distance varies 1-2m
    const ballPos = mainBall.position.clone();
    // Angle increases as ball moves forward
    ballViewAngle += 0.8 * delta; // speed of orbit
    // Distance varies with z (closer to batsman = closer camera)
    const t = Math.max(0, Math.min((mainBall.position.z + 11.06) / (11.06 + 11.06), 1));
    const dist = 2 - t; // 2m at start, 1m at batsman
    const camOffset = new THREE.Vector3(
      Math.sin(ballViewAngle) * dist,
      1 + 0.5 * Math.cos(ballViewAngle),
      -dist
    );
    camera.position.copy(ballPos.clone().add(camOffset));
    camera.position.y = Math.max(camera.position.y, ballPos.y + 0.3, 0.5); // always above ground
    camera.lookAt(ballPos);
  }

  // FPV mode: camera tracks the ball
  if (currentCameraAngle === 'fpv' && mainBall) {
    camera.lookAt(mainBall.position);
  }

  // === Animate night sky twinkling stars ===
  if (isNightMode && nightSkyStarData && nightSkyCtx && nightSkyTexture) {
    drawNightSkyStars(now * 0.001);
  }

  renderer.render(scene, camera);
  updateBallTrail();
}
animate();

// Debug: Arrow keys to rotate bat (for testing)
window.addEventListener('keydown', (e) => {
  if (!playerGroup) return;
  let bat = null;
  playerGroup.traverse(obj => {
    if (obj.geometry && obj.geometry.type === 'BoxGeometry') bat = obj;
  });
  if (!bat) return;
  if (e.code === 'ArrowLeft') bat.rotation.z -= 0.08;
  if (e.code === 'ArrowRight') bat.rotation.z += 0.08;
});

// Debug: Press 'b' to throw a red ball from the bowler's end
window.addEventListener('keydown', (e) => {
  if (e.key === 'b' || e.key === 'B') {
    launchRedBall(ballType, ballSpeed);
  }
});

// Ball type selector
let ballType = 'normal';
const typeSelect = document.getElementById('ballType');
if (typeSelect) {
  typeSelect.addEventListener('change', (e) => {
    ballType = e.target.value;
  });
}

// Speed slider
let ballSpeed = 16;
const speedRange = document.getElementById('speedRange');
const speedValue = document.getElementById('speedValue');
const speedKmh = document.getElementById('speedKmh');
function updateSpeedDisplay(val) {
  if (speedValue) speedValue.textContent = val;
  if (speedKmh) speedKmh.textContent = Math.round(val * 3.6);
}
if (speedRange && speedValue) {
  speedRange.addEventListener('input', (e) => {
    ballSpeed = parseFloat(e.target.value);
    updateSpeedDisplay(ballSpeed);
  });
  updateSpeedDisplay(speedRange.value);
  ballSpeed = parseFloat(speedRange.value);
}

// Start button launches the red ball
const startBtn = document.getElementById('startBtn');
if (startBtn) {
  startBtn.addEventListener('click', () => {
    launchRedBall(ballType, ballSpeed);
  });
}

// Add camera angle dropdown to UI
document.addEventListener('DOMContentLoaded', () => {
  let camBox = document.getElementById('cameraBox');
  if (!camBox) {
    camBox = document.createElement('div');
    camBox.id = 'cameraBox';
    camBox.style.position = 'fixed';
    camBox.style.top = '70px';
    camBox.style.right = '32px';
    camBox.style.background = 'rgba(30,30,30,0.8)';
    camBox.style.color = '#fff';
    camBox.style.padding = '8px 16px';
    camBox.style.borderRadius = '12px';
    camBox.style.zIndex = 4;
    camBox.style.fontSize = '1.1rem';
    camBox.innerHTML = `<label for="cameraAngle">Camera:</label>
      <select id="cameraAngle">
        <option value="field">Field</option>
        <option value="fpv">FPV</option>
        <option value="ball">Ball View</option>
      </select>`;
    document.body.appendChild(camBox);
  }
  const camSelect = document.getElementById('cameraAngle');
  if (camSelect) {
    camSelect.addEventListener('change', e => setCameraAngle(e.target.value));
  }
});

// Set default camera angle
setCameraAngle('field');

function setCameraAngle(angle) {
  currentCameraAngle = angle;
  if (angle === 'field') {
    camera.position.set(0, 8, 11.06 + 2.5);
    camera.lookAt(0, 0.8, 0);
    controls.enabled = true;
  } else if (angle === 'fpv') {
    // FPV: just in front of batsman's face, looking toward bowler
    camera.position.set(0, 1.7, 11.06 - 0.8);
    controls.enabled = false;
  } else if (angle === 'ball') {
    controls.enabled = false;
    // Ball view will be animated in render loop
  }
  showHelmetMask(currentCameraAngle === 'fpv');
}

// Batting mode activation
const canvas = renderer.domElement;
canvas.addEventListener('click', (e) => {
  if (currentCameraAngle === 'field' && !battingMode) {
    battingMode = true;
    controls.enabled = false;
    document.body.style.cursor = 'crosshair';
    // Show indicator
    let indicator = document.getElementById('battingModeIndicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'battingModeIndicator';
      indicator.textContent = 'Batting Mode Active';
      indicator.style.position = 'fixed';
      indicator.style.top = '18px';
      indicator.style.left = '18px';
      indicator.style.transform = 'none';
      indicator.style.background = 'rgba(30,30,30,0.85)';
      indicator.style.color = '#fff';
      indicator.style.padding = '10px 24px';
      indicator.style.borderRadius = '12px';
      indicator.style.fontSize = '1.1rem';
      indicator.style.zIndex = 1000;
      indicator.style.boxShadow = '0 2px 16px rgba(0,0,0,0.18)';
      document.body.appendChild(indicator);
    } else {
      indicator.style.display = 'block';
    }
  }
});
// Exit batting mode with Escape
window.addEventListener('keydown', (e) => {
  if (battingMode && e.code === 'Escape') {
    battingMode = false;
    controls.enabled = true;
    document.body.style.cursor = '';
    let indicator = document.getElementById('battingModeIndicator');
    if (indicator) indicator.style.display = 'none';
  }
});

// In player.js, the batGroup touch/mouse controls should only work if battingMode is true
// To enable this, set window.isBattingMode = () => battingMode;
window.isBattingMode = () => battingMode;

// === WebSocket Bat Control (Remote Phone) ===
let wsBatData = { beta: 0, gamma: 0, alpha: 0 };
let wsSmoothBeta = 0, wsSmoothGamma = 0, wsSmoothAlpha = 0;
const wsSmoothing = 0.8; // Increased smoothing for stability

// Calibration quaternion
let calibQuat = null;

// Cache quaternion calculations for performance
const quaternionCache = new Map();
const eulerCache = new Map();

// Fixed rotation: phone axes to bat axes (front face, upright, screen away)
function getPhoneToBatQuat() {
  // Phone: Z up (out of screen), X right, Y down (home button at bottom)
  // Bat:  Z down pitch, Y up, X right (from batsman view)
  // We want: phone upright, screen away, on front face = bat upright, blade facing bowler
  // This is a 90 deg rotation around X, then 180 deg around Z
  const q1 = new THREE.Quaternion();
  q1.setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI/2); // 90 deg X
  const q2 = new THREE.Quaternion();
  q2.setFromAxisAngle(new THREE.Vector3(0,0,1), Math.PI);   // 180 deg Z
  return q2.multiply(q1); // q2 * q1
}
const phoneToBatQuat = getPhoneToBatQuat();

// Optimized quaternion conversion with caching
function eulerToQuaternion(alpha, beta, gamma) {
  // Create cache key
  const key = `${Math.round(alpha)},${Math.round(beta)},${Math.round(gamma)}`;
  
  // Check cache first
  if (quaternionCache.has(key)) {
    return quaternionCache.get(key).clone();
  }
  
  // Convert degrees to radians
  const _z = THREE.MathUtils.degToRad(alpha);
  const _x = THREE.MathUtils.degToRad(beta);
  const _y = THREE.MathUtils.degToRad(gamma);
  
  // DeviceOrientation uses intrinsic Tait-Bryan Z-X'-Y''
  const c1 = Math.cos(_z / 2);
  const c2 = Math.cos(_x / 2);
  const c3 = Math.cos(_y / 2);
  const s1 = Math.sin(_z / 2);
  const s2 = Math.sin(_x / 2);
  const s3 = Math.sin(_y / 2);
  
  // Z-X'-Y'' order
  const qw = c1 * c2 * c3 - s1 * s2 * s3;
  const qx = c1 * s2 * c3 - s1 * c2 * s3;
  const qy = c1 * c2 * s3 + s1 * s2 * c3;
  const qz = s1 * c2 * c3 + c1 * s2 * s3;
  
  // Apply fixed phone-to-bat alignment
  const phoneQuat = new THREE.Quaternion(qx, qy, qz, qw);
  const result = phoneToBatQuat.clone().multiply(phoneQuat);
  
  // Cache the result
  quaternionCache.set(key, result.clone());
  
  // Limit cache size
  if (quaternionCache.size > 1000) {
    const firstKey = quaternionCache.keys().next().value;
    quaternionCache.delete(firstKey);
  }
  
  return result;
}

// Debug overlay (reuse or create)
let wsDebugOverlay = document.createElement('div');
wsDebugOverlay.style.position = 'fixed';
wsDebugOverlay.style.top = '0';
wsDebugOverlay.style.left = '0';
wsDebugOverlay.style.background = 'rgba(0,0,0,0.7)';
wsDebugOverlay.style.color = '#fff';
wsDebugOverlay.style.fontSize = '1.1rem';
wsDebugOverlay.style.padding = '8px 18px';
wsDebugOverlay.style.zIndex = 9999;
wsDebugOverlay.style.borderBottomRightRadius = '12px';
wsDebugOverlay.innerHTML = 'beta: 0<br>gamma: 0<br>alpha: 0<br>latency: 0ms';
document.body.appendChild(wsDebugOverlay);

let lastWsUpdate = performance.now();
let wsLatency = 0;

function updateWsDebugOverlay() {
  wsDebugOverlay.innerHTML =
    `beta: ${wsSmoothBeta.toFixed(1)}<br>` +
    `gamma: ${wsSmoothGamma.toFixed(1)}<br>` +
    `alpha: ${wsSmoothAlpha.toFixed(1)}<br>` +
    `latency: ${wsLatency.toFixed(0)}ms`;
}

// Optimized WebSocket connection with auto-reconnect
let ws = null;
let wsReconnectAttempts = 0;
const maxReconnectAttempts = 5;

function connectWebSocket() {
  // Try to get local IP automatically, fallback to hardcoded
  const localIP = window.location.hostname === 'localhost' ? '192.168.1.52' : window.location.hostname;
  const wsUrl = `ws://${localIP}:8081`;
  
  try {
    ws = new WebSocket(wsUrl);
    window.ws = ws; // <-- Ensure global reference for vibration
    
    ws.onopen = function() {
      console.log('WebSocket connected');
      wsReconnectAttempts = 0;
    };
    
    ws.onclose = function() {
      console.log('WebSocket disconnected');
      if (wsReconnectAttempts < maxReconnectAttempts) {
        wsReconnectAttempts++;
        setTimeout(connectWebSocket, 1000 * wsReconnectAttempts);
      }
    };
    
    ws.onerror = function(error) {
      console.error('WebSocket error:', error);
    };
    
    ws.onmessage = function(event) {
      const startTime = performance.now();
      
      if (typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data);
          processWsData(data);
          wsLatency = performance.now() - startTime;
        } catch (e) { 
          console.error('WS parse error', e); 
        }
      } else if (event.data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = function() {
          try {
            const data = JSON.parse(reader.result);
            processWsData(data);
            wsLatency = performance.now() - startTime;
          } catch (e) { 
            console.error('WS parse error (blob)', e); 
          }
        };
        reader.readAsText(event.data);
      }
    };
  } catch (error) {
    console.error('Failed to create WebSocket connection:', error);
  }
}

// Optimized data processing
function processWsData(data) {
  if (data.type === 'calibrate') {
    // Store calibration quaternion (bat straight)
    calibQuat = eulerToQuaternion(((data.alpha || 0) + 180) % 360, -(data.beta || 0), -(data.gamma || 0));
    console.log('Calibration quaternion:', calibQuat);
    return;
  }
  
  // Use quaternions for 6-axis control
  const curQuat = eulerToQuaternion((data.alpha || 0), -(data.beta || 0), -(data.gamma || 0));
  if (calibQuat && window.batGroup) {
    // Relative rotation: curQuat * calibQuat^-1
    const relQuat = curQuat.clone().multiply(calibQuat.clone().invert());
    window.batGroup.quaternion.slerp(relQuat, wsSmoothing); // smooth
  }
  
  // For debug overlay, show relative Euler angles
  const relEuler = new THREE.Euler().setFromQuaternion(
    calibQuat ? curQuat.clone().multiply(calibQuat.clone().invert()) : curQuat,
    'ZXY'
  );
  wsSmoothBeta = THREE.MathUtils.radToDeg(relEuler.x);
  wsSmoothGamma = THREE.MathUtils.radToDeg(relEuler.y);
  wsSmoothAlpha = THREE.MathUtils.radToDeg(relEuler.z);
}

// Connect to WebSocket server
connectWebSocket();

// Animation loop: update smoothed values and bat
function animateWsBat() {
  // No need to update bat rotation here; it's handled in ws.onmessage
  updateWsDebugOverlay();
  requestAnimationFrame(animateWsBat);
}
animateWsBat();

// Remove device orientation overlay and animation loop to avoid confusion

// === Over Mode Feature ===
let overMode = false;
let ballsLeft = 6;
let ballInPlay = false;

// Add mode selector and ball counter UI
function addOverModeUI() {
  let modeBox = document.getElementById('modeBox');
  if (!modeBox) {
    modeBox = document.createElement('div');
    modeBox.id = 'modeBox';
    modeBox.style.position = 'fixed';
    modeBox.style.top = '12px';
    modeBox.style.left = '50%';
    modeBox.style.transform = 'translateX(-50%)';
    modeBox.style.background = 'rgba(30,30,30,0.85)';
    modeBox.style.color = '#fff';
    modeBox.style.padding = '10px 24px';
    modeBox.style.borderRadius = '12px';
    modeBox.style.fontSize = '1.1rem';
    modeBox.style.zIndex = 1001;
    modeBox.style.boxShadow = '0 2px 16px rgba(0,0,0,0.18)';
    modeBox.innerHTML = `
      <label for="modeSelect">Mode:</label>
      <select id="modeSelect">
        <option value="normal">Normal</option>
        <option value="over">1 Over Mode</option>
      </select>
      <span id="overCounter" style="margin-left:18px;display:none;">Balls left: <span id="ballsLeft">6</span></span>
      <button id="nextBallBtn" style="margin-left:18px;display:none;">Next Ball</button>
      <button id="resetOverBtn" style="margin-left:12px;display:none;">Reset Over</button>
    `;
    document.body.appendChild(modeBox);
  }
  const modeSelect = document.getElementById('modeSelect');
  const overCounter = document.getElementById('overCounter');
  const ballsLeftSpan = document.getElementById('ballsLeft');
  const nextBallBtn = document.getElementById('nextBallBtn');
  const resetOverBtn = document.getElementById('resetOverBtn');

  modeSelect.addEventListener('change', () => {
    overMode = modeSelect.value === 'over';
    if (overMode) {
      ballsLeft = 6;
      overCounter.style.display = '';
      nextBallBtn.style.display = '';
      resetOverBtn.style.display = '';
      ballsLeftSpan.textContent = ballsLeft;
      nextBallBtn.disabled = false;
      ballInPlay = false;
    } else {
      overCounter.style.display = 'none';
      nextBallBtn.style.display = 'none';
      resetOverBtn.style.display = 'none';
    }
  });

  nextBallBtn.addEventListener('click', () => {
    if (!ballInPlay && ballsLeft > 0) {
      launchRedBall(ballType, ballSpeed);
      ballInPlay = true;
      nextBallBtn.disabled = true;
    }
  });

  resetOverBtn.addEventListener('click', () => {
    ballsLeft = 6;
    ballsLeftSpan.textContent = ballsLeft;
    nextBallBtn.disabled = false;
    ballInPlay = false;
  });

  // Expose for use in ball logic
  window._overUI = { ballsLeftSpan, nextBallBtn };
}
addOverModeUI();

// Patch launchRedBall to respect over mode and multiplayer mode
const _realLaunchRedBall = launchRedBall;
launchRedBall = function(type, speed) {
  // Multiplayer mode takes precedence
  if (multiplayerMode) {
    const currentPlayer = multiplayerData.players[multiplayerData.currentPlayerIndex];
    if (multiplayerData.currentBall >= currentPlayer.balls) {
      multiplayerData.currentPlayerIndex++;
      multiplayerData.currentBall = 0;
      if (multiplayerData.currentPlayerIndex < multiplayerData.players.length) {
        setCameraAngle('fpv');
        setTimeout(() => { startPlayerTurn(); }, 1000);
      } else {
        showMultiplayerScoreboard();
      }
      return;
    }
    multiplayerData.gameState = 'playing';
    updateMultiplayerTimer();
    // Always use multiplayerData values
    _realLaunchRedBall(multiplayerData.ballType, multiplayerData.ballSpeed);
    multiplayerData.currentBall++;
    return;
  }
  // Over mode (only if not in multiplayer)
  if (overMode) {
    if (ballsLeft <= 0 || ballInPlay) return;
    ballsLeft--;
    window._overUI.ballsLeftSpan.textContent = ballsLeft;
    window._overUI.nextBallBtn.disabled = true;
    ballInPlay = true;
  }
  _realLaunchRedBall(type, speed);
};

// Detect when the ball stops to enable next ball
function monitorBallStop() {
  if (!overMode || !ballInPlay) return;
  // Ball is considered stopped if isAnimating is false
  if (!isAnimating) {
    ballInPlay = false;
    if (ballsLeft > 0) {
      window._overUI.nextBallBtn.disabled = true; // Disable button during wait
      // Automatically throw next ball after 10 seconds
      setTimeout(() => {
        if (!ballInPlay && overMode && ballsLeft > 0) {
          launchRedBall(ballType, ballSpeed);
        }
      }, 10000);
    } else {
      window._overUI.nextBallBtn.disabled = false;
    }
  } else {
    setTimeout(monitorBallStop, 120);
  }
}

// === Audio Preload ===
const audioBat = new Audio('auid/bat.mp3');
const audioOut = new Audio('auid/out.mp3');
const audioCrowd = new Audio('auid/crowed.mp3');
const audioShot = new Audio('auid/shot.mp3');
const audioDis = new Audio('auid/dis.mp3');
audioBat.preload = 'auto';
audioOut.preload = 'auto';
audioCrowd.preload = 'auto';
audioShot.preload = 'auto';
audioDis.preload = 'auto';
audioCrowd.loop = true;
audioCrowd.volume = 0.07;

// Start crowd sound as soon as user interacts (required by browsers)
function startCrowdAudio() {
  if (audioCrowd.paused) {
    audioCrowd.currentTime = 0;
    audioCrowd.play();
  }
}
window.addEventListener('click', startCrowdAudio, { once: true });
window.addEventListener('keydown', startCrowdAudio, { once: true });

// Helper to play audio safely (restarts if already playing)
function playAudio(audio) {
  try {
    audio.currentTime = 0;
    audio.play();
  } catch (e) {}
}

function playAudioClone(src, volume = 1.0) {
  try {
    const audio = new Audio(src);
    audio.volume = volume;
    audio.play();
  } catch (e) {}
}

// Track which wicket area is currently red to avoid repeated triggers
let lastRedWicketArea = null;
let lastRedWicketTimeout = null;

function checkBallTouchesWicketArea(ballPos) {
  for (const area of allWicketAreas) {
    const { x: ax, y: ay, z: az } = area.position;
    const width = area.geometry.parameters.width;
    const height = area.geometry.parameters.height;
    const depth = area.geometry.parameters.depth;
    // Area bounds
    const minX = ax - width / 2;
    const maxX = ax + width / 2;
    const minY = ay - height / 2;
    const maxY = ay + height / 2;
    const minZ = az - depth / 2;
    const maxZ = az + depth / 2;
    if (
      ballPos.x >= minX && ballPos.x <= maxX &&
      ballPos.y >= minY && ballPos.y <= maxY &&
      ballPos.z >= minZ && ballPos.z <= maxZ
    ) {
      // Only trigger if not already red
      if (lastRedWicketArea !== area) {
        area.material.color.set(0xff0000);
        if (lastRedWicketTimeout) clearTimeout(lastRedWicketTimeout);
        lastRedWicketArea = area;
        lastRedWicketTimeout = setTimeout(() => {
          area.material.color.set(0x8000ff);
          lastRedWicketArea = null;
        }, 1000);
      }
      return;
    }
  }
}

// Track pink area color change state
let pinkAreaIsYellow = false;
let pinkAreaTimeout = null;

function checkBallTouchesPinkArea(ballPos) {
  // Pink ellipse: x-radius 72.5, z-radius 62.5, centered at (0,0)
  // Batsman side: z ≈ 11.06 (allow a window, e.g. z > 8)
  const px = ballPos.x;
  const pz = ballPos.z;
  const insidePink = (px * px) / (72.5 * 72.5) + (pz * pz) / (62.5 * 62.5) <= 1;
  const batsmanSide = pz > 8; // Only trigger on batsman side
  if (pinkBoundaryCylinder && insidePink && batsmanSide) {
    if (!pinkAreaIsYellow) {
      pinkBoundaryCylinder.material.color.set(0xffff00); // yellow
      pinkAreaIsYellow = true;
      if (pinkAreaTimeout) clearTimeout(pinkAreaTimeout);
      pinkAreaTimeout = setTimeout(() => {
        pinkBoundaryCylinder.material.color.set(0xff69b4); // pink
        pinkAreaIsYellow = false;
      }, 3000);
    }
  }
}

let nightSkySphere = null;
let nightSkyStarData = null;
let nightSkyCanvas = null;
let nightSkyCtx = null;
let nightSkyTexture = null;

function createNightSkySphere() {
  if (nightSkySphere) return nightSkySphere;
  // Create a large sphere geometry
  const skyRadius = 300;
  const skyGeometry = new THREE.SphereGeometry(skyRadius, 64, 64);

  // Create a canvas texture for stars
  nightSkyCanvas = document.createElement('canvas');
  nightSkyCanvas.width = 1024;
  nightSkyCanvas.height = 1024;
  nightSkyCtx = nightSkyCanvas.getContext('2d');

  // Store star data for twinkling
  nightSkyStarData = [];
  // Fill with pure black
  nightSkyCtx.fillStyle = '#000000';
  nightSkyCtx.fillRect(0, 0, 1024, 1024);
  // Add very few random white stars with twinkle params
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const r = Math.random() * 1.3 + 0.5;
    const phase = Math.random() * Math.PI * 2;
    const speed = 0.7 + Math.random() * 1.2;
    nightSkyStarData.push({ x, y, r, phase, speed });
  }
  // Initial draw
  drawNightSkyStars(0);
  nightSkyTexture = new THREE.CanvasTexture(nightSkyCanvas);
  nightSkyTexture.wrapS = THREE.RepeatWrapping;
  nightSkyTexture.wrapT = THREE.RepeatWrapping;
  nightSkyTexture.repeat.set(2, 2);

  // Material for the inside of the sphere
  const skyMaterial = new THREE.MeshBasicMaterial({
    map: nightSkyTexture,
    side: THREE.BackSide,
    transparent: false,
    depthWrite: false
  });

  nightSkySphere = new THREE.Mesh(skyGeometry, skyMaterial);
  nightSkySphere.position.set(0, 0, 0);
  nightSkySphere.visible = false;
  scene.add(nightSkySphere);
  return nightSkySphere;
}

function drawNightSkyStars(time) {
  // Redraw the pure black background
  const ctx = nightSkyCtx;
  ctx.clearRect(0, 0, 1024, 1024);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 1024, 1024);
  // Draw twinkling stars
  for (let i = 0; i < nightSkyStarData.length; i++) {
    const star = nightSkyStarData[i];
    // Twinkle: alpha varies sinusoidally, speed increased
    const twinkle = 0.5 + 0.5 * Math.sin(time * star.speed * 2 + star.phase);
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, 2 * Math.PI);
    ctx.fillStyle = 'white';
    ctx.globalAlpha = 0.25 + 0.75 * twinkle;
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
  if (nightSkyTexture) nightSkyTexture.needsUpdate = true;
}

let cloudMeshes = [];

function addClouds() {
  // Remove existing clouds
  for (const mesh of cloudMeshes) scene.remove(mesh);
  cloudMeshes = [];
  // Load cloud texture
  const cloudTexture = new THREE.TextureLoader().load('cloud.png');
  cloudTexture.wrapS = THREE.ClampToEdgeWrapping;
  cloudTexture.wrapT = THREE.ClampToEdgeWrapping;
  cloudTexture.minFilter = THREE.LinearFilter;
  cloudTexture.magFilter = THREE.LinearFilter;
  // Add several clouds
  for (let i = 0; i < 8; i++) {
    const width = 18 + Math.random() * 12;
    const height = width * (0.38 + Math.random() * 0.18);
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshLambertMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: 0.82 + Math.random() * 0.13,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    // Random position above the field
    const angle = Math.random() * Math.PI * 2;
    const radius = 60 + Math.random() * 40;
    mesh.position.set(Math.cos(angle) * radius, 38 + Math.random() * 12, Math.sin(angle) * radius);
    mesh.rotation.x = -Math.PI / 2.2 + (Math.random() - 0.5) * 0.2;
    mesh.rotation.z = (Math.random() - 0.5) * 0.2;
    mesh.rotation.y = Math.random() * Math.PI * 2;
    scene.add(mesh);
    cloudMeshes.push(mesh);
  }
}

function showClouds(show) {
  for (const mesh of cloudMeshes) mesh.visible = show;
}

// === Helmet Mask Overlay for FPV ===
function addHelmetMaskOverlay() {
  let helmetMask = document.getElementById('helmetMaskOverlay');
  if (!helmetMask) {
    helmetMask = document.createElement('img');
    helmetMask.id = 'helmetMaskOverlay';
    helmetMask.src = 'helmet_mask.png';
    helmetMask.style.position = 'fixed';
    helmetMask.style.top = '4vh'; // Move image a little further down
    helmetMask.style.left = '0';
    helmetMask.style.width = '100vw';
    helmetMask.style.height = '100vh';
    helmetMask.style.pointerEvents = 'none';
    helmetMask.style.zIndex = 1003;
    helmetMask.style.display = 'none';
    document.body.appendChild(helmetMask);
  }
}

function showHelmetMask(show) {
  const helmetMask = document.getElementById('helmetMaskOverlay');
  if (helmetMask) helmetMask.style.display = show ? 'block' : 'none';
}

addHelmetMaskOverlay();

// === Modern Menu Overlay ===
function addMainMenu() {
  let menu = document.getElementById('mainMenuOverlay');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'mainMenuOverlay';
    menu.style.position = 'fixed';
    menu.style.top = '0';
    menu.style.left = '0';
    menu.style.width = '100vw';
    menu.style.height = '100vh';
    menu.style.background = 'radial-gradient(ellipse at center, rgba(30,40,60,0.98) 0%, rgba(10,15,25,0.98) 100%)';
    menu.style.display = 'flex';
    menu.style.flexDirection = 'column';
    menu.style.justifyContent = 'center';
    menu.style.alignItems = 'center';
    menu.style.zIndex = 2000;
    menu.style.transition = 'opacity 0.5s cubic-bezier(.4,2,.6,1)';
    menu.style.opacity = '1';
    menu.innerHTML = `
      <div style="
        background: rgba(255,255,255,0.04); 
        border-radius: 32px; 
        box-shadow: 0 8px 48px 0 rgba(0,0,0,0.25);
        padding: 48px 64px 40px 64px;
        display: flex; flex-direction: column; align-items: center; gap: 32px;">
        <h1 style="
          color: #fff;
          font-size: 3rem;
          font-family: 'Segoe UI', 'Roboto', Arial, sans-serif;
          letter-spacing: 0.04em;
          margin-bottom: 12px;
          text-shadow: 0 2px 24px #000, 0 0 2px #fff;
        ">CRICKET 3D</h1>
        <button id="menuDevBtn" style="
          background: linear-gradient(90deg, #3a8dde 0%, #1e3c72 100%);
          color: #fff;
          border: none;
          border-radius: 16px;
          font-size: 1.5rem;
          font-family: 'Segoe UI', 'Roboto', Arial, sans-serif;
          padding: 18px 64px;
          margin-top: 12px;
          box-shadow: 0 2px 16px rgba(30,60,120,0.18);
          cursor: pointer;
          transition: background 0.3s, transform 0.2s;
        ">Developer</button>
      </div>
    `;
    document.body.appendChild(menu);
    // Add click handler
    document.getElementById('menuDevBtn').onclick = () => {
      menu.style.opacity = '0';
      setTimeout(() => { 
        menu.style.display = 'none'; 
        // Show UI controls when entering developer mode
        toggleUIControlsVisibility(true);
      }, 500);
    };
  } else {
    menu.style.display = 'flex';
    menu.style.opacity = '1';
  }
}

addMainMenu();

// === Multiplayer System ===
let multiplayerMode = false;
let multiplayerData = {
  players: [],
  currentPlayerIndex: 0,
  currentBall: 0,
  gameState: 'setup', // 'setup', 'countdown', 'playing', 'ballEnd', 'gameOver'
  countdown: 5,
  ballType: 'normal',
  ballSpeed: 16,
  mapMode: 'day', // 'day' or 'night'
  scores: [],
  timer: null
};

// Function to hide/show UI controls based on multiplayer mode
function toggleUIControlsVisibility(show) {
  // Day/Night toggle button
  const dayNightBtn = document.getElementById('dayNightBtn');
  if (dayNightBtn) {
    dayNightBtn.style.display = show ? 'block' : 'none';
  }
  
  // Camera angle selector
  const cameraBox = document.getElementById('cameraBox');
  if (cameraBox) {
    cameraBox.style.display = show ? 'block' : 'none';
  }
  
  // Ball type and speed controls (from HTML)
  const ballTypeBox = document.getElementById('ballTypeBox');
  if (ballTypeBox) {
    ballTypeBox.style.display = show ? 'flex' : 'none';
  }
  
  // Start/Pause controls (from HTML)
  const controls = document.getElementById('controls');
  if (controls) {
    controls.style.display = show ? 'block' : 'none';
  }
  
  // Mode selector (Over mode)
  const modeBox = document.getElementById('modeBox');
  if (modeBox) {
    modeBox.style.display = show ? 'block' : 'none';
  }
  
  // Scoreboard (hide during multiplayer as it's handled differently)
  const scoreboard = document.getElementById('scoreboard');
  if (scoreboard) {
    scoreboard.style.display = show ? 'block' : 'none';
  }
  
  // WebSocket debug overlay (hide during multiplayer)
  const wsDebugOverlay = document.querySelector('div[style*="position: fixed"][style*="top: 0"][style*="left: 0"][style*="background: rgba(0,0,0,0.7)"]');
  if (wsDebugOverlay) {
    wsDebugOverlay.style.display = show ? 'block' : 'none';
  }
  
  // Batting mode indicator (hide during multiplayer)
  const battingModeIndicator = document.getElementById('battingModeIndicator');
  if (battingModeIndicator) {
    battingModeIndicator.style.display = show ? 'block' : 'none';
  }
  
  // Special effect div (hide during multiplayer)
  const specialEffect = document.getElementById('specialEffect');
  if (specialEffect) {
    specialEffect.style.display = show ? 'block' : 'none';
  }
  
  // Out message div (hide during multiplayer)
  const outMsg = document.getElementById('outMsg');
  if (outMsg) {
    outMsg.style.display = show ? 'block' : 'none';
  }
}

// === Multiplayer Menu ===
function addMultiplayerMenu() {
  let menu = document.getElementById('multiplayerMenuOverlay');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'multiplayerMenuOverlay';
    menu.style.position = 'fixed';
    menu.style.top = '0';
    menu.style.left = '0';
    menu.style.width = '100vw';
    menu.style.height = '100vh';
    menu.style.background = 'radial-gradient(ellipse at center, rgba(30,40,60,0.98) 0%, rgba(10,15,25,0.98) 100%)';
    menu.style.display = 'none';
    menu.style.flexDirection = 'column';
    menu.style.justifyContent = 'center';
    menu.style.alignItems = 'center';
    menu.style.zIndex = 2001;
    menu.style.transition = 'opacity 0.5s cubic-bezier(.4,2,.6,1)';
    menu.style.opacity = '1';
    
    menu.innerHTML = `
      <div style="
        background: rgba(255,255,255,0.04); 
        border-radius: 32px; 
        box-shadow: 0 8px 48px 0 rgba(0,0,0,0.25);
        padding: 48px 64px 40px 64px;
        display: flex; flex-direction: column; align-items: center; gap: 24px;
        max-width: 600px; width: 90%;">
        <h1 style="
          color: #fff;
          font-size: 2.5rem;
          font-family: 'Segoe UI', 'Roboto', Arial, sans-serif;
          letter-spacing: 0.04em;
          margin-bottom: 12px;
          text-shadow: 0 2px 24px #000, 0 0 2px #fff;
        ">MULTIPLAYER SETUP</h1>
        
        <div style="display: flex; flex-direction: column; gap: 16px; width: 100%;">
          <div>
            <label style="color: #fff; font-size: 1.1rem; display: block; margin-bottom: 8px;">Number of Players:</label>
            <select id="playerCount" style="
              width: 100%; padding: 12px; border-radius: 8px; border: none; background: rgba(255,255,255,0.1); color: #fff; font-size: 1rem;">
              <option value="2">2 Players</option>
              <option value="3">3 Players</option>
              <option value="4">4 Players</option>
              <option value="5">5 Players</option>
              <option value="6">6 Players</option>
            </select>
          </div>
          
          <div id="playerNamesContainer" style="display: flex; flex-direction: column; gap: 12px;">
            <!-- Player name inputs will be generated here -->
          </div>
          
          <div>
            <label style="color: #fff; font-size: 1.1rem; display: block; margin-bottom: 8px;">Balls per Player:</label>
            <select id="ballsPerPlayer" style="
              width: 100%; padding: 12px; border-radius: 8px; border: none; background: rgba(255,255,255,0.1); color: #fff; font-size: 1rem;">
              <option value="6">6 Balls</option>
              <option value="12">12 Balls</option>
              <option value="18">18 Balls</option>
              <option value="24">24 Balls</option>
            </select>
          </div>
          
          <div>
            <label style="color: #fff; font-size: 1.1rem; display: block; margin-bottom: 8px;">Ball Type:</label>
            <select id="multiplayerBallType" style="
              width: 100%; padding: 12px; border-radius: 8px; border: none; background: rgba(255,255,255,0.1); color: #fff; font-size: 1rem;">
              <option value="normal">Normal</option>
              <option value="fast">Fast</option>
              <option value="bouncer">Bouncer</option>
              <option value="yorker">Yorker</option>
              <option value="spin">Spin</option>
            </select>
          </div>
          
          <div>
            <label style="color: #fff; font-size: 1.1rem; display: block; margin-bottom: 8px;">Ball Speed: <span id="speedDisplay">16</span> m/s</label>
            <input type="range" id="multiplayerSpeedRange" min="8" max="25" value="16" style="width: 100%;">
          </div>
          
          <div>
            <label style="color: #fff; font-size: 1.1rem; display: block; margin-bottom: 8px;">Map Mode:</label>
            <select id="mapMode" style="
              width: 100%; padding: 12px; border-radius: 8px; border: none; background: rgba(255,255,255,0.1); color: #fff; font-size: 1rem;">
              <option value="day">Day Mode</option>
              <option value="night">Night Mode</option>
            </select>
          </div>
        </div>
        
        <div style="display: flex; gap: 16px; margin-top: 16px;">
          <button id="startMultiplayerBtn" style="
            background: linear-gradient(90deg, #4CAF50 0%, #45a049 100%);
            color: #fff;
            border: none;
            border-radius: 16px;
            font-size: 1.2rem;
            font-family: 'Segoe UI', 'Roboto', Arial, sans-serif;
            padding: 16px 32px;
            box-shadow: 0 2px 16px rgba(76,175,80,0.3);
            cursor: pointer;
            transition: all 0.3s ease;
          ">Start Game</button>
          <button id="backToMainBtn" style="
            background: linear-gradient(90deg, #666 0%, #555 100%);
            color: #fff;
            border: none;
            border-radius: 16px;
            font-size: 1.2rem;
            font-family: 'Segoe UI', 'Roboto', Arial, sans-serif;
            padding: 16px 32px;
            box-shadow: 0 2px 16px rgba(0,0,0,0.2);
            cursor: pointer;
            transition: all 0.3s ease;
          ">Back</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(menu);
    
    // Add event listeners
    setupMultiplayerEventListeners();
  }
  
  generatePlayerNameInputs();
  return menu;
}

function generatePlayerNameInputs() {
  const container = document.getElementById('playerNamesContainer');
  const playerCount = parseInt(document.getElementById('playerCount').value);
  
  container.innerHTML = '';
  for (let i = 0; i < playerCount; i++) {
    const div = document.createElement('div');
    div.innerHTML = `
      <label style="color: #fff; font-size: 1rem; display: block; margin-bottom: 4px;">Player ${i + 1} Name:</label>
      <input type="text" id="playerName${i}" placeholder="Enter name..." style="
        width: 100%; padding: 12px; border-radius: 8px; border: none; background: rgba(255,255,255,0.1); 
        color: #fff; font-size: 1rem;" value="Player ${i + 1}">
    `;
    container.appendChild(div);
  }
}

function setupMultiplayerEventListeners() {
  // Player count change
  document.getElementById('playerCount').addEventListener('change', generatePlayerNameInputs);
  
  // Speed range
  const speedRange = document.getElementById('multiplayerSpeedRange');
  const speedDisplay = document.getElementById('speedDisplay');
  speedRange.addEventListener('input', (e) => {
    speedDisplay.textContent = e.target.value;
  });
  
  // Start multiplayer game
  document.getElementById('startMultiplayerBtn').addEventListener('click', startMultiplayerGame);
  
  // Back to main menu
  document.getElementById('backToMainBtn').addEventListener('click', () => {
    document.getElementById('multiplayerMenuOverlay').style.display = 'none';
    // Hide the timer when returning to main menu
    const timerDisplay = document.getElementById('multiplayerTimer');
    if (timerDisplay) {
      timerDisplay.style.display = 'none';
    }
    // Show UI controls when returning to main menu
    toggleUIControlsVisibility(true);
    document.getElementById('mainMenuOverlay').style.display = 'flex';
  });
}

function startMultiplayerGame() {
  // Collect all player data
  const playerCount = parseInt(document.getElementById('playerCount').value);
  const ballsPerPlayer = parseInt(document.getElementById('ballsPerPlayer').value);
  const ballType = document.getElementById('multiplayerBallType').value;
  const ballSpeed = parseInt(document.getElementById('multiplayerSpeedRange').value);
  const mapMode = document.getElementById('mapMode').value;
  
  // Debug: Log the collected values
  console.log('Multiplayer setup:', {
    playerCount,
    ballsPerPlayer,
    ballType,
    ballSpeed,
    mapMode
  });
  
  // Validate player names
  const players = [];
  for (let i = 0; i < playerCount; i++) {
    const name = document.getElementById(`playerName${i}`).value.trim();
    if (!name) {
      alert(`Please enter a name for Player ${i + 1}`);
      return;
    }
    players.push({
      name: name,
      balls: ballsPerPlayer,
      score: 0,
      fours: 0,
      sixes: 0
    });
  }
  
  // Set up multiplayer data
  multiplayerData = {
    players: players,
    currentPlayerIndex: 0,
    currentBall: 0,
    gameState: 'countdown',
    countdown: 5,
    ballType: ballType,
    ballSpeed: ballSpeed,
    mapMode: mapMode,
    scores: [],
    timer: null
  };
  
  // Debug: Log the multiplayer data
  console.log('Multiplayer data set:', multiplayerData);
  
  // Set map mode
  if (mapMode === 'night' && !isNightMode) {
    toggleDayNightMode();
  } else if (mapMode === 'day' && isNightMode) {
    toggleDayNightMode();
  }
  
  // Hide menu and start game
  document.getElementById('multiplayerMenuOverlay').style.display = 'none';
  multiplayerMode = true;
  
  // Hide all UI controls during multiplayer
  toggleUIControlsVisibility(false);
  
  // Initialize and show the timer
  addMultiplayerTimer();
  updateMultiplayerTimer();
  
  // Set camera to FPV
  setCameraAngle('fpv');
  
  // Start first player's turn
  startPlayerTurn();
}

function startPlayerTurn() {
  const currentPlayer = multiplayerData.players[multiplayerData.currentPlayerIndex];
  
  // Show player name and countdown
  showPlayerTurnDisplay(currentPlayer.name);
  
  // Update the timer display for new player
  updateMultiplayerTimer();
  
  // Start 5-second countdown
  multiplayerData.countdown = 5;
  multiplayerData.gameState = 'countdown';
  
  function countdownTick() {
    if (multiplayerData.countdown > 0) {
      updateCountdownDisplay(multiplayerData.countdown);
      multiplayerData.countdown--;
      setTimeout(countdownTick, 1000);
    } else {
      // Countdown finished, start playing
      multiplayerData.gameState = 'playing';
      hideCountdownDisplay();
      launchRedBall(multiplayerData.ballType, multiplayerData.ballSpeed);
    }
  }
  
  countdownTick();
}

function showPlayerTurnDisplay(playerName) {
  let display = document.getElementById('playerTurnDisplay');
  if (!display) {
    display = document.createElement('div');
    display.id = 'playerTurnDisplay';
    display.style.position = 'fixed';
    display.style.top = '50%';
    display.style.left = '50%';
    display.style.transform = 'translate(-50%, -50%)';
    display.style.background = 'rgba(0,0,0,0.8)';
    display.style.color = '#fff';
    display.style.padding = '24px 48px';
    display.style.borderRadius = '16px';
    display.style.fontSize = '2rem';
    display.style.fontWeight = 'bold';
    display.style.zIndex = 10000;
    display.style.textAlign = 'center';
    document.body.appendChild(display);
  }
  
  display.innerHTML = `
    <div style="margin-bottom: 16px;">${playerName}'s Turn</div>
    <div id="countdownDisplay" style="font-size: 3rem; color: #ff6b6b;">5</div>
    <div style="font-size: 1rem; margin-top: 8px;">Match starts in <span id="countdownText">5</span> seconds</div>
  `;
  display.style.display = 'block';
}

function updateCountdownDisplay(count) {
  const countdownDisplay = document.getElementById('countdownDisplay');
  const countdownText = document.getElementById('countdownText');
  if (countdownDisplay) countdownDisplay.textContent = count;
  if (countdownText) countdownText.textContent = count;
}

function hideCountdownDisplay() {
  const display = document.getElementById('playerTurnDisplay');
  if (display) display.style.display = 'none';
}

// Override the original ball launch to handle multiplayer
const originalLaunchRedBall = launchRedBall;
launchRedBall = function(type, speed) {
  if (multiplayerMode) {
    // Check if current player has balls remaining
    const currentPlayer = multiplayerData.players[multiplayerData.currentPlayerIndex];
    if (multiplayerData.currentBall >= currentPlayer.balls) {
      // No more balls for this player, move to next player
      multiplayerData.currentPlayerIndex++;
      multiplayerData.currentBall = 0;
      
      if (multiplayerData.currentPlayerIndex < multiplayerData.players.length) {
        // Next player's turn
        setCameraAngle('fpv');
        setTimeout(() => {
          startPlayerTurn();
        }, 1000);
      } else {
        // All players done, show scoreboard
        showMultiplayerScoreboard();
      }
      return; // Don't launch ball
    }
    
    // In multiplayer, track the ball launch
    multiplayerData.gameState = 'playing';
    // Update the timer display before launching
    updateMultiplayerTimer();
    
    // Use multiplayer ball type and speed
    type = multiplayerData.ballType;
    speed = multiplayerData.ballSpeed;
    
    // Debug: Log the speed being used
    console.log('Multiplayer ball launch:', { type, speed, currentBall: multiplayerData.currentBall + 1 });
  }
  
  originalLaunchRedBall(type, speed);
  
  // Increment ball count after launching
  if (multiplayerMode) {
    multiplayerData.currentBall++;
  }
};

// Override ball stop detection for multiplayer
const originalMonitorBallStop = monitorBallStop;
monitorBallStop = function() {
  if (multiplayerMode) {
    // Wait 3 seconds after ball stops, then handle multiplayer logic
    setTimeout(() => {
      handleMultiplayerBallEnd();
    }, 3000);
  } else {
    originalMonitorBallStop();
  }
};

function handleMultiplayerBallEnd() {
  const currentPlayer = multiplayerData.players[multiplayerData.currentPlayerIndex];
  
  // Check if current player has more balls
  if (multiplayerData.currentBall < currentPlayer.balls) {
    // Reset camera to FPV and continue with next ball immediately
    setCameraAngle('fpv');
    setTimeout(() => {
      // Automatically launch next ball without countdown
      multiplayerData.gameState = 'playing';
      launchRedBall(multiplayerData.ballType, multiplayerData.ballSpeed);
    }, 1000);
  } else {
    // Player's turn is over, move to next player
    multiplayerData.currentPlayerIndex++;
    multiplayerData.currentBall = 0;
    
    if (multiplayerData.currentPlayerIndex < multiplayerData.players.length) {
      // Next player's turn
      setCameraAngle('fpv');
      setTimeout(() => {
        startPlayerTurn();
      }, 1000);
    } else {
      // All players done, show scoreboard
      showMultiplayerScoreboard();
    }
  }
}

function showMultiplayerScoreboard() {
  // Hide the timer when game ends
  const timerDisplay = document.getElementById('multiplayerTimer');
  if (timerDisplay) {
    timerDisplay.style.display = 'none';
  }
  
  // Calculate final scores and statistics
  const players = multiplayerData.players;
  
  let scoreboard = document.getElementById('multiplayerScoreboard');
  if (!scoreboard) {
    scoreboard = document.createElement('div');
    scoreboard.id = 'multiplayerScoreboard';
    scoreboard.style.position = 'fixed';
    scoreboard.style.top = '0';
    scoreboard.style.left = '0';
    scoreboard.style.width = '100vw';
    scoreboard.style.height = '100vh';
    scoreboard.style.background = 'radial-gradient(ellipse at center, rgba(30,40,60,0.98) 0%, rgba(10,15,25,0.98) 100%)';
    scoreboard.style.display = 'flex';
    scoreboard.style.justifyContent = 'center';
    scoreboard.style.alignItems = 'center';
    scoreboard.style.zIndex = 2002;
    document.body.appendChild(scoreboard);
  }
  
  // Sort players by score
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  
  scoreboard.innerHTML = `
    <div style="
      background: rgba(255,255,255,0.04); 
      border-radius: 32px; 
      box-shadow: 0 8px 48px 0 rgba(0,0,0,0.25);
      padding: 48px 64px 40px 64px;
      max-width: 800px; width: 90%; max-height: 80vh; overflow-y: auto;">
      <h1 style="
        color: #fff;
        font-size: 2.5rem;
        font-family: 'Segoe UI', 'Roboto', Arial, sans-serif;
        text-align: center;
        margin-bottom: 32px;
        text-shadow: 0 2px 24px #000, 0 0 2px #fff;
      ">🏆 FINAL SCOREBOARD 🏆</h1>
      
      <div style="display: flex; flex-direction: column; gap: 16px;">
        ${sortedPlayers.map((player, index) => `
          <div style="
            background: ${index === 0 ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.05)'};
            border: ${index === 0 ? '2px solid #FFD700' : '1px solid rgba(255,255,255,0.1)'};
            border-radius: 16px;
            padding: 20px;
            display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 16px;">
              <span style="
                font-size: 1.5rem;
                color: ${index === 0 ? '#FFD700' : '#fff'};
                font-weight: bold;
              ">${index + 1}.</span>
              <span style="
                font-size: 1.3rem;
                color: ${index === 0 ? '#FFD700' : '#fff'};
                font-weight: bold;
              ">${player.name}</span>
            </div>
            <div style="text-align: right;">
              <div style="
                font-size: 2rem;
                color: ${index === 0 ? '#FFD700' : '#fff'};
                font-weight: bold;
              ">${player.score}</div>
              <div style="
                font-size: 0.9rem;
                color: rgba(255,255,255,0.7);
              ">4s: ${player.fours} | 6s: ${player.sixes}</div>
            </div>
          </div>
        `).join('')}
      </div>
      
      <div style="text-align: center; margin-top: 32px;">
        <button id="playAgainBtn" style="
          background: linear-gradient(90deg, #4CAF50 0%, #45a049 100%);
          color: #fff;
          border: none;
          border-radius: 16px;
          font-size: 1.2rem;
          font-family: 'Segoe UI', 'Roboto', Arial, sans-serif;
          padding: 16px 32px;
          margin-right: 16px;
          box-shadow: 0 2px 16px rgba(76,175,80,0.3);
          cursor: pointer;
          transition: all 0.3s ease;
        ">Play Again</button>
        <button id="backToMenuBtn" style="
          background: linear-gradient(90deg, #666 0%, #555 100%);
          color: #fff;
          border: none;
          border-radius: 16px;
          font-size: 1.2rem;
          font-family: 'Segoe UI', 'Roboto', Arial, sans-serif;
          padding: 16px 32px;
          box-shadow: 0 2px 16px rgba(0,0,0,0.2);
          cursor: pointer;
          transition: all 0.3s ease;
        ">Back to Menu</button>
      </div>
    </div>
  `;
  
  scoreboard.style.display = 'flex';
  
  // Add event listeners
  document.getElementById('playAgainBtn').addEventListener('click', () => {
    scoreboard.style.display = 'none';
    // Hide the timer when returning to menu
    const timerDisplay = document.getElementById('multiplayerTimer');
    if (timerDisplay) {
      timerDisplay.style.display = 'none';
    }
    // Keep controls hidden for new multiplayer game
    toggleUIControlsVisibility(false);
    document.getElementById('multiplayerMenuOverlay').style.display = 'flex';
  });
  
  document.getElementById('backToMenuBtn').addEventListener('click', () => {
    scoreboard.style.display = 'none';
    multiplayerMode = false;
    // Hide the timer when returning to main menu
    const timerDisplay = document.getElementById('multiplayerTimer');
    if (timerDisplay) {
      timerDisplay.style.display = 'none';
    }
    // Show UI controls again when returning to main menu
    toggleUIControlsVisibility(true);
    document.getElementById('mainMenuOverlay').style.display = 'flex';
  });
}

// Update the main menu to include multiplayer option
function updateMainMenu() {
  const menu = document.getElementById('mainMenuOverlay');
  if (menu) {
    menu.innerHTML = `
      <div style="
        background: rgba(255,255,255,0.04); 
        border-radius: 32px; 
        box-shadow: 0 8px 48px 0 rgba(0,0,0,0.25);
        padding: 48px 64px 40px 64px;
        display: flex; flex-direction: column; align-items: center; gap: 32px;">
        <h1 style="
          color: #fff;
          font-size: 3rem;
          font-family: 'Segoe UI', 'Roboto', Arial, sans-serif;
          letter-spacing: 0.04em;
          margin-bottom: 12px;
          text-shadow: 0 2px 24px #000, 0 0 2px #fff;
        ">CRICKET 3D</h1>
        <div style="display: flex; flex-direction: column; gap: 16px; width: 100%;">
          <button id="menuDevBtn" style="
            background: linear-gradient(90deg, #3a8dde 0%, #1e3c72 100%);
            color: #fff;
            border: none;
            border-radius: 16px;
            font-size: 1.5rem;
            font-family: 'Segoe UI', 'Roboto', Arial, sans-serif;
            padding: 18px 64px;
            box-shadow: 0 2px 16px rgba(30,60,120,0.18);
            cursor: pointer;
            transition: background 0.3s, transform 0.2s;
          ">Developer</button>
          <button id="menuMultiplayerBtn" style="
            background: linear-gradient(90deg, #4CAF50 0%, #45a049 100%);
            color: #fff;
            border: none;
            border-radius: 16px;
            font-size: 1.5rem;
            font-family: 'Segoe UI', 'Roboto', Arial, sans-serif;
            padding: 18px 64px;
            box-shadow: 0 2px 16px rgba(76,175,80,0.3);
            cursor: pointer;
            transition: background 0.3s, transform 0.2s;
          ">Multiplayer</button>
        </div>
      </div>
    `;
    
    // Update event listeners
    document.getElementById('menuDevBtn').onclick = () => {
      menu.style.opacity = '0';
      setTimeout(() => { 
        menu.style.display = 'none'; 
        // Show UI controls when entering developer mode
        toggleUIControlsVisibility(true);
      }, 500);
    };
    
    document.getElementById('menuMultiplayerBtn').onclick = () => {
      menu.style.display = 'none';
      // Hide UI controls when entering multiplayer mode
      toggleUIControlsVisibility(false);
      addMultiplayerMenu().style.display = 'flex';
    };
  }
}

// Initialize multiplayer system
addMultiplayerMenu();
updateMainMenu();

// Add persistent timer display for multiplayer mode
function addMultiplayerTimer() {
  let timerDisplay = document.getElementById('multiplayerTimer');
  if (!timerDisplay) {
    timerDisplay = document.createElement('div');
    timerDisplay.id = 'multiplayerTimer';
    timerDisplay.style.position = 'fixed';
    timerDisplay.style.bottom = '20px';
    timerDisplay.style.right = '20px';
    timerDisplay.style.background = 'rgba(0,0,0,0.8)';
    timerDisplay.style.color = '#fff';
    timerDisplay.style.padding = '12px 20px';
    timerDisplay.style.borderRadius = '12px';
    timerDisplay.style.fontSize = '1.2rem';
    timerDisplay.style.fontWeight = 'bold';
    timerDisplay.style.zIndex = 10001;
    timerDisplay.style.display = 'none';
    document.body.appendChild(timerDisplay);
  }
  return timerDisplay;
}

// Function to update the persistent timer
function updateMultiplayerTimer() {
  if (!multiplayerMode) return;
  
  const timerDisplay = document.getElementById('multiplayerTimer');
  if (timerDisplay) {
    const currentPlayer = multiplayerData.players[multiplayerData.currentPlayerIndex];
    const ballsLeft = currentPlayer.balls - multiplayerData.currentBall;
    const totalBalls = currentPlayer.balls;
    
    timerDisplay.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 1rem; margin-bottom: 4px;">${currentPlayer.name}</div>
        <div style="font-size: 1.5rem; color: #ff6b6b;">Ball ${multiplayerData.currentBall + 1}/${totalBalls}</div>
        <div style="font-size: 0.9rem; color: #ccc;">${ballsLeft} balls left</div>
      </div>
    `;
    timerDisplay.style.display = 'block';
  }
}
