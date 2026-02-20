#!/usr/bin/env node

const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

console.log('🏏 Cricket Game - Optimized for Low Latency');
console.log('===========================================');

// Check if WebSocket server is running
function checkWebSocketServer() {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:8081');
    ws.onopen = () => {
      ws.close();
      resolve(true);
    };
    ws.onerror = () => {
      resolve(false);
    };
    setTimeout(() => resolve(false), 1000);
  });
}

// Start WebSocket server if not running
async function startWebSocketServer() {
  const isRunning = await checkWebSocketServer();
  
  if (!isRunning) {
    console.log('🚀 Starting optimized WebSocket server...');
    const wsServer = spawn('node', ['ws-server.cjs'], {
      stdio: 'inherit',
      detached: true
    });
    
    // Wait a moment for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('✅ WebSocket server started on ws://localhost:8081');
  } else {
    console.log('✅ WebSocket server already running');
  }
}

// Start HTTP server
function startHttpServer() {
  console.log('🌐 Starting HTTP server...');
  
  const server = http.createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Cricket Game - Optimized</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .container { max-width: 800px; margin: 0 auto; }
            .status { padding: 15px; border-radius: 8px; margin: 10px 0; }
            .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
            .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
            .warning { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
            .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
            .step { margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 5px; }
            code { background: #e9ecef; padding: 2px 4px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🏏 Cricket Game - Optimized Setup</h1>
            
            <div class="status success">
              <h3>✅ Server Status</h3>
              <p>WebSocket server: <code>ws://localhost:8081</code></p>
              <p>HTTP server: <code>http://localhost:8000</code></p>
            </div>
            
            <div class="step">
              <h3>📱 Step 1: Phone Setup</h3>
              <p>1. Open <code>http://YOUR_LAPTOP_IP:8000/public/phone-controller.html</code> on your phone</p>
              <p>2. Replace <code>YOUR_LAPTOP_IP</code> with your laptop's IP address</p>
              <p>3. Click "Connect" and ensure sensors are enabled</p>
            </div>
            
            <div class="step">
              <h3>💻 Step 2: Game Setup</h3>
              <p>1. Open <code>http://localhost:8000</code> on your laptop</p>
              <p>2. Press 'B' to launch a ball</p>
              <p>3. Use your phone to control the bat</p>
            </div>
            
            <div class="status info">
              <h3>⚡ Performance Optimizations</h3>
              <ul>
                <li>60Hz update rate (adaptive based on connection quality)</li>
                <li>TCP_NODELAY for minimal latency</li>
                <li>Quaternion caching for faster calculations</li>
                <li>Message compression and optimization</li>
                <li>Auto-reconnection with exponential backoff</li>
              </ul>
            </div>
            
            <div class="status warning">
              <h3>🔧 Troubleshooting</h3>
              <p><strong>High latency?</strong> Check your WiFi connection and ensure phone and laptop are on the same network.</p>
              <p><strong>Connection issues?</strong> Try restarting the WebSocket server: <code>node ws-server.cjs</code></p>
              <p><strong>Bat not responding?</strong> Check the debug overlay in the top-left corner of the game.</p>
            </div>
            
            <div class="status error">
              <h3>📊 Latency Targets</h3>
              <p>Excellent: &lt; 50ms (120Hz updates)</p>
              <p>Good: 50-100ms (60Hz updates)</p>
              <p>Fair: 100-200ms (30Hz updates)</p>
              <p>Poor: &gt; 200ms (20Hz updates)</p>
            </div>
          </div>
        </body>
        </html>
      `);
    } else {
      // Serve static files
      const fs = require('fs');
      const path = require('path');
      
      let filePath = req.url === '/' ? '/index.html' : req.url;
      filePath = path.join(__dirname, filePath);
      
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('File not found');
          return;
        }
        
        const ext = path.extname(filePath);
        const mimeTypes = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.wav': 'audio/wav',
          '.mp4': 'video/mp4',
          '.woff': 'application/font-woff',
          '.ttf': 'application/font-ttf',
          '.eot': 'application/vnd.ms-fontobject',
          '.otf': 'application/font-otf',
          '.wasm': 'application/wasm'
        };
        
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    }
  });
  
  server.listen(8000, () => {
    console.log('✅ HTTP server started on http://localhost:8000');
    console.log('📱 Phone controller: http://localhost:8000/public/phone-controller.html');
  });
}

// Main startup function
async function main() {
  try {
    await startWebSocketServer();
    startHttpServer();
    
    console.log('\n🎯 Optimization Tips:');
    console.log('• Use 5GHz WiFi if available');
    console.log('• Keep phone and laptop close to router');
    console.log('• Close unnecessary browser tabs/apps');
    console.log('• Use phone in landscape mode for better control');
    console.log('\n🚀 Ready to play! Press Ctrl+C to stop servers.');
    
  } catch (error) {
    console.error('❌ Startup error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down servers...');
  process.exit(0);
});

main(); 