import { useState } from 'react';

function Lobby({ onJoin }) {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');

  const handleSubmit = () => {
    if (username.trim() && roomId.trim()) {
      onJoin(roomId, username);
    } else {
      alert('Please enter both a name and a room ID!');
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🎙️ VoiceApp</h1>
      <p style={styles.subtitle}>Join a voice channel</p>

      <input
        style={styles.input}
        placeholder="Your name"
        value={username}
        onChange={e => setUsername(e.target.value)}
      />
      <input
        style={styles.input}
        placeholder="Room ID (e.g. room1)"
        value={roomId}
        onChange={e => setRoomId(e.target.value)}
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
  button: { padding: '12px 40px', marginTop: '16px', borderRadius: '8px', border: 'none', backgroundColor: '#e94560', color: 'white', fontSize: '1rem', cursor: 'pointer' }
};

export default Lobby;