const WebSocket = require('ws');
const wss = new WebSocket.Server({ 
  port: 8081,
  // Optimize for low latency
  perMessageDeflate: false, // Disable compression for speed
  maxPayload: 1024 // Limit payload size
});

let lastData = null;
let connectionCount = 0;

// Optimize message handling
wss.on('connection', function connection(ws, req) {
  const clientAddress = req.socket.remoteAddress;
  const clientId = ++connectionCount;
  console.log(`Device connected: ${clientAddress} (ID: ${clientId})`);
  
  // Set TCP_NODELAY for lower latency
  ws._socket.setNoDelay(true);
  
  // Optimize for binary messages
  ws.binaryType = 'arraybuffer';
  
  ws.on('message', function incoming(message) {
    try {
      // Handle both string and binary messages
      let data;
      if (typeof message === 'string') {
        data = message;
      } else {
        // Convert ArrayBuffer to string
        data = Buffer.from(message).toString('utf8');
      }
      
      // Handle ping/pong for latency testing
      try {
        const parsedData = JSON.parse(data);
        if (parsedData.type === 'ping') {
          // Send pong response immediately
          const pongResponse = JSON.stringify({
            type: 'pong',
            timestamp: parsedData.timestamp
          });
          ws.send(pongResponse);
          return; // Don't broadcast ping messages
        }
      } catch (e) {
        // Not JSON, continue with normal processing
      }
      
      lastData = data;
      
      // Broadcast to all clients with minimal processing
      wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN && client !== ws) {
          client.send(data);
        }
      });
    } catch (error) {
      console.error('Message processing error:', error);
    }
  });
  
  ws.on('close', function() {
    console.log(`Device disconnected: ${clientAddress} (ID: ${clientId})`);
  });
  
  ws.on('error', function(error) {
    console.error(`WebSocket error for client ${clientId}:`, error);
  });
  
  // Send last data to new clients
  if (lastData) {
    ws.send(lastData);
  }
});

// Optimize server performance
wss.on('error', function(error) {
  console.error('WebSocket server error:', error);
});

console.log('Optimized WebSocket server running on ws://localhost:8081');
console.log('Features: TCP_NODELAY, binary support, minimal processing');