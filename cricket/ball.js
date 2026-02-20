import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { playerGroup } from './player.js';

const BALL_RADIUS = 0.080;
const BALL_INIT_Z = -11.06; // Bowler's end
const BOUNCE_Y = 0.045 + BALL_RADIUS; // y after bounce

// Ball type configs
const BALL_TYPES = {
  normal: {
    releaseY: [1.78, 2.12],
    releaseX: [-0.6, 0.6],
    bounceZ: [2.5, 4], // meters from batsman
    bounce: 0.55,
    spin: 0,
    airCurve: 0
  },
  fast: {
    releaseY: [1.9, 2.1],
    releaseX: [-0.6, 0.6],
    bounceZ: [5, 7],
    bounce: 0.45,
    spin: 0,
    airCurve: 0
  },
  bouncer: {
    releaseY: [2.1, 2.4],
    releaseX: [-0.6, 0.6],
    bounceZ: [8, 10],
    bounce: 0.7,
    spin: 0,
    airCurve: 0
  },
  yorker: {
    releaseY: [1.5, 1.7],
    releaseX: [-0.6, 0.6],
    bounceZ: [0.5, 1.2],
    bounce: 0.3,
    spin: 0,
    airCurve: 0
  },
  offspin: {
    releaseY: [1.8, 2.0],
    releaseX: [-0.6, 0.6],
    bounceZ: [5.5, 7.5],
    bounce: 0.55,
    spin: 0.5, // radians/sec
    airCurve: 0.5 // meters
  },
  legspin: {
    releaseY: [1.8, 2.0],
    releaseX: [-0.6, 0.6],
    bounceZ: [5.5, 7.5],
    bounce: 0.55,
    spin: -0.5, // radians/sec
    airCurve: -0.5 // meters
  }
};

const GRAVITY = -18;
let ball, isAnimating = false;

function createBall() {
  const objLoader = new OBJLoader();
  let fallback = false;
  ball = null;
  objLoader.load('cricket_ball.obj', (obj) => {
    ball = obj;
    ball.scale.set(0.09, 0.09, 0.09);
    resetBall();
  }, undefined, () => {
    fallback = true;
    const geometry = new THREE.SphereGeometry(BALL_RADIUS, 16, 16);
    const material = new THREE.MeshStandardMaterial({ color: 0xd32f2f });
    ball = new THREE.Mesh(geometry, material);
    resetBall();
  });
  if (!ball) {
    const geometry = new THREE.SphereGeometry(BALL_RADIUS, 16, 16);
    const material = new THREE.MeshStandardMaterial({ color: 0xd32f2f });
    ball = new THREE.Mesh(geometry, material);
    resetBall();
  }
  return ball;
}

function resetBall() {
  if (!ball) return;
  ball.position.set(0, 0.05, BALL_INIT_Z);
  isAnimating = false;
}

function launchBall(type = 'normal', speed = 16) {
  if (!ball || isAnimating) return;
  const cfg = BALL_TYPES[type] || BALL_TYPES.normal;
  // Release point
  const relX = randomBetween(cfg.releaseX[0], cfg.releaseX[1]);
  const relY = randomBetween(cfg.releaseY[0], cfg.releaseY[1]);
  const relZ = BALL_INIT_Z;
  // Wicket positions
  const batsmanZ = 11.06 - 0.7;
  const wicketX = 0;
  // Target y for wicket (bottom, middle, top)
  let targetY = 0.7; // default: middle
  if (type === 'yorker') targetY = 0.15;
  if (type === 'bouncer') targetY = 1.3;
  // Bounce point logic
  let bounceZ, bounceX, endZ, endX;
  if (type === 'yorker') {
    // Bounce just in front of wicket
    bounceZ = batsmanZ - 0.1;
    bounceX = relX;
    endZ = batsmanZ;
    endX = wicketX;
  } else if (type === 'bouncer') {
    // Bounce in middle of pitch
    bounceZ = (relZ + batsmanZ) / 2;
    bounceX = relX;
    endZ = batsmanZ;
    endX = wicketX;
  } else {
    // Random bounce on pitch, end at middle of wicket
    bounceZ = batsmanZ - randomBetween(cfg.bounceZ[0], cfg.bounceZ[1]);
    bounceX = relX + (cfg.airCurve || 0);
    endZ = batsmanZ;
    endX = wicketX;
  }
  // For spin balls, add sideways curve after bounce
  if (cfg.spin) {
    endX += cfg.spin * 1.2; // more turn for spin
  }
  // Stage 1: release -> bounce
  ball.position.set(relX, relY, relZ);
  isAnimating = true;
  let t = 0;
  const airTime = Math.abs(bounceZ - relZ) / speed * 1.2;
  const start = new THREE.Vector3(relX, relY, relZ);
  const bounce = new THREE.Vector3(bounceX, BOUNCE_Y, bounceZ);
  const spin = cfg.spin || 0;
  const airCurve = cfg.airCurve || 0;
  function animateToBounce() {
    if (!isAnimating) return;
    t += 1 / 60;
    const alpha = Math.min(t / airTime, 1);
    // Air curve for spin
    let curveX = relX + (airCurve * Math.sin(Math.PI * alpha));
    ball.position.lerpVectors(start, bounce, alpha);
    ball.position.x = curveX;
    if (alpha < 1) {
      requestAnimationFrame(animateToBounce);
    } else {
      animateAfterBounce();
    }
  }
  // Stage 2: bounce -> wicket
  function animateAfterBounce() {
    let t2 = 0;
    const afterTime = Math.abs(endZ - bounceZ) / speed * 1.1;
    const afterStart = bounce.clone();
    const afterEnd = new THREE.Vector3(endX, targetY, endZ);
    function anim2() {
      if (!isAnimating) return;
      t2 += 1 / 60;
      const alpha = Math.min(t2 / afterTime, 1);
      // Simulate bounce arc
      ball.position.lerpVectors(afterStart, afterEnd, alpha);
      // Add bounce height (parabola)
      ball.position.y += Math.sin(Math.PI * alpha) * cfg.bounce * 1.2;
      // Add spin (sideways) after bounce
      if (spin) ball.position.x += spin * (1 - Math.cos(Math.PI * alpha)) * 0.7;
      if (alpha < 1) {
        requestAnimationFrame(anim2);
      } else {
        isAnimating = false;
      }
    }
    anim2();
  }
  animateToBounce();
}

function updateBall(delta) {
  // No-op: handled by animation frames
}

export { createBall, updateBall, resetBall, launchBall, ball };

function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}