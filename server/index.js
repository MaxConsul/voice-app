const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors({ origin: "*" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('check-room', (roomId) => {
    const room = rooms[roomId];
    const hasOwner = room && room.length > 0;
    socket.emit('room-status', { hasOwner });
  });

  socket.on('join-room', (roomId, username) => {
    socket.join(roomId);
    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push({ id: socket.id, username, isOwner: rooms[roomId].length === 0 });

    socket.to(roomId).emit('user-joined', { id: socket.id, username });
    socket.emit('existing-users', rooms[roomId].filter(u => u.id !== socket.id));
    socket.emit('joined-success', { isOwner: rooms[roomId].find(u => u.id === socket.id)?.isOwner });
    console.log(`${username} joined room ${roomId}`);
  });

  socket.on('request-join', (roomId, username) => {
    const room = rooms[roomId];
    if (!room || room.length === 0) {
      socket.emit('join-approved');
      return;
    }
    const owner = room.find(u => u.isOwner);
    if (owner) {
      io.to(owner.id).emit('join-request', { id: socket.id, username });
    }
  });

  socket.on('approve-join', (roomId, guestId, guestUsername) => {
    io.to(guestId).emit('join-approved');
  });

  socket.on('reject-join', (roomId, guestId) => {
    io.to(guestId).emit('join-rejected');
  });

  socket.on('chat-message', (roomId, message, username, type = 'text') => {
    io.to(roomId).emit('chat-message', {
      username, message, type,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  socket.on('chat-image', (roomId, imageData, username) => {
    io.to(roomId).emit('chat-message', {
      username,
      message: imageData,
      type: 'image',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  socket.on('chat-message', (roomId, message, username, type = 'text') => {
    io.to(roomId).emit('chat-message', {
      username, message, type,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const user = rooms[roomId].find(u => u.id === socket.id);
      if (user) {
        if (user.isOwner && rooms[roomId].length > 1) {
          rooms[roomId] = rooms[roomId].filter(u => u.id !== socket.id);
          rooms[roomId][0].isOwner = true;
          io.to(rooms[roomId][0].id).emit('you-are-owner');
        } else {
          rooms[roomId] = rooms[roomId].filter(u => u.id !== socket.id);
        }
        io.to(roomId).emit('user-left', socket.id);
      }
    }
    console.log('User disconnected:', socket.id);
  });

  socket.on('offer', (data) => socket.to(data.target).emit('offer', { ...data, from: socket.id }));
  socket.on('answer', (data) => socket.to(data.target).emit('answer', { ...data, from: socket.id }));
  socket.on('ice-candidate', (data) => socket.to(data.target).emit('ice-candidate', { ...data, from: socket.id }));

  // User status (mute/deafen)
  socket.on('user-status', (roomId, status) => {
    socket.to(roomId).emit('user-status', { id: socket.id, ...status });
  });

  // Soundboard
  socket.on('play-sound', (roomId, soundData, soundName) => {
    socket.to(roomId).emit('play-sound', { soundData, soundName });
  });

});

server.listen(5000, () => console.log('Server running on port 5000'));