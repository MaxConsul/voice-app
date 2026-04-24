import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const socket = io('https://18.143.90.78', {
  transports: ['websocket', 'polling']
});

function Room({ roomId, username }) {
  const [users, setUsers] = useState([]);
  const [muted, setMuted] = useState(false);
  const peersRef = useRef({});
  const streamRef = useRef(null);

  useEffect(() => {
    // Get microphone access
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      streamRef.current = stream;

      socket.emit('join-room', roomId, username);

      // Someone already in the room — connect to them
      socket.on('existing-users', (existingUsers) => {
        setUsers(existingUsers);
        existingUsers.forEach(user => createOffer(user.id, stream));
      });

      // New user joined — wait for their offer
      socket.on('user-joined', (user) => {
        setUsers(prev => [...prev, user]);
      });

      // Receive offer from new user
      socket.on('offer', async ({ from, offer }) => {
        const pc = createPeerConnection(from, stream);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { target: from, answer });
      });

      // Receive answer
      socket.on('answer', async ({ from, answer }) => {
        const pc = peersRef.current[from];
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
      });

      // Receive ICE candidate
      socket.on('ice-candidate', ({ from, candidate }) => {
        const pc = peersRef.current[from];
        if (pc) pc.addIceCandidate(new RTCIceCandidate(candidate));
      });

      // User left
      socket.on('user-left', (id) => {
        if (peersRef.current[id]) {
          peersRef.current[id].close();
          delete peersRef.current[id];
        }
        setUsers(prev => prev.filter(u => u.id !== id));
      });
    });

    return () => socket.disconnect();
  }, []);

  const createPeerConnection = (targetId, stream) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', { target: targetId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      const audio = new Audio();
      audio.srcObject = e.streams[0];
      audio.play();
    };

    peersRef.current[targetId] = pc;
    return pc;
  };

  const createOffer = async (targetId, stream) => {
    const pc = createPeerConnection(targetId, stream);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { target: targetId, offer });
  };

  const toggleMute = () => {
    const enabled = streamRef.current.getAudioTracks()[0].enabled;
    streamRef.current.getAudioTracks()[0].enabled = !enabled;
    setMuted(!muted);
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>🔊 Room: {roomId}</h2>
      <p style={styles.subtitle}>You are <strong style={{color:'#e94560'}}>{username}</strong></p>

      <div style={styles.userList}>
        <p style={styles.label}>In this room:</p>

        {/* You */}
        <div style={styles.userCard}>
          <span style={styles.avatar}>🎙️</span>
          <span style={styles.userName}>{username} (you)</span>
          <span style={muted ? styles.mutedBadge : styles.liveBadge}>
            {muted ? 'Muted' : 'Live'}
          </span>
        </div>

        {/* Others */}
        {users.map(user => (
          <div key={user.id} style={styles.userCard}>
            <span style={styles.avatar}>🎙️</span>
            <span style={styles.userName}>{user.username}</span>
            <span style={styles.liveBadge}>Live</span>
          </div>
        ))}
      </div>

      <button style={muted ? styles.mutedButton : styles.muteButton} onClick={toggleMute}>
        {muted ? '🔇 Unmute' : '🎙️ Mute'}
      </button>
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#1a1a2e' },
  title: { color: '#e94560', fontSize: '2rem', marginBottom: '0.5rem' },
  subtitle: { color: '#aaa', marginBottom: '2rem' },
  label: { color: '#aaa', marginBottom: '1rem', fontSize: '0.9rem', textTransform: 'uppercase' },
  userList: { backgroundColor: '#16213e', borderRadius: '12px', padding: '20px', width: '320px', marginBottom: '2rem' },
  userCard: { display: 'flex', alignItems: 'center', padding: '10px', borderRadius: '8px', marginBottom: '8px', backgroundColor: '#0f3460' },
  avatar: { fontSize: '1.3rem', marginRight: '10px' },
  userName: { color: 'white', flex: 1 },
  liveBadge: { backgroundColor: '#2ecc71', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem' },
  mutedBadge: { backgroundColor: '#e74c3c', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem' },
  muteButton: { padding: '12px 40px', borderRadius: '8px', border: 'none', backgroundColor: '#e94560', color: 'white', fontSize: '1rem', cursor: 'pointer' },
  mutedButton: { padding: '12px 40px', borderRadius: '8px', border: 'none', backgroundColor: '#555', color: 'white', fontSize: '1rem', cursor: 'pointer' },
};

export default Room;