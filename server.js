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

// Store rooms and their users
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`User ${socket.id} connected`);

  socket.on('join-room', (roomName) => {
    // Leave previous rooms
    socket.rooms.forEach(room => {
      if (room !== socket.id) {
        socket.leave(room);
        const roomUsers = rooms.get(room) || [];
        const updated = roomUsers.filter(id => id !== socket.id);
        if (updated.length > 0) {
          rooms.set(room, updated);
        } else {
          rooms.delete(room);
        }
      }
    });

    // Join new room
    socket.join(roomName);
    if (!rooms.has(roomName)) {
      rooms.set(roomName, []);
    }
    const roomUsers = rooms.get(roomName);
    if (!roomUsers.includes(socket.id)) {
      roomUsers.push(socket.id);
      rooms.set(roomName, roomUsers);
    }

    // Send list of users in room to everyone
    io.to(roomName).emit('room-users', roomUsers);
    console.log(`Room ${roomName} has ${roomUsers.length} users`);
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

  // Handle chat messages
  socket.on('chat-message', ({ text, room }) => {
    io.to(room).emit('chat-message', { 
      from: socket.id, 
      text, 
      timestamp: Date.now() 
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User ${socket.id} disconnected`);
    // Remove from all rooms
    for (let [room, users] of rooms) {
      if (users.includes(socket.id)) {
        const updated = users.filter(id => id !== socket.id);
        if (updated.length > 0) {
          rooms.set(room, updated);
          io.to(room).emit('user-left', socket.id);
          io.to(room).emit('room-users', updated);
        } else {
          rooms.delete(room);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Open this URL in multiple browsers to test`);
});