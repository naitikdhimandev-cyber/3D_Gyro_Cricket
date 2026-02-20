// sensors.js
// Placeholder for ESP32 bat sensor input (WebSocket)
// Simulate bat angle/velocity with keyboard for now

let batAngle = -60; // degrees, idle
let batVelocity = 0; // deg/sec

// Simulate input with keys
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyA') batAngle -= 2;
  if (e.code === 'KeyD') batAngle += 2;
  if (e.code === 'KeyW') batVelocity += 10;
  if (e.code === 'KeyS') batVelocity -= 10;
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW' || e.code === 'KeyS') batVelocity = 0;
});

// Placeholder for WebSocket (future)
function setupSensorWebSocket() {
  // const ws = new WebSocket('ws://esp32-address:port');
  // ws.onmessage = (msg) => { ... };
}

function getBatSensorData() {
  return { angle: batAngle, velocity: batVelocity };
}

export { setupSensorWebSocket, getBatSensorData }; 