import { useState, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';

const MAX_SOUNDS = 10;
const MAX_DURATION = 5;

function Soundboard({ socket, roomId, username }) {
  const { theme } = useTheme();
  const [sounds, setSounds] = useState([]);
  const [playing, setPlaying] = useState(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();

  const loadSound = (file) => {
    setError('');
    if (!file.type.startsWith('audio/')) {
      setError('Please upload an audio file (mp3, wav, ogg).');
      return;
    }
    if (sounds.length >= MAX_SOUNDS) {
      setError(`Maximum ${MAX_SOUNDS} sounds allowed.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const audio = new Audio(ev.target.result);
      audio.onloadedmetadata = () => {
        if (audio.duration > MAX_DURATION) {
          setError(`Sound must be ${MAX_DURATION} seconds or less. This one is ${Math.round(audio.duration)}s.`);
          return;
        }
        const name = file.name.replace(/\.[^/.]+$/, '').slice(0, 20);
        setSounds(prev => [...prev, { id: Date.now(), name, data: ev.target.result }]);
      };
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) loadSound(file);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) loadSound(file);
  };

  const playSound = (sound) => {
    // Play locally
    const audio = new Audio(sound.data);
    audio.play();
    setPlaying(sound.id);
    audio.onended = () => setPlaying(null);

    // Broadcast to room
    socket.emit('play-sound', roomId, sound.data, sound.name);
  };

  const removeSound = (id) => {
    setSounds(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: theme.bg }}>

      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.surface }}>
        <h3 style={{ color: theme.text, fontWeight: '800' }}>Soundboard</h3>
        <p style={{ color: theme.textSecondary, fontSize: '0.8rem', marginTop: '2px' }}>
          Upload sounds up to 5 seconds — everyone in the room hears them!
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {/* Drop Zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current.click()}
          style={{
            border: `2px dashed ${dragging ? theme.accent : theme.border}`,
            borderRadius: '14px',
            padding: '28px',
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: dragging ? theme.accent + '11' : 'transparent',
            transition: 'all 0.2s ease',
            marginBottom: '20px'
          }}
        >
          <p style={{ fontSize: '1.8rem', marginBottom: '8px' }}>🎵</p>
          <p style={{ color: theme.text, fontWeight: '700', marginBottom: '4px' }}>
            Drop a sound here or click to upload
          </p>
          <p style={{ color: theme.textSecondary, fontSize: '0.82rem' }}>
            MP3, WAV, OGG — max 5 seconds · {sounds.length}/{MAX_SOUNDS} sounds
          </p>
          <input ref={fileRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleFileChange} />
        </div>

        {error && (
          <div style={{ backgroundColor: theme.danger + '22', border: `1px solid ${theme.danger}`, borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
            <p style={{ color: theme.danger, fontSize: '0.88rem' }}>{error}</p>
          </div>
        )}

        {/* Sound Grid */}
        {sounds.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '3rem' }}>
            <p style={{ color: theme.textSecondary, fontSize: '0.9rem' }}>
              No sounds yet. Upload your first meme sound! 🔊
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
            {sounds.map(sound => (
              <div
                key={sound.id}
                style={{
                  backgroundColor: theme.surface,
                  border: `1px solid ${playing === sound.id ? theme.accent : theme.border}`,
                  borderRadius: '14px',
                  padding: '16px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '10px',
                  position: 'relative',
                  transition: 'border-color 0.2s ease',
                  boxShadow: playing === sound.id ? `0 0 12px ${theme.accent}44` : 'none'
                }}
              >
                {/* Remove button */}
                <button
                  onClick={() => removeSound(sound.id)}
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    width: 20, height: 20, borderRadius: '50%',
                    border: 'none', backgroundColor: theme.card,
                    color: theme.textSecondary, cursor: 'pointer',
                    fontSize: '0.65rem', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontWeight: '800'
                  }}
                >
                  ✕
                </button>

                {/* Play button */}
                <button
                  onClick={() => playSound(sound)}
                  style={{
                    width: 56, height: 56, borderRadius: '50%',
                    border: 'none',
                    backgroundColor: playing === sound.id ? theme.accent : theme.card,
                    color: playing === sound.id ? 'white' : theme.textSecondary,
                    cursor: 'pointer', fontSize: '1.4rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s ease',
                    transform: playing === sound.id ? 'scale(1.08)' : 'scale(1)'
                  }}
                >
                  {playing === sound.id ? '🔊' : '▶'}
                </button>

                <p style={{
                  color: theme.text, fontSize: '0.82rem',
                  fontWeight: '700', textAlign: 'center',
                  wordBreak: 'break-word', lineHeight: '1.3'
                }}>
                  {sound.name}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Soundboard;