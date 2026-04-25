import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { io } from 'socket.io-client';

const SOCKET_URL =
  window.location.hostname === 'localhost'
    ? 'http://localhost:5000'
    : 'https://18.143.90.78:5000';

const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling']
});

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `${randomStr(chars, 3)}-${randomStr(chars, 3)}`;
}

function randomStr(chars, len) {
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function Avatar({ profile, size = 40 }) {
  const fontSize = size * 0.36;
  if (profile.photo) {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
        <img src={profile.photo} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      backgroundColor: profile.color, color: 'white',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize, fontWeight: '800', flexShrink: 0
    }}>
      {profile.initials}
    </div>
  );
}

function Dashboard({ profile, onJoinRoom }) {
  const { theme, mode, toggleTheme } = useTheme();
  const [tab, setTab] = useState('home');
  const [joinCode, setJoinCode] = useState('');
  const [recentRooms, setRecentRooms] = useState(() => {
    const saved = localStorage.getItem('recentRooms');
    return saved ? JSON.parse(saved) : [];
  });
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  const saveRoom = (code, name) => {
    const updated = [
      { code, name, time: new Date().toLocaleString() },
      ...recentRooms.filter(r => r.code !== code)
    ].slice(0, 8);
    setRecentRooms(updated);
    localStorage.setItem('recentRooms', JSON.stringify(updated));
  };

  const handleCreateRoom = () => {
    const code = generateRoomCode();
    const name = `${profile.username}'s Room`;
    saveRoom(code, name);
    socket.emit('check-room', code);
    socket.once('room-status', () => {
      onJoinRoom({ code, name }, socket);
    });
  };

  const handleJoinRoom = () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) { setError('Please enter a room code.'); return; }
    if (code.length < 3) { setError('Invalid room code.'); return; }
    setError('');
    setJoining(true);

    socket.emit('check-room', code);
    socket.once('room-status', ({ hasOwner }) => {
      if (!hasOwner) {
        setJoining(false);
        setError('Room not found. Check the code and try again.');
        return;
      }
      saveRoom(code, `Room ${code}`);
      socket.emit('request-join', code, profile.username);

      socket.once('join-approved', () => {
        setJoining(false);
        onJoinRoom({ code, name: `Room ${code}` }, socket);
      });

      socket.once('join-rejected', () => {
        setJoining(false);
        setError('Your request was rejected by the room owner.');
      });
    });
  };

  const handleRejoinRoom = (room) => {
    setJoinCode(room.code);
    setTab('join');
  };

  return (
    <div style={{ ...styles.container, backgroundColor: theme.bg }}>

      {/* Sidebar */}
      <div style={{ ...styles.sidebar, backgroundColor: theme.surface, borderRight: `1px solid ${theme.border}` }}>
        <div style={styles.sidebarTop}>
          <h2 style={{ ...styles.logo, color: theme.accent }}>Pinnacle</h2>

          <nav style={styles.nav}>
            {[
              { id: 'home', label: 'Home' },
              { id: 'create', label: 'Create Room' },
              { id: 'join', label: 'Join Room' },
              { id: 'recent', label: 'Recent Rooms' },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => { setTab(item.id); setError(''); }}
                style={{
                  ...styles.navBtn,
                  backgroundColor: tab === item.id ? theme.accent : 'transparent',
                  color: tab === item.id ? 'white' : theme.textSecondary,
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Profile at bottom of sidebar */}
        <div style={{ ...styles.profileRow, borderTop: `1px solid ${theme.border}` }}>
          <Avatar profile={profile} size={38} />
          <div style={styles.profileInfo}>
            <p style={{ ...styles.profileName, color: theme.text }}>{profile.username}</p>
            <p style={{ ...styles.profileSub, color: theme.textSecondary }}>Online</p>
          </div>
          <button
            style={{ ...styles.themeBtn, backgroundColor: theme.card, color: theme.text }}
            onClick={toggleTheme}
            title="Toggle theme"
          >
            {mode === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.main}>

        {/* HOME TAB */}
        {tab === 'home' && (
          <div style={styles.content}>
            <h1 style={{ ...styles.heading, color: theme.text }}>
              Welcome back, {profile.username}! 👋
            </h1>
            <p style={{ color: theme.textSecondary, marginBottom: '2rem' }}>
              What would you like to do today?
            </p>

            <div style={styles.homeCards}>
              <div
                style={{ ...styles.homeCard, backgroundColor: theme.surface, border: `1px solid ${theme.border}`, cursor: 'pointer' }}
                onClick={() => setTab('create')}
              >
                <div style={{ ...styles.homeCardIcon, backgroundColor: theme.accent + '22' }}>
                  <span style={{ fontSize: '1.8rem' }}>🎙️</span>
                </div>
                <h3 style={{ color: theme.text, marginBottom: '6px' }}>Create a Room</h3>
                <p style={{ color: theme.textSecondary, fontSize: '0.9rem' }}>
                  Start a new voice channel and invite friends
                </p>
              </div>

              <div
                style={{ ...styles.homeCard, backgroundColor: theme.surface, border: `1px solid ${theme.border}`, cursor: 'pointer' }}
                onClick={() => setTab('join')}
              >
                <div style={{ ...styles.homeCardIcon, backgroundColor: theme.success + '22' }}>
                  <span style={{ fontSize: '1.8rem' }}>🚪</span>
                </div>
                <h3 style={{ color: theme.text, marginBottom: '6px' }}>Join a Room</h3>
                <p style={{ color: theme.textSecondary, fontSize: '0.9rem' }}>
                  Enter a room code to join your friends
                </p>
              </div>
            </div>

            {/* Recent rooms preview */}
            {recentRooms.length > 0 && (
              <>
                <h2 style={{ ...styles.sectionTitle, color: theme.text }}>Recent Rooms</h2>
                <div style={styles.recentList}>
                  {recentRooms.slice(0, 3).map(room => (
                    <div key={room.code} style={{ ...styles.recentCard, backgroundColor: theme.surface, border: `1px solid ${theme.border}` }}>
                      <div>
                        <p style={{ color: theme.text, fontWeight: '600' }}>{room.name}</p>
                        <p style={{ color: theme.textSecondary, fontSize: '0.8rem' }}>{room.code} · {room.time}</p>
                      </div>
                      <button
                        style={{ ...styles.rejoinBtn, backgroundColor: theme.accent }}
                        onClick={() => handleRejoinRoom(room)}
                      >
                        Rejoin
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* CREATE ROOM TAB */}
        {tab === 'create' && (
          <div style={styles.content}>
            <h1 style={{ ...styles.heading, color: theme.text }}>Create a Room</h1>
            <p style={{ color: theme.textSecondary, marginBottom: '2rem' }}>
              A unique room code will be generated for you to share with friends.
            </p>
            <div style={{ ...styles.box, backgroundColor: theme.surface, border: `1px solid ${theme.border}` }}>
              <div style={{ ...styles.avatarRow }}>
                <Avatar profile={profile} size={50} />
                <div>
                  <p style={{ color: theme.text, fontWeight: '700', fontSize: '1.1rem' }}>{profile.username}</p>
                  <p style={{ color: theme.textSecondary, fontSize: '0.85rem' }}>You will be the room owner 👑</p>
                </div>
              </div>

              <div style={{ ...styles.infoBox, backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
                <p style={{ color: theme.textSecondary, fontSize: '0.85rem', marginBottom: '4px' }}>As room owner you can:</p>
                <p style={{ color: theme.text, fontSize: '0.9rem' }}>✅ Accept or reject join requests</p>
                <p style={{ color: theme.text, fontSize: '0.9rem' }}>✅ Share the room code with friends</p>
                <p style={{ color: theme.text, fontSize: '0.9rem' }}>✅ Be the first in the room</p>
              </div>

              <button
                style={{ ...styles.primaryBtn, backgroundColor: theme.accent }}
                onClick={handleCreateRoom}
              >
                Create Room
              </button>
            </div>
          </div>
        )}

        {/* JOIN ROOM TAB */}
        {tab === 'join' && (
          <div style={styles.content}>
            <h1 style={{ ...styles.heading, color: theme.text }}>Join a Room</h1>
            <p style={{ color: theme.textSecondary, marginBottom: '2rem' }}>
              Enter the room code shared by your friend.
            </p>
            <div style={{ ...styles.box, backgroundColor: theme.surface, border: `1px solid ${theme.border}` }}>
              <input
                style={{ ...styles.input, backgroundColor: theme.input, color: theme.text, border: `1px solid ${theme.border}`, letterSpacing: '4px', fontSize: '1.3rem', textAlign: 'center', textTransform: 'uppercase' }}
                placeholder="XXX-XXX"
                value={joinCode}
                maxLength={7}
                onChange={e => { setJoinCode(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
                autoFocus
              />
              {error && <p style={styles.error}>{error}</p>}

              {joining ? (
                <div style={{ ...styles.waitingBox, backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
                  <p style={{ color: theme.text, fontWeight: '600' }}>⏳ Waiting for approval...</p>
                  <p style={{ color: theme.textSecondary, fontSize: '0.85rem' }}>The room owner will accept or reject your request.</p>
                  <button
                    style={{ ...styles.cancelBtn, backgroundColor: theme.card, color: theme.textSecondary, border: `1px solid ${theme.border}` }}
                    onClick={() => setJoining(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  style={{ ...styles.primaryBtn, backgroundColor: theme.accent }}
                  onClick={handleJoinRoom}
                >
                  Request to Join
                </button>
              )}
            </div>
          </div>
        )}

        {/* RECENT ROOMS TAB */}
        {tab === 'recent' && (
          <div style={styles.content}>
            <h1 style={{ ...styles.heading, color: theme.text }}>Recent Rooms</h1>
            <p style={{ color: theme.textSecondary, marginBottom: '2rem' }}>
              Rooms you have visited recently.
            </p>

            {recentRooms.length === 0 ? (
              <div style={{ ...styles.emptyBox, backgroundColor: theme.surface, border: `1px solid ${theme.border}` }}>
                <p style={{ fontSize: '2rem' }}>🏠</p>
                <p style={{ color: theme.textSecondary }}>No recent rooms yet. Create or join one!</p>
              </div>
            ) : (
              <div style={styles.recentList}>
                {recentRooms.map(room => (
                  <div key={room.code} style={{ ...styles.recentCard, backgroundColor: theme.surface, border: `1px solid ${theme.border}` }}>
                    <div>
                      <p style={{ color: theme.text, fontWeight: '600' }}>{room.name}</p>
                      <p style={{ color: theme.textSecondary, fontSize: '0.8rem' }}>{room.code} · {room.time}</p>
                    </div>
                    <button
                      style={{ ...styles.rejoinBtn, backgroundColor: theme.accent }}
                      onClick={() => handleRejoinRoom(room)}
                    >
                      Rejoin
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { display: 'flex', height: '100vh', overflow: 'hidden' },
  sidebar: { width: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexShrink: 0 },
  sidebarTop: { padding: '24px 16px' },
  logo: { fontSize: '1.4rem', fontWeight: '800', marginBottom: '2rem', letterSpacing: '-0.5px' },
  nav: { display: 'flex', flexDirection: 'column', gap: '4px' },
  navBtn: { padding: '10px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.95rem', fontWeight: '600', transition: 'all 0.15s ease' },
  profileRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '16px' },
  profileInfo: { flex: 1, overflow: 'hidden' },
  profileName: { fontWeight: '700', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  profileSub: { fontSize: '0.75rem' },
  themeBtn: { padding: '6px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.9rem' },
  main: { flex: 1, overflowY: 'auto', padding: '40px' },
  content: { maxWidth: '640px' },
  heading: { fontSize: '1.8rem', fontWeight: '800', marginBottom: '8px', letterSpacing: '-0.5px' },
  sectionTitle: { fontSize: '1.2rem', fontWeight: '700', margin: '2rem 0 1rem' },
  homeCards: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '2rem' },
  homeCard: { borderRadius: '16px', padding: '24px', transition: 'transform 0.15s ease', },
  homeCardIcon: { width: '52px', height: '52px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' },
  box: { borderRadius: '16px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '16px' },
  avatarRow: { display: 'flex', alignItems: 'center', gap: '14px' },
  infoBox: { borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px' },
  input: { width: '100%', padding: '14px 16px', borderRadius: '10px', fontSize: '1rem', outline: 'none', fontFamily: 'inherit' },
  error: { color: '#e94560', fontSize: '0.85rem' },
  primaryBtn: { width: '100%', padding: '13px', borderRadius: '10px', border: 'none', color: 'white', fontSize: '1rem', fontWeight: '700', cursor: 'pointer' },
  waitingBox: { borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', textAlign: 'center' },
  cancelBtn: { padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', marginTop: '8px', fontSize: '0.9rem' },
  recentList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  recentCard: { borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  rejoinBtn: { padding: '8px 18px', borderRadius: '8px', border: 'none', color: 'white', fontWeight: '600', cursor: 'pointer', fontSize: '0.85rem', flexShrink: 0 },
  emptyBox: { borderRadius: '16px', padding: '40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' },
};

export default Dashboard;