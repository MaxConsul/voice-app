import { useState, useEffect, useRef } from 'react';
import { useTheme } from './context/ThemeContext';
import AvatarSetup from './components/AvatarSetup';
import ServerList from './components/ServerList';
import ChannelList from './components/ChannelList';
import Room from './components/Room';
import { io } from 'socket.io-client';
import { SOCKET_URL } from './config';
import TextChat from './components/TextChat';

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

  // Refs to avoid stale closures
  const activeServerRef = useRef(null);
  const activeChannelRef = useRef(null);
  const isAdminRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { activeServerRef.current = activeServer; }, [activeServer]);
  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);
  useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);

  // Register socket listeners once on mount
  useEffect(() => {
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

    socket.on('server-error', (msg) => {
      setError(msg);
      setTimeout(() => setError(''), 4000);
    });

    socket.on('channel-created', (ch) => {
      setActiveServer(prev => {
        if (!prev) return prev;
        return { ...prev, channels: [...prev.channels, ch] };
      });
      setServers(prev => prev.map(s =>
        s.id === activeServerRef.current?.id
          ? { ...s, channels: [...s.channels, ch] }
          : s
      ));
    });

    socket.on('channel-deleted', (channelId) => {
      setActiveServer(prev => {
        if (!prev) return prev;
        return { ...prev, channels: prev.channels.filter(c => c.id !== channelId) };
      });
      setActiveChannel(prev => prev?.id === channelId ? null : prev);
    });

    socket.on('channel-users-updated', ({ channelId, users }) => {
      setChannelUsers(prev => ({ ...prev, [channelId]: users }));
    });

    socket.on('you-are-admin', (serverId) => {
      if (activeServerRef.current?.id === serverId) setIsAdmin(true);
    });

    socket.on('member-joined', () => {
      setActiveServer(prev => prev
        ? { ...prev, memberCount: (prev.memberCount || 1) + 1 }
        : prev
      );
    });

    socket.on('user-left-channel', ({ userId, channelId }) => {
      setChannelUsers(prev => ({
        ...prev,
        [channelId]: (prev[channelId] || []).filter(u => u.id !== userId)
      }));
    });

    socket.on('member-count-updated', ({ memberCount }) => {
      setActiveServer(prev => prev ? { ...prev, memberCount } : prev);
    });

    socket.on('member-left', ({ memberCount }) => {
      setActiveServer(prev => prev ? { ...prev, memberCount } : prev);
    });

    return () => {
      socket.off('server-created');
      socket.off('server-joined');
      socket.off('server-error');
      socket.off('channel-created');
      socket.off('channel-deleted');
      socket.off('channel-users-updated');
      socket.off('you-are-admin');
      socket.off('member-joined');
      socket.off('user-left-channel');
      socket.off('member-count-updated');
      socket.off('member-left');
    };
  }, []);

  const handleAvatarDone = (profileData) => {
    setProfile(profileData);
    setScreen('main');
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
    const member = srv.members?.find(m => m.id === socket.id);
    setIsAdmin(srv.ownerId === socket.id || member?.isAdmin || false);
  };

  const handleJoinChannel = (ch, newChannelName) => {
    if (newChannelName) {
      socket.emit('create-channel', {
        serverId: activeServerRef.current.id,
        name: newChannelName
      });
      return;
    }
    if (!ch) return;
    if (activeChannelRef.current?.id === ch.id) return;

    // Only emit leave/join for voice channels
    if (ch.type === 'voice') {
      const current = activeChannelRef.current;
      if (current && current.type === 'voice') {
        socket.emit('leave-channel', {
          channelId: current.id,
          serverId: activeServerRef.current?.id
        });
      }
      socket.emit('join-channel', {
        channelId: ch.id,
        serverId: activeServerRef.current?.id,
        username: profile.username
      });  // Room.js will also emit join-channel on mount, but that's handled by alreadyInChannel check
    }

    setActiveChannel(ch);
  };

  const handleLeaveChannel = () => {
    if (activeChannelRef.current && activeChannelRef.current.type === 'voice') {
      setChannelUsers(prev => ({
        ...prev,
        [activeChannelRef.current.id]: (prev[activeChannelRef.current.id] || [])
          .filter(u => u.id !== socket.id)
      }));
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

      {/* Right — Voice Room, Text Chat, or Welcome */}
      {activeChannel ? (
        activeChannel.type === 'text' ? (
          <TextChat
            socket={socket}
            channelId={activeChannel.id}
            serverId={activeServer.id}
            channelName={activeChannel.name}
            profile={profile}
          />
        ) : (
          <Room
            key={activeChannel.id}
            roomInfo={{ code: activeChannel.id, name: activeChannel.name, serverId: activeServer.id }}
            profile={profile}
            socket={socket}
            onLeave={handleLeaveChannel}
          />
        )
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