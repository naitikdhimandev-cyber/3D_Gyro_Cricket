# 3D Cricket Game 🏏

An immersive 3D cricket batting simulator built with Three.js, featuring realistic physics, multiple camera views, and real-time sensor integration for authentic gameplay.
Here - For a realistic Game a mobile Device can be connected using websocket and the the Game bat will be Clibrated according to the Device in Real Providing Real Cricket Experence.

## 🎮 How It Works

This is a single-player cricket game where you bat against AI bowlers in a fully 3D environment. The game simulates realistic cricket physics including ball trajectory, bounce, spin, and bat-ball collision. You control a batsman who swings at incoming deliveries, aiming to score runs by hitting boundaries or taking singles.

### Core Features:
- **Realistic Physics**: Air drag, ground friction, gravity, and spin effects
- **Multiple Ball Types**: Normal, fast, bouncer, yorker, off-spin, leg-spin, and wicket balls
- **Dynamic Camera System**: Field view, first-person view (FPV), and ball-following camera
- **Scoring System**: Track runs, balls, and wickets
- **Visual Effects**: Ball trail, wicket flash, boundary celebrations, stadium lighting
- **Sensor Integration**: Control bat angle using phone gyroscope or ESP32 sensor

## 🛠 Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6 Modules)
- **3D Graphics**: Three.js with WebGL renderer
- **Physics Engine**: Custom physics simulation (gravity, drag, friction)
- **Networking**: WebSockets for real-time sensor data
- **Build Tool**: Vite for development and bundling
- **Server**: Node.js WebSocket server for low-latency communication
- **Models**: 3D models in GLTF (.glb) and OBJ formats
- **Audio**: Web Audio API for sound effects

## 🎯 How to Play

1. **Setup**: Install dependencies and start the development server
2. **Launch Ball**: Select ball type (normal/fast/bouncer/yorker/spin/out) and speed
3. **Batting**: Use keyboard (A/D for angle, W/S for swing) or phone sensors to control bat
4. **Scoring**:
   - Hit the ball to boundary ropes (4 runs) or over (6 runs)
   - Avoid getting bowled or caught
   - Game continues until you get out

### Controls:
- **Desktop**: A/D keys to rotate bat, W/S to swing
- **Mobile**: Use phone as bat controller via WebSocket
- **Camera**: Mouse to orbit, scroll to zoom

### Ball Types:
- **Normal**: Standard delivery
- **Fast**: High-speed ball
- **Bouncer**: Bounces high off pitch
- **Yorker**: Low bounce delivery
- **Spin**: Curving ball with rotation
- **Out**: Straight to wicket (practice mode)

## 🚀 Getting Started

### Prerequisites
- Node.js (v16+)
- Modern web browser with WebGL support

### Installation
```bash
npm install
```

### Running the Game
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

### Mobile Control Setup
1. Start WebSocket server:
```bash
node ws-server.cjs
```
2. Open `public/phone-controller.html` on your phone
3. Enter the laptop's IP address and connect
4. Enable device orientation sensors
5. Calibrate bat position

## 🌟 Best Parts

### Immersive 3D Experience
- Detailed cricket ground with realistic textures
- Professional batsman model with bat swinging animation
- Stadium atmosphere with light towers and crowd areas

### Advanced Physics
- Accurate ball trajectory with air resistance and spin
- Realistic bat-ball collision with velocity reflection
- Ground interaction with bounce and roll physics

### Real-Time Sensor Integration
- Phone gyroscope control for natural bat movement
- Low-latency WebSocket communication (<50ms target)
- ESP32 microcontroller support for physical bat sensors

### Performance Optimizations
- Optimized WebSocket server with TCP_NODELAY
- Adaptive update rates based on connection quality
- Efficient 3D rendering with instanced geometry

### Unique Features
- **Ball Trail Effect**: Pink particle trail shows ball path
- **Vibration Feedback**: Phone vibrates based on shot power
- **Boundary Detection**: Automatic 4/6 scoring with celebrations
- **Day/Night Modes**: Stadium lights for evening matches
- **Multiple Camera Angles**: Switch between field, FPV, and ball views

## 📁 Project Structure

```
cricket/
├── index.html          # Main HTML page
├── main.js            # Game logic and physics
├── sceneSetup.js      # 3D scene, camera, lighting
├── player.js          # Batsman model and animation
├── ball.js            # Ball physics (integrated)
├── sensors.js         # Sensor input handling
├── style.css          # UI styling
├── package.json       # Dependencies
├── ws-server.cjs      # WebSocket server
├── start-optimized.js # Optimized startup script
├── public/
│   ├── bat.obj        # Bat 3D model
│   └── phone-controller.html # Mobile control interface
├── auid/              # Audio files directory
├── ground.jpg         # Ground texture
├── pitch.jpg          # Pitch texture
├── helmet_mask.png    # UI assets
└── LATENCY_OPTIMIZATION.md # Performance guide
```

## 🔧 Future Enhancements

- Multiplayer bowling
- Tournament modes
- Advanced AI bowlers
- More stadium environments
- VR support

## 📝 Notes

- Place 3D models (`bat.obj`, `cricket_ball.obj`, `batsman.glb`) in `public/` directory
- For best performance, use Chrome or Firefox
- WebSocket server runs on port 8081
- Supports both desktop and mobile controls

---

**Enjoy batting in this realistic 3D cricket experience!** 🎉

- For a realistic Game a mobile Device can be connected using websocket and the the Game bat will be Clibrated according to the Device in Real Providing Real Cricket Experence.
![Game Screenshot](game_screenshot.png)
![Mobile Controller](phone_controller.png)
