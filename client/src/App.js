import { useState } from 'react';
import { useTheme } from './context/ThemeContext';
import AvatarSetup from './components/AvatarSetup';
import ServerList from './components/ServerList';
import ChannelList from './components/ChannelList';
import Room from './components/Room';
import { io } from 'socket.io-client';
import { SOCKET_URL } from './config';

const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

function App() {
  const { theme } = useTheme();
  const [screen, setScreen] = useState('avatar');
  const [profile, setProfile] = useState(null);
  const [servers, setServers] = useState([]);
  const [activeServer, setActiveServer] = useState(null);
  const [activeChannel, setActiveChannel] = useState(null);
  const [channelUsers, setChannelUsers] = useState({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState('');

  const handleAvatarDone = (profileData) => {
    setProfile(profileData);
    setScreen('main');

    // Listen for server events
    socket.on('server-created', (srv) => {
      setServers(prev => [...prev, srv]);
      setActiveServer(srv);
      setIsAdmin(true);
      setChannelUsers({});
    });

    socket.on('server-joined', (srv) => {
      setServers(prev => {
        if (prev.find(s => s.id === srv.id)) return prev;
        return [...prev, srv];
      });
      setActiveServer(srv);
      setIsAdmin(false);
      setChannelUsers({});
    });

    socket.on('server-error', (msg) => setError(msg));

    socket.on('channel-created', (ch) => {
      setActiveServer(prev => prev ? { ...prev, channels: [...prev.channels, ch] } : prev);
      setServers(prev => prev.map(s => s.id === activeServer?.id ? { ...s, channels: [...s.channels, ch] } : s));
    });

    socket.on('channel-deleted', (channelId) => {
      setActiveServer(prev => prev ? { ...prev, channels: prev.channels.filter(c => c.id !== channelId) } : prev);
      if (activeChannel?.id === channelId) setActiveChannel(null);
    });

    socket.on('channel-users-updated', ({ channelId, users }) => {
      setChannelUsers(prev => ({ ...prev, [channelId]: users }));
    });

    socket.on('channel-existing-users', ({ users, channelId }) => {
      setChannelUsers(prev => ({ ...prev, [channelId]: users }));
    });

    socket.on('you-are-admin', (serverId) => {
      if (activeServer?.id === serverId) setIsAdmin(true);
    });

    socket.on('member-joined', ({ username }) => {
      setActiveServer(prev => prev ? { ...prev, memberCount: (prev.memberCount || 1) + 1 } : prev);
    });
  };

  const handleCreateServer = ({ name, icon }) => {
    socket.emit('create-server', { name, icon, username: profile.username });
  };

  const handleJoinServer = (code) => {
    socket.emit('join-server', { serverId: code, username: profile.username });
  };

  const handleSelectServer = (srv) => {
    setActiveServer(srv);
    setActiveChannel(null);
    setIsAdmin(srv.ownerId === socket.id || srv.members?.find(m => m.id === socket.id)?.isAdmin);
  };

  const handleJoinChannel = (ch, newChannelName) => {
    if (newChannelName) {
      // Create new channel
      socket.emit('create-channel', { serverId: activeServer.id, name: newChannelName });
      return;
    }
    if (!ch) return;
    setActiveChannel(ch);
    socket.emit('join-channel', { channelId: ch.id, serverId: activeServer.id, username: profile.username });
  };

  const handleLeaveChannel = () => {
    if (activeChannel) {
      socket.emit('leave-channel', { channelId: activeChannel.id, serverId: activeServer.id });
    }
    setActiveChannel(null);
  };

  if (screen === 'avatar') {
    return <AvatarSetup onDone={handleAvatarDone} />;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: theme.bg, overflow: 'hidden' }}>

      {/* Error toast */}
      {error && (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', backgroundColor: theme.danger, color: 'white', padding: '12px 24px', borderRadius: '10px', zIndex: 9999, fontWeight: '700', fontSize: '0.9rem' }}>
          {error}
          <button onClick={() => setError('')} style={{ marginLeft: '12px', background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontWeight: '800' }}>✕</button>
        </div>
      )}

      {/* Left — Server List */}
      <ServerList
        servers={servers}
        activeServerId={activeServer?.id}
        onSelectServer={handleSelectServer}
        onCreateServer={handleCreateServer}
        onJoinServer={handleJoinServer}
        profile={profile}
      />

      {/* Middle — Channel List */}
      {activeServer ? (
        <ChannelList
          server={activeServer}
          activeChannelId={activeChannel?.id}
          channelUsers={channelUsers}
          onJoinChannel={handleJoinChannel}
          onLeaveChannel={handleLeaveChannel}
          isAdmin={isAdmin}
          profile={{ ...profile, socketId: socket.id }}
          activeServerId={activeServer.id}
        />
      ) : (
        <div style={{ width: '240px', backgroundColor: theme.surface, borderRight: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <p style={{ color: theme.textSecondary, fontSize: '0.88rem' }}>Create or join a server to get started</p>
          </div>
        </div>
      )}

      {/* Right — Voice Room or Welcome */}
      {activeChannel ? (
        <Room
          roomInfo={{ code: activeChannel.id, name: activeChannel.name, serverId: activeServer.id }}
          profile={profile}
          socket={socket}
          onLeave={handleLeaveChannel}
        />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ color: theme.text, fontWeight: '800', marginBottom: '8px' }}>
              {activeServer ? `Welcome to ${activeServer.name}!` : 'Welcome!'}
            </h2>
            <p style={{ color: theme.textSecondary, fontSize: '0.95rem' }}>
              {activeServer ? 'Click a voice channel to join' : 'Create or join a server to get started'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;