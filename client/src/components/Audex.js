import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { PROXY_URL } from '../config';

function Audex({ socket, channelId, username, isActive, onInvite }) {
  const { theme } = useTheme();
  const [nowPlaying, setNowPlaying] = useState(null);
  const [queue, setQueue] = useState([]);
  const [duration, setDuration] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('search'); 
  const [buffering, setBuffering] = useState(false);
  const [streamError, setStreamError] = useState('');
  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  useEffect(() => {
    // Get current state when panel opens
    socket.emit('audex-get-state', { channelId });

    socket.on('audex-state', ({ active, current, queue }) => {
      if (current) setNowPlaying(current);
      setQueue(queue || []);
    });

    socket.on('audex-stream-url', ({ streamUrl, title, duration, addedBy }) => {
      if (audioRef.current) {
        audioRef.current.pause();
        clearInterval(timerRef.current);
      }

      setBuffering(true);
      setNowPlaying({ title, duration, addedBy });
      setDuration(parseInt(duration));
      setElapsed(0);
      setView('search');
      setQuery('');

      const audio = new Audio(streamUrl);
      audio.crossOrigin = 'anonymous';
      audioRef.current = audio;

      // Loading events
      audio.onwaiting = () => setBuffering(true);
      audio.onplaying = () => setBuffering(false);
      audio.oncanplay = () => setBuffering(false);

      audio.onerror = () => {
        setBuffering(false);
        setStreamError('Failed to load audio. Try skipping to next song.');
        setTimeout(() => setStreamError(''), 5000);
      };

      // Try to play, if blocked show a play button instead
      audio.play().catch(() => {
        setBuffering(false);
        setPlaybackBlocked(true);
      });

      timerRef.current = setInterval(() => {
        if (!audio.paused) {
          setElapsed(Math.floor(audio.currentTime));
        }
        if (audio.ended) {
          clearInterval(timerRef.current);
        }
      }, 1000);
    });

    socket.on('audex-stopped', () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      clearInterval(timerRef.current);
      setNowPlaying(null);
      setElapsed(0);
      setDuration(0);
      setQueue([]);
      setPlaybackBlocked(false); // 👈 add this
    });

    socket.on('audex-invited', () => {
      // Refresh state
      socket.emit('audex-get-state', { channelId });
    });

    return () => {
      socket.off('audex-state');
      socket.off('audex-stream-url');
      socket.off('audex-stopped');
      socket.off('audex-invited');
      if (audioRef.current) audioRef.current.pause();
      clearInterval(timerRef.current);
    };
  }, [channelId]);

  const sendCommand = (cmd) => {
    socket.emit('audex-command', {
      command: cmd.split(' ')[0].replace('!', ''),
      args: cmd.split(' ').slice(1).join(' '),
      channelId,
      username,
    });
  };

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    sendCommand(`!play ${searchQuery.trim()}`);
    setSearchQuery('');
    setBuffering(true);
    // Reset buffering if nothing comes back in 15 seconds
    setTimeout(() => setBuffering(false), 15000);
  };

  const fmt = (s) => {
    if (!s) return '0:00';
    const m = Math.floor(s / 60);
    const sec = String(s % 60).padStart(2, '0');
    return `${m}:${sec}`;
  };

  const progress = duration > 0 ? (elapsed / duration) * 100 : 0;

  // Not invited yet
  if (!isActive) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: theme.bg }}>
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.surface, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: 36, height: 36, borderRadius: '10px', backgroundColor: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
            🤖
          </div>
          <div>
            <h3 style={{ color: theme.text, fontWeight: '800', fontSize: '0.95rem' }}>Audex</h3>
            <p style={{ color: theme.textSecondary, fontSize: '0.75rem' }}>Music bot</p>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', textAlign: 'center', gap: '16px' }}>
          <div style={{ width: 72, height: 72, borderRadius: '20px', backgroundColor: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>
            🤖
          </div>
          <h3 style={{ color: theme.text, fontWeight: '800', fontSize: '1.1rem' }}>Invite Audex</h3>
          <p style={{ color: theme.textSecondary, fontSize: '0.88rem', maxWidth: '280px', lineHeight: '1.5' }}>
            Invite Audex to this channel to play YouTube music for everyone!
          </p>

          <div style={{ backgroundColor: theme.surface, borderRadius: '12px', padding: '16px', border: `1px solid ${theme.border}`, textAlign: 'left', width: '100%', maxWidth: '280px' }}>
            <p style={{ color: theme.textSecondary, fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Commands</p>
            {['!play <song>', '!skip', '!stop', '!queue', '!np'].map(cmd => (
              <p key={cmd} style={{ color: theme.text, fontSize: '0.82rem', fontFamily: 'monospace', marginBottom: '4px' }}>{cmd}</p>
            ))}
          </div>

          <button
            onClick={onInvite}
            style={{ padding: '12px 32px', borderRadius: '12px', border: 'none', backgroundColor: theme.accent, color: 'white', fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer' }}
          >
            + Invite Audex
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: theme.bg }}>

      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.surface, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: 36, height: 36, borderRadius: '10px', backgroundColor: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
          🤖
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ color: theme.text, fontWeight: '800', fontSize: '0.95rem' }}>Audex</h3>
          <p style={{ color: theme.success, fontSize: '0.75rem', fontWeight: '600' }}>● Active in this channel</p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Now Playing */}
        {nowPlaying ? (
          <div style={{ backgroundColor: theme.surface, border: `1px solid ${buffering ? theme.warning : theme.accent}`, borderRadius: '14px', padding: '16px', boxShadow: `0 0 20px ${theme.accent}22`, transition: 'border-color 0.3s ease' }}>

            {/* Stream error */}
            {streamError && (
              <div style={{ backgroundColor: theme.danger + '22', border: `1px solid ${theme.danger}`, borderRadius: '8px', padding: '8px 12px', marginBottom: '12px' }}>
                <p style={{ color: theme.danger, fontSize: '0.82rem' }}>❌ {streamError}</p>
              </div>
            )}

            {/* Buffering indicator */}
            {buffering && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', backgroundColor: theme.warning + '22', borderRadius: '8px', padding: '8px 12px' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: theme.warning, animation: `audexDot 0.8s ${i * 0.2}s infinite` }} />
                  ))}
                </div>
                <p style={{ color: theme.warning, fontSize: '0.82rem', fontWeight: '600' }}>Buffering...</p>
              </div>
            )}

            <p style={{ color: theme.textSecondary, fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
              {buffering ? 'Loading...' : 'Now Playing'}
            </p>
            <p style={{ color: theme.text, fontWeight: '700', fontSize: '0.92rem', marginBottom: '4px' }}>{nowPlaying.title}</p>
            <p style={{ color: theme.textSecondary, fontSize: '0.75rem', marginBottom: '12px' }}>Added by {nowPlaying.addedBy}</p>

            {/* Progress */}
            <div style={{ height: 4, backgroundColor: theme.card, borderRadius: 2, overflow: 'hidden', marginBottom: '6px', cursor: 'pointer' }}>
              <div style={{ height: '100%', width: `${progress}%`, backgroundColor: theme.accent, borderRadius: 2, transition: 'width 1s linear' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ color: theme.textSecondary, fontSize: '0.72rem' }}>{fmt(elapsed)}</span>
              <span style={{ color: theme.textSecondary, fontSize: '0.72rem' }}>{fmt(duration)}</span>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => sendCommand('!skip')}
                style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', backgroundColor: theme.card, color: theme.text, cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem' }}
              >
                ⏭ Skip
              </button>
              <button
                onClick={() => socket.emit('audex-stop', { channelId })}
                style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', backgroundColor: theme.danger + '22', color: theme.danger, cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem' }}
              >
                ⏹ Stop
              </button>
            </div>
          </div>
        ) : (
          <div style={{ backgroundColor: theme.surface, borderRadius: '14px', padding: '16px', border: `1px solid ${theme.border}`, textAlign: 'center' }}>
            <p style={{ fontSize: '1.5rem', marginBottom: '6px' }}>🎵</p>
            <p style={{ color: theme.textSecondary, fontSize: '0.88rem' }}>Nothing playing. Search for a song!</p>
          </div>
        )}

        {/* Click to play if blocked */}
        {playbackBlocked && (
          <div
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.play().then(() => {
                  setPlaybackBlocked(false);
                  setBuffering(false);
                }).catch(() => {});
              }
            }}
            style={{
              backgroundColor: theme.accent, borderRadius: '10px',
              padding: '12px', textAlign: 'center', cursor: 'pointer',
              marginBottom: '12px',
            }}
          >
            <p style={{ color: 'white', fontWeight: '700', fontSize: '0.9rem' }}>
              ▶ Click to start playback
            </p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem', marginTop: '2px' }}>
              Browser blocked autoplay — click to continue
            </p>
          </div>
        )}

        {/* Search */}
        <div>
          <p style={{ color: theme.textSecondary, fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Search & Play</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.input, color: theme.text, fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit' }}
              placeholder="Search YouTube..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <button
              onClick={handleSearch}
              style={{ padding: '10px 14px', borderRadius: '10px', border: 'none', backgroundColor: theme.accent, color: 'white', cursor: 'pointer', fontWeight: '700' }}
            >
              ▶
            </button>
          </div>
        </div>

        {/* Queue */}
        {queue.length > 0 && (
          <div>
            <p style={{ color: theme.textSecondary, fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
              Queue — {queue.length} song{queue.length !== 1 ? 's' : ''}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {queue.map((song, i) => (
                <div key={i} style={{ backgroundColor: theme.surface, borderRadius: '10px', padding: '10px 14px', border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: theme.textSecondary, fontSize: '0.78rem', fontWeight: '700', width: 20, textAlign: 'center' }}>{i + 1}</span>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <p style={{ color: theme.text, fontWeight: '600', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</p>
                    <p style={{ color: theme.textSecondary, fontSize: '0.75rem' }}>{song.duration} · {song.addedBy}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Commands reference */}
        <div style={{ backgroundColor: theme.surface, borderRadius: '12px', padding: '14px', border: `1px solid ${theme.border}` }}>
          <p style={{ color: theme.textSecondary, fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Chat Commands</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
            {[
              ['!play <song>', 'Play a song'],
              ['!skip', 'Skip current'],
              ['!stop', 'Stop & clear'],
              ['!queue', 'Show queue'],
              ['!np', 'Now playing'],
              ['!help', 'All commands'],
            ].map(([cmd, desc]) => (
              <div key={cmd} style={{ display: 'flex', flexDirection: 'column', padding: '6px 8px', borderRadius: '6px', backgroundColor: theme.card }}>
                <span style={{ color: theme.accent, fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: '700' }}>{cmd}</span>
                <span style={{ color: theme.textSecondary, fontSize: '0.7rem' }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Audex;