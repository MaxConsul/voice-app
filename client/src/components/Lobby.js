import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

import { SOCKET_URL } from '../config';

const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling']
});

function Lobby({ onJoin }) {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    socket.on('join-approved', () => {
      onJoin(roomId, username, socket);
    });

    socket.on('join-rejected', () => {
      setWaiting(false);
      setRejected(true);
    });

    return () => {
      socket.off('join-approved');
      socket.off('join-rejected');
    };
  }, [roomId, username]);

  const handleSubmit = () => {
    if (!username.trim() || !roomId.trim()) {
      alert('Please enter both a name and a room ID!');
      return;
    }
    setRejected(false);
    socket.emit('check-room', roomId);
    socket.once('room-status', ({ hasOwner }) => {
      if (!hasOwner) {
        // Room is empty, join freely as owner
        onJoin(roomId, username, socket);
      } else {
        // Room has people, request to join
        setWaiting(true);
        socket.emit('request-join', roomId, username);
      }
    });
  };

  // Waiting screen
  if (waiting) {
    return (
      <div style={styles.container}>
        <div style={styles.waitingBox}>
          <div style={styles.spinner}>⏳</div>
          <h2 style={styles.waitingTitle}>Waiting for approval...</h2>
          <p style={styles.waitingText}>The room owner will let you in shortly.</p>
          <button style={styles.cancelButton} onClick={() => setWaiting(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Rejected screen
  if (rejected) {
    return (
      <div style={styles.container}>
        <div style={styles.waitingBox}>
          <div style={styles.spinner}>❌</div>
          <h2 style={{ ...styles.waitingTitle, color: '#e94560' }}>Request Rejected</h2>
          <p style={styles.waitingText}>The room owner declined your request.</p>
          <button style={styles.button} onClick={() => setRejected(false)}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🎙️ Pinnacle</h1>
      <p style={styles.subtitle}>Join a voice channel</p>
      <input
        style={styles.input}
        placeholder="Your name"
        value={username}
        onChange={e => setUsername(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
      />
      <input
        style={styles.input}
        placeholder="Room ID (e.g. room1)"
        value={roomId}
        onChange={e => setRoomId(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
      />
      <button style={styles.button} onClick={handleSubmit}>
        Join Room
      </button>
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#1a1a2e' },
  title: { color: '#e94560', fontSize: '2.5rem', marginBottom: '0.5rem' },
  subtitle: { color: '#aaa', marginBottom: '2rem' },
  input: { padding: '12px 20px', margin: '8px', borderRadius: '8px', border: 'none', width: '280px', fontSize: '1rem', backgroundColor: '#16213e', color: 'white' },
  button: { padding: '12px 40px', marginTop: '16px', borderRadius: '8px', border: 'none', backgroundColor: '#e94560', color: 'white', fontSize: '1rem', cursor: 'pointer' },
  waitingBox: { backgroundColor: '#16213e', borderRadius: '16px', padding: '40px', textAlign: 'center', width: '320px' },
  spinner: { fontSize: '3rem', marginBottom: '1rem' },
  waitingTitle: { color: 'white', marginBottom: '0.5rem' },
  waitingText: { color: '#aaa', marginBottom: '2rem' },
  cancelButton: { padding: '10px 30px', borderRadius: '8px', border: 'none', backgroundColor: '#333', color: 'white', fontSize: '1rem', cursor: 'pointer' },
};

export default Lobby;