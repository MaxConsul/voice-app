const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Data structures
const servers = {};   // { serverId: { id, name, icon, ownerId, ownerName, members[], channels[] } }
const channels = {};  // { channelId: { users[], messages[] } }

// Helpers
const generateCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${rand(3)}-${rand(3)}`;
};

const getServerSummary = (srv) => ({
  id: srv.id,
  name: srv.name,
  icon: srv.icon,
  ownerId: srv.ownerId,
  ownerName: srv.ownerName,
  memberCount: srv.members.length,
  channels: srv.channels,
});

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // ── Create Server ─────────────────────────────────────────────
  socket.on('create-server', ({ name, icon, username }) => {
    const id = generateCode();
    const defaultChannels = [
      { id: generateCode(), name: 'General', type: 'voice' },
    ];

    servers[id] = {
      id, name, icon,
      ownerId: socket.id,
      ownerName: username,
      members: [{ id: socket.id, username, isAdmin: true }],
      channels: defaultChannels,
    };

    // Init channel data
    defaultChannels.forEach(ch => {
      channels[ch.id] = { users: [], messages: [] };
    });

    socket.join(`server:${id}`);
    socket.emit('server-created', getServerSummary(servers[id]));
    console.log(`${username} created server "${name}" (${id})`);
  });

  // ── Join Server ───────────────────────────────────────────────
  socket.on('join-server', ({ serverId, username }) => {
    const srv = servers[serverId];
    if (!srv) { socket.emit('server-error', 'Server not found. Check the invite code.'); return; }

    const alreadyMember = srv.members.find(m => m.id === socket.id);
    if (!alreadyMember) {
      srv.members.push({ id: socket.id, username, isAdmin: false });
    }

    socket.join(`server:${serverId}`);
    socket.emit('server-joined', getServerSummary(srv));
    socket.to(`server:${serverId}`).emit('member-joined', { id: socket.id, username });
    console.log(`${username} joined server "${srv.name}" (${serverId})`);
  });

  // ── Create Channel ────────────────────────────────────────────
  socket.on('create-channel', ({ serverId, name }) => {
    const srv = servers[serverId];
    if (!srv) return;

    const member = srv.members.find(m => m.id === socket.id);
    if (!member?.isAdmin) { socket.emit('server-error', 'Only admins can create channels.'); return; }

    const ch = { id: generateCode(), name, type: 'voice' };
    srv.channels.push(ch);
    channels[ch.id] = { users: [], messages: [] };

    io.to(`server:${serverId}`).emit('channel-created', ch);
    console.log(`Channel "${name}" created in server ${serverId}`);
  });

  // ── Delete Channel ────────────────────────────────────────────
  socket.on('delete-channel', ({ serverId, channelId }) => {
    const srv = servers[serverId];
    if (!srv) return;

    const member = srv.members.find(m => m.id === socket.id);
    if (!member?.isAdmin) { socket.emit('server-error', 'Only admins can delete channels.'); return; }
    if (srv.channels.length <= 1) { socket.emit('server-error', 'Server must have at least one channel.'); return; }

    srv.channels = srv.channels.filter(c => c.id !== channelId);
    delete channels[channelId];

    io.to(`server:${serverId}`).emit('channel-deleted', channelId);
  });

  // ── Join Channel (voice) ──────────────────────────────────────
  socket.on('join-channel', ({ channelId, serverId, username }) => {
    if (!channels[channelId]) return;

    // Check if already in this channel
    const alreadyInChannel = channels[channelId].users.find(u => u.id === socket.id);
    if (alreadyInChannel) {
      // Just resend existing users
      const existing = channels[channelId].users.filter(u => u.id !== socket.id);
      socket.emit('channel-existing-users', { users: existing, channelId });
      return;
    }

    // Leave previous channel
    const prevChannel = Object.entries(channels).find(([id, ch]) =>
      id !== channelId && ch.users.find(u => u.id === socket.id)
    );
    if (prevChannel) {
      const [prevId, prevCh] = prevChannel;
      prevCh.users = prevCh.users.filter(u => u.id !== socket.id);
      socket.leave(`channel:${prevId}`);
      socket.to(`channel:${prevId}`).emit('user-left', socket.id);
      socket.to(`channel:${prevId}`).emit('user-left-channel', { userId: socket.id, channelId: prevId });

      // Update server about old channel
      Object.entries(servers).forEach(([serverId, srv]) => {
        if (srv.channels.find(c => c.id === prevId)) {
          io.to(`server:${serverId}`).emit('channel-users-updated', {
            channelId: prevId,
            users: prevCh.users
          });
        }
      });
    }

    // Join new channel
    channels[channelId].users.push({ id: socket.id, username });
    socket.join(`channel:${channelId}`);

    // Tell others in channel
    socket.to(`channel:${channelId}`).emit('user-joined-channel', {
      id: socket.id, username, channelId
    });

    // Send existing users to new joiner
    const existing = channels[channelId].users.filter(u => u.id !== socket.id);
    socket.emit('channel-existing-users', { users: existing, channelId });

    // Update channel user counts
    io.to(`server:${serverId}`).emit('channel-users-updated', {
      channelId,
      users: channels[channelId].users,
    });

    console.log(`${username} joined channel ${channelId}`);
  });

  // ── Leave Channel ─────────────────────────────────────────────
  socket.on('leave-channel', ({ channelId, serverId }) => {
    if (!channels[channelId]) return;
    channels[channelId].users = channels[channelId].users.filter(u => u.id !== socket.id);
    socket.leave(`channel:${channelId}`);
    socket.to(`channel:${channelId}`).emit('user-left', socket.id);
    io.to(`server:${serverId}`).emit('channel-users-updated', {
      channelId,
      users: channels[channelId].users,
    });
  });

  // ── Chat Message ──────────────────────────────────────────────
  socket.on('chat-message', (channelId, message, username, type = 'text') => {
    io.to(`channel:${channelId}`).emit('chat-message', {
      username, message, type,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  socket.on('chat-image', (channelId, imageData, username) => {
    io.to(`channel:${channelId}`).emit('chat-message', {
      username, message: imageData, type: 'image',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // ── User Status ───────────────────────────────────────────────
  socket.on('user-status', (channelId, status) => {
    socket.to(`channel:${channelId}`).emit('user-status', { id: socket.id, ...status });
  });

  // ── Soundboard ────────────────────────────────────────────────
  socket.on('play-sound', (channelId, soundData, soundName) => {
    socket.to(`channel:${channelId}`).emit('play-sound', { soundData, soundName });
  });

  // ── WebRTC passthrough ────────────────────────────────────────
  socket.on('offer', (data) => socket.to(data.target).emit('offer', { ...data, from: socket.id }));
  socket.on('answer', (data) => socket.to(data.target).emit('answer', { ...data, from: socket.id }));
  socket.on('ice-candidate', (data) => socket.to(data.target).emit('ice-candidate', { ...data, from: socket.id }));

  // ── Disconnect ────────────────────────────────────────────────
  socket.on('disconnect', () => {
    // Remove from all channels
    Object.entries(channels).forEach(([channelId, ch]) => {
      if (ch.users.find(u => u.id === socket.id)) {
        ch.users = ch.users.filter(u => u.id !== socket.id);
        socket.to(`channel:${channelId}`).emit('user-left', socket.id);
        // Update server members of channel change
        Object.entries(servers).forEach(([serverId, srv]) => {
          if (srv.channels.find(c => c.id === channelId)) {
            io.to(`server:${serverId}`).emit('channel-users-updated', {
              channelId, users: ch.users
            });
          }
        });
      }
    });

    // Remove from servers
    Object.values(servers).forEach(srv => {
      srv.members = srv.members.filter(m => m.id !== socket.id);
      if (srv.members.length === 0) {
        // Clean up empty server
        srv.channels.forEach(ch => delete channels[ch.id]);
        delete servers[srv.id];
        console.log(`Server ${srv.id} deleted (empty)`);
      } else if (srv.ownerId === socket.id) {
        // Transfer ownership
        srv.ownerId = srv.members[0].id;
        srv.members[0].isAdmin = true;
        io.to(srv.members[0].id).emit('you-are-admin', srv.id);
        io.to(`server:${srv.id}`).emit('owner-changed', srv.members[0].id);
      }
    });

    console.log('Disconnected:', socket.id);
  });
});

server.listen(5000, () => console.log('Server running on port 5000'));