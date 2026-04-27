const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const path = require('path');
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
const servers = {};
const channels = {};
const audexQueues = {};
const audexActive = {};

// Audex config
const COOKIES_PATH = path.join(__dirname, 'cookies.txt');
const YTDLP_PATH = process.platform === 'win32'
  ? path.join(__dirname, 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp.exe')
  : '/usr/local/bin/yt-dlp';

let yts = null;
try {
  yts = require('yt-search');
  console.log('✅ Audex music bot ready');
} catch (e) {
  console.log('⚠️ Audex unavailable:', e.message);
}

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
  photo: srv.photo || null,
  ownerId: srv.ownerId,
  ownerName: srv.ownerName,
  memberCount: srv.members.length,
  channels: srv.channels,
});

const getAudexState = (channelId) => {
  if (!audexQueues[channelId]) {
    audexQueues[channelId] = { queue: [], playing: false, current: null, timer: null };
  }
  return audexQueues[channelId];
};

const audexMessage = (channelId, message) => {
  io.to(`channel:${channelId}`).emit('chat-message', {
    username: '🤖 Audex',
    message,
    type: 'text',
    isBot: true,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });
};

const playNext = async (channelId) => {
  const state = getAudexState(channelId);
  if (state.queue.length === 0) {
    state.playing = false;
    state.current = null;
    audexMessage(channelId, '✅ Queue finished! Use !play <song> to add more.');
    io.to(`channel:${channelId}`).emit('audex-stopped');
    return;
  }

  const next = state.queue.shift();
  state.current = next;
  state.playing = true;

  try {
    audexMessage(channelId, `▶ Now playing: ${next.title} [${next.duration}]\nAdded by: ${next.addedBy}`);

    console.log('Using yt-dlp at:', YTDLP_PATH);
    console.log('Cookies at:', COOKIES_PATH);
    console.log('URL:', next.url);

    const { stdout } = await execFileAsync(YTDLP_PATH, [
      next.url,
      '--dump-single-json',
      '--no-warnings',
      '--no-check-certificate',
      '--cookies', COOKIES_PATH,
      '--js-runtimes', 'node',
    ], { maxBuffer: 10 * 1024 * 1024 });

    const info = JSON.parse(stdout);
    console.log('Got info, duration:', info.duration, 'formats:', info.formats.length);

    // Try audio-only first, then fall back to any format with audio
    let audioFormat = info.formats
      .filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none') && f.url)
      .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

    // Fallback: any format with audio and a URL
    if (!audioFormat) {
      audioFormat = info.formats
        .filter(f => f.acodec && f.acodec !== 'none' && f.url)
        .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
    }

    // Last resort: just get any format with a URL
    if (!audioFormat) {
      audioFormat = info.formats.find(f => f.url);
    }

    if (!audioFormat) {
      audexMessage(channelId, '❌ Could not get audio for this track. Skipping...');
      playNext(channelId);
      return;
    }

    console.log('Audio format found:', audioFormat.ext, audioFormat.abr);

    const durationSecs = parseInt(info.duration) || 0;
    const proxyUrl = `/audex-proxy?url=${encodeURIComponent(audioFormat.url)}`;

    io.to(`channel:${channelId}`).emit('audex-stream-url', {
      streamUrl: proxyUrl,
      title: next.title,
      duration: durationSecs,
      addedBy: next.addedBy,
    });

    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      playNext(channelId);
    }, (durationSecs + 2) * 1000);

  } catch (e) {
    console.error('Audex playNext error:', e.message);
    audexMessage(channelId, '❌ Error playing track. Skipping...');
  }
};

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // ── Create Server ─────────────────────────────────────────────
  socket.on('create-server', ({ name, icon, photo, username }) => {
    const id = generateCode();
    const defaultChannels = [
      { id: generateCode(), name: 'General', type: 'voice' },
    ];
    servers[id] = {
      id, name, icon,
      photo: photo || null,
      ownerId: socket.id,
      ownerName: username,
      members: [{ id: socket.id, username, isAdmin: true }],
      channels: defaultChannels,
    };
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

  // ── Join Channel ──────────────────────────────────────────────
  socket.on('join-channel', ({ channelId, serverId, username }) => {
    if (!channels[channelId]) return;
    const alreadyInChannel = channels[channelId].users.find(u => u.id === socket.id);
    if (alreadyInChannel) {
      const existing = channels[channelId].users.filter(u => u.id !== socket.id);
      socket.emit('channel-existing-users', { users: existing, channelId });
      return;
    }
    const prevChannel = Object.entries(channels).find(([id, ch]) =>
      id !== channelId && ch.users.find(u => u.id === socket.id)
    );
    if (prevChannel) {
      const [prevId, prevCh] = prevChannel;
      prevCh.users = prevCh.users.filter(u => u.id !== socket.id);
      socket.leave(`channel:${prevId}`);
      socket.to(`channel:${prevId}`).emit('user-left', socket.id);
      socket.to(`channel:${prevId}`).emit('user-left-channel', { userId: socket.id, channelId: prevId });
      Object.entries(servers).forEach(([sId, srv]) => {
        if (srv.channels.find(c => c.id === prevId)) {
          io.to(`server:${sId}`).emit('channel-users-updated', { channelId: prevId, users: prevCh.users });
        }
      });
    }
    channels[channelId].users.push({ id: socket.id, username });
    socket.join(`channel:${channelId}`);
    socket.to(`channel:${channelId}`).emit('user-joined-channel', { id: socket.id, username, channelId });
    const existing = channels[channelId].users.filter(u => u.id !== socket.id);
    socket.emit('channel-existing-users', { users: existing, channelId });
    io.to(`server:${serverId}`).emit('channel-users-updated', {
      channelId, users: channels[channelId].users,
    });
    if (audexActive[channelId]) {
      socket.emit('audex-invited');
      const state = getAudexState(channelId);
      socket.emit('audex-state', {
        active: true,
        current: state.current,
        queue: state.queue,
        playing: state.playing,
      });
    }
    console.log(`${username} joined channel ${channelId}`);
  });

  // ── Leave Channel ─────────────────────────────────────────────
  socket.on('leave-channel', ({ channelId, serverId }) => {
    if (!channels[channelId]) return;
    channels[channelId].users = channels[channelId].users.filter(u => u.id !== socket.id);
    socket.leave(`channel:${channelId}`);
    socket.to(`channel:${channelId}`).emit('user-left', socket.id);
    io.to(`server:${serverId}`).emit('channel-users-updated', {
      channelId, users: channels[channelId].users,
    });
  });

  // ── Chat Message ──────────────────────────────────────────────
  socket.on('chat-message', (channelId, message, username, type = 'text') => {
    io.to(`channel:${channelId}`).emit('chat-message', {
      username, message, type,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    if (message.toLowerCase().trim() === '!invite audex') {
      if (!audexActive[channelId]) {
        audexActive[channelId] = true;
        if (!audexQueues[channelId]) {
          audexQueues[channelId] = { queue: [], playing: false, current: null, timer: null };
        }
        io.to(`channel:${channelId}`).emit('audex-invited');
        setTimeout(() => {
          audexMessage(channelId, '👋 Hey! I\'m Audex, your music bot!\nType !help to see what I can do 🎵');
        }, 3500);
      }
    }
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

  // ── Audex: Invite ─────────────────────────────────────────────
  socket.on('audex-invite', ({ channelId }) => {
    audexActive[channelId] = true;
    if (!audexQueues[channelId]) {
      audexQueues[channelId] = { queue: [], playing: false, current: null, timer: null };
    }
    io.to(`channel:${channelId}`).emit('audex-invited');
    audexMessage(channelId, '👋 Hey! I\'m Audex, your music bot!\nType !help to see what I can do 🎵');
  });

  // ── Audex: Command ────────────────────────────────────────────
  socket.on('audex-command', async ({ command, args, channelId, username }) => {
    if (!audexActive[channelId]) return;
    const state = getAudexState(channelId);
    const cmd = command.toLowerCase();

    if (cmd === 'invite' && args?.toLowerCase() === 'audex') {
      if (audexActive[channelId]) {
        audexMessage(channelId, '🤖 Audex is already active in this channel!');
        return;
      }
      audexActive[channelId] = true;
      if (!audexQueues[channelId]) {
        audexQueues[channelId] = { queue: [], playing: false, current: null, timer: null };
      }
      io.to(`channel:${channelId}`).emit('audex-invited');
      setTimeout(() => {
        audexMessage(channelId, '👋 Hey! I\'m Audex, your music bot!\nType !help to see what I can do 🎵');
      }, 3000);
      return;
    }

    if (cmd === 'help') {
      audexMessage(channelId,
        '🎵 Audex Commands:\n' +
        '!play <song> — Play a song\n' +
        '!skip — Skip current song\n' +
        '!stop — Stop and clear queue\n' +
        '!queue — Show song queue\n' +
        '!np — Show now playing\n' +
        '!help — Show this message'
      );
      return;
    }

    if (cmd === 'np') {
      if (!state.current) {
        audexMessage(channelId, '❌ Nothing is playing right now. Use !play <song> to start!');
      } else {
        audexMessage(channelId, `▶ Now playing: ${state.current.title}\nAdded by: ${state.current.addedBy}`);
      }
      return;
    }

    if (cmd === 'queue') {
      if (state.queue.length === 0 && !state.current) {
        audexMessage(channelId, '📭 Queue is empty. Use !play <song> to add songs!');
      } else {
        let msg = state.current ? `▶ Now playing: ${state.current.title}\n\n` : '';
        if (state.queue.length > 0) {
          msg += '📋 Up next:\n';
          state.queue.slice(0, 10).forEach((s, i) => {
            msg += `${i + 1}. ${s.title} — ${s.addedBy}\n`;
          });
          if (state.queue.length > 10) msg += `...and ${state.queue.length - 10} more`;
        } else {
          msg += '📭 No songs in queue.';
        }
        audexMessage(channelId, msg);
      }
      return;
    }

    if (cmd === 'skip') {
      if (!state.current) {
        audexMessage(channelId, '❌ Nothing to skip!');
        return;
      }
      if (state.timer) clearTimeout(state.timer);
      audexMessage(channelId, `⏭ Skipped: ${state.current.title}`);
      io.to(`channel:${channelId}`).emit('audex-stopped');
      playNext(channelId);
      return;
    }

    if (cmd === 'stop') {
      if (state.timer) clearTimeout(state.timer);
      state.queue = [];
      state.current = null;
      state.playing = false;
      audexMessage(channelId, '⏹ Stopped music and cleared the queue.');
      io.to(`channel:${channelId}`).emit('audex-stopped');
      return;
    }

    if (cmd === 'play') {
      if (!args || !args.trim()) {
        audexMessage(channelId, '❌ Please provide a song name! Example: !play lofi beats');
        return;
      }
      if (!yts) {
        audexMessage(channelId, '⚠️ Audex music is not available on this server yet.');
        return;
      }
      audexMessage(channelId, `🔍 Searching for "${args}"...`);
      try {
        const results = await yts(args);
        if (!results.videos.length) {
          audexMessage(channelId, '❌ No results found. Try a different search!');
          return;
        }
        const top = results.videos[0];
        const song = {
          title: top.title,
          url: top.url,
          duration: top.timestamp,
          thumbnail: top.thumbnail,
          addedBy: username,
        };
        state.queue.push(song);
        audexMessage(channelId, `✅ Added to queue: ${top.title} [${top.timestamp}]`);
        if (!state.playing) {
          playNext(channelId);
        }
      } catch (e) {
        audexMessage(channelId, '❌ Search failed. Please try again.');
      }
      return;
    }

    audexMessage(channelId, `❓ Unknown command: !${cmd}. Type !help for commands.`);
  });

  // ── Audex: Get State ──────────────────────────────────────────
  socket.on('audex-get-state', ({ channelId }) => {
    const state = getAudexState(channelId);
    socket.emit('audex-state', {
      active: audexActive[channelId] || false,
      current: state.current,
      queue: state.queue,
      playing: state.playing,
    });
  });

  // ── Audex: Stop from panel ────────────────────────────────────
  socket.on('audex-stop', ({ channelId }) => {
    const state = getAudexState(channelId);
    if (state.timer) clearTimeout(state.timer);
    state.queue = [];
    state.current = null;
    state.playing = false;
    audexMessage(channelId, '⏹ Stopped by user.');
    io.to(`channel:${channelId}`).emit('audex-stopped');
  });

  // ── Audex: Skip from panel ────────────────────────────────────
  socket.on('audex-skip', ({ channelId, username }) => {
    const state = getAudexState(channelId);
    if (!state.current) return;
    if (state.timer) clearTimeout(state.timer);
    audexMessage(channelId, `⏭ ${username} skipped: ${state.current.title}`);
    io.to(`channel:${channelId}`).emit('audex-stopped');
    playNext(channelId);
  });

  // ── WebRTC passthrough ────────────────────────────────────────
  socket.on('offer', (data) => socket.to(data.target).emit('offer', { ...data, from: socket.id }));
  socket.on('answer', (data) => socket.to(data.target).emit('answer', { ...data, from: socket.id }));
  socket.on('ice-candidate', (data) => socket.to(data.target).emit('ice-candidate', { ...data, from: socket.id }));

  // ── Disconnect ────────────────────────────────────────────────
  socket.on('disconnect', () => {
    Object.entries(channels).forEach(([channelId, ch]) => {
      if (ch.users.find(u => u.id === socket.id)) {
        ch.users = ch.users.filter(u => u.id !== socket.id);
        socket.to(`channel:${channelId}`).emit('user-left', socket.id);
        Object.entries(servers).forEach(([serverId, srv]) => {
          if (srv.channels.find(c => c.id === channelId)) {
            io.to(`server:${serverId}`).emit('channel-users-updated', {
              channelId, users: ch.users
            });
          }
        });
      }
    });
    Object.values(servers).forEach(srv => {
      srv.members = srv.members.filter(m => m.id !== socket.id);
      if (srv.members.length === 0) {
        srv.channels.forEach(ch => delete channels[ch.id]);
        delete servers[srv.id];
        console.log(`Server ${srv.id} deleted (empty)`);
      } else if (srv.ownerId === socket.id) {
        srv.ownerId = srv.members[0].id;
        srv.members[0].isAdmin = true;
        io.to(srv.members[0].id).emit('you-are-admin', srv.id);
        io.to(`server:${srv.id}`).emit('owner-changed', srv.members[0].id);
      }
    });
    console.log('Disconnected:', socket.id);
  });
});

// Audex audio proxy
app.get('/audex-proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('No URL');
  try {
    const https = require('https');
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.youtube.com',
        'Origin': 'https://www.youtube.com',
        'Range': req.headers.range || 'bytes=0-',
      }
    };
    const proxyReq = https.request(options, (proxyRes) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'audio/webm');
      res.setHeader('Accept-Ranges', 'bytes');
      if (proxyRes.headers['content-range']) res.setHeader('Content-Range', proxyRes.headers['content-range']);
      if (proxyRes.headers['content-length']) res.setHeader('Content-Length', proxyRes.headers['content-length']);
      res.status(proxyRes.statusCode);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', (e) => {
      console.error('Proxy error:', e.message);
      res.status(500).send('Proxy error');
    });
    proxyReq.end();
  } catch (e) {
    console.error('Proxy error:', e.message);
    res.status(500).send('Error');
  }
});

server.listen(5000, () => console.log('Server running on port 5000'));