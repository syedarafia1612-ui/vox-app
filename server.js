const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve the HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Use Socket.IO room membership for accurate active user tracking
io.on('connection', (socket) => {
  console.log(`User ${socket.id} connected`);

  socket.on('join-room', async (roomName) => {
    // Leave any other non-socket-id rooms
    socket.rooms.forEach(r => {
      if (r !== socket.id && r !== roomName) {
        socket.leave(r);
      }
    });

    // Join the requested room
    socket.join(roomName);

    // Emit the current active members using Socket.IO adapter
    try {
      const sids = await io.in(roomName).allSockets();
      const roomUsers = Array.from(sids);
      io.to(roomName).emit('room-users', roomUsers);
      console.log(`Room ${roomName} has ${roomUsers.length} users`);
    } catch (err) {
      console.warn('Failed to list room members', err);
    }
  });

  // Handle WebRTC signaling
  socket.on('offer', ({ target, sdp }) => {
    io.to(target).emit('offer', { from: socket.id, sdp });
  });

  socket.on('answer', ({ target, sdp }) => {
    io.to(target).emit('answer', { from: socket.id, sdp });
  });

  socket.on('ice-candidate', ({ target, candidate }) => {
    io.to(target).emit('ice-candidate', { from: socket.id, candidate });
  });

  // Handle chat messages: emit to everyone in the room (clients will render on receive)
  socket.on('chat-message', (payload = {}) => {
    const { room, text, type, audioDataUrl, ...rest } = payload;
    io.to(room).emit('chat-message', {
      from: socket.id,
      text,
      type,
      audioDataUrl,
      timestamp: Date.now(),
      ...rest
    });
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log(`User ${socket.id} disconnected`);
    try {
      const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
      for (const room of rooms) {
        const sids = await io.in(room).allSockets();
        const roomUsers = Array.from(sids);
        io.to(room).emit('room-users', roomUsers);
        io.to(room).emit('user-left', socket.id);
      }
    } catch (err) {
      console.warn('Error while handling disconnect cleanup', err);
    }
  });
});

const PORT = parseInt(process.env.PORT, 10) || 3000;
// Give Render servers extra time for username validation
const TIMEOUT = 60000; 
// Start server with simple retry if the port is already in use.
function startServer(port, attempts = 0) {
  // remove previous error listeners to avoid duplicate handling
  server.removeAllListeners('error');

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      if (attempts < 5) {
        const nextPort = port + 1;
        console.warn(`Port ${port} is in use, trying ${nextPort}...`);
        setTimeout(() => startServer(nextPort, attempts + 1), 200);
      } else {
        console.error(`Port ${port} is in use and no fallback ports available. Exiting.`);
        process.exit(1);
      }
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });

  server.listen(port, '0.0.0.0', () => {
    app.set('trust proxy', 1);
    console.log(`🚀 Server running on http://localhost:${port}`);
    console.log(`📡 Open this URL in multiple browsers to test`);
  });
}

startServer(PORT);