const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors({ origin: "*" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (roomId, username) => {
    socket.join(roomId);

    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push({ id: socket.id, username });

    // Tell everyone else in the room a new user joined
    socket.to(roomId).emit('user-joined', { id: socket.id, username });

    // Send the new user the list of existing users
    socket.emit('existing-users', rooms[roomId].filter(u => u.id !== socket.id));

    console.log(`${username} joined room ${roomId}`);
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter(u => u.id !== socket.id);
      io.to(roomId).emit('user-left', socket.id);
    }
    console.log('User disconnected:', socket.id);
  });

  // WebRTC signaling passthrough
  socket.on('offer', (data) => socket.to(data.target).emit('offer', { ...data, from: socket.id }));
  socket.on('answer', (data) => socket.to(data.target).emit('answer', { ...data, from: socket.id }));
  socket.on('ice-candidate', (data) => socket.to(data.target).emit('ice-candidate', { ...data, from: socket.id }));
});

server.listen(5000, () => console.log('Server running on port 5000'));