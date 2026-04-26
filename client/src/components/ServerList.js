import { useState, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';

const EMOJIS = ['🎮', '🎵', '🎨', '🏆', '🚀', '💻', '🎯', '🔥', '⚡', '🌍', '🎲', '🏠'];

function ServerList({ servers, activeServerId, onSelectServer, onCreateServer, onJoinServer, profile }) {
  const { theme, mode, toggleTheme } = useTheme();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [serverName, setServerName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState(EMOJIS[0]);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const serverPhotoRef = useRef();
  const [serverPhoto, setServerPhoto] = useState(null);

  const handleCreate = () => {
    if (!serverName.trim()) { setError('Please enter a server name.'); return; }
    setShowCreate(false);
    setLoading(true);
    setLoadingMsg(`Creating ${serverName.trim()}...`);
    setTimeout(() => {
      onCreateServer({ name: serverName.trim(), icon: selectedEmoji, photo: serverPhoto });
      setServerName('');
      setSelectedEmoji(EMOJIS[0]);
      setServerPhoto(null);
      setError('');
      setLoading(false);
      setLoadingMsg('');
    }, 1500);
  };
  const handleJoin = () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) { setError('Please enter an invite code.'); return; }
    onJoinServer(code);
    setInviteCode('');
    setShowJoin(false);
    setError('');
  };

  return (
    <div style={{ width: '72px', backgroundColor: theme.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: '8px', borderRight: `1px solid ${theme.border}`, flexShrink: 0, overflowY: 'auto' }}>

      {/* Server icons */}
      {servers.map(srv => (
        <div key={srv.id} style={{ position: 'relative' }}>
          {/* Active indicator */}
          {activeServerId === srv.id && (
            <div style={{ position: 'absolute', left: -12, top: '50%', transform: 'translateY(-50%)', width: 4, height: 36, backgroundColor: theme.text, borderRadius: '0 4px 4px 0' }} />
          )}
          <button
            onClick={() => onSelectServer(srv)}
            title={srv.name}
            style={{
              width: 48, height: 48, borderRadius: activeServerId === srv.id ? '14px' : '50%',
              border: 'none', backgroundColor: theme.surface,
              fontSize: '1.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', transition: 'all 0.2s ease',
              boxShadow: activeServerId === srv.id ? `0 0 0 2px ${theme.accent}` : 'none',
              overflow: 'hidden', padding: 0,
              backgroundImage: srv.photo ? `url(${srv.photo})` : 'none',
              backgroundSize: 'cover', backgroundPosition: 'center',
            }}
          >
            {!srv.photo && srv.icon}
          </button>
        </div>
      ))}

      {/* Divider */}
      {servers.length > 0 && (
        <div style={{ width: 32, height: 2, backgroundColor: theme.border, borderRadius: 1, margin: '4px 0' }} />
      )}

      {/* Create server */}
      <div style={{ position: 'relative' }} className="server-btn-wrapper">
        <button
          onClick={() => { setShowCreate(true); setShowJoin(false); setError(''); }}
          onMouseEnter={e => {
            e.currentTarget.style.borderRadius = '14px';
            e.currentTarget.style.backgroundColor = theme.success;
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderRadius = '50%';
            e.currentTarget.style.backgroundColor = theme.surface;
            e.currentTarget.style.color = theme.success;
          }}
          style={{
            width: 48, height: 48, borderRadius: '50%', border: 'none',
            backgroundColor: theme.surface, color: theme.success,
            fontSize: '1.5rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s ease', fontWeight: '300',
          }}
        >
          +
        </button>
      </div>

      {/* Join server */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => { setShowJoin(true); setShowCreate(false); setError(''); }}
          onMouseEnter={e => {
            e.currentTarget.style.borderRadius = '14px';
            e.currentTarget.style.backgroundColor = theme.accent;
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderRadius = '50%';
            e.currentTarget.style.backgroundColor = theme.surface;
            e.currentTarget.style.color = theme.accent;
          }}
          style={{
            width: 48, height: 48, borderRadius: '50%', border: 'none',
            backgroundColor: theme.surface, color: theme.accent,
            fontSize: '1.2rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s ease',
          }}
        >
          🔗
        </button>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title="Toggle theme"
        style={{ width: 48, height: 48, borderRadius: '50%', border: 'none', backgroundColor: theme.surface, color: theme.textSecondary, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {mode === 'dark' ? '☀️' : '🌙'}
      </button>

      {/* Avatar */}
      <div style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, cursor: 'default' }}
        title={profile.username}
      >
        {profile.photo
          ? <img src={profile.photo} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', backgroundColor: profile.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '800', fontSize: '1rem' }}>{profile.initials}</div>
        }
      </div>

      {/* Loading overlay */}
      {loading && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: theme.surface, borderRadius: '20px', padding: '32px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', border: `1px solid ${theme.border}` }}>
            <div style={{ width: 48, height: 48, borderRadius: '14px', backgroundColor: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', animation: 'pulse 1s infinite' }}>
              {selectedEmoji}
            </div>
            <p style={{ color: theme.text, fontWeight: '700', fontSize: '1rem' }}>{loadingMsg}</p>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: theme.accent, opacity: 0.4, animation: `bounce 0.8s ${i * 0.2}s infinite` }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create Server Modal */}
      {showCreate && (
        <Modal title="Create a Server" onClose={() => { setShowCreate(false); setError(''); }} theme={theme}>
          <p style={{ color: theme.textSecondary, fontSize: '0.85rem', marginBottom: '16px' }}>
            Give your server a name and pick an icon.
          </p>

          {/* Photo upload */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '12px', gap: '8px' }}>
            <div
              onClick={() => serverPhotoRef.current.click()}
              style={{ width: 64, height: 64, borderRadius: '16px', backgroundColor: serverPhoto ? 'transparent' : theme.card, border: `2px dashed ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', backgroundImage: serverPhoto ? `url(${serverPhoto})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }}
            >
              {!serverPhoto && <span style={{ fontSize: '1.5rem' }}>📷</span>}
            </div>
            <p style={{ color: theme.textSecondary, fontSize: '0.78rem' }}>
              {serverPhoto ? 'Click to change photo' : 'Upload server photo (optional)'}
            </p>
            {serverPhoto && (
              <button onClick={() => setServerPhoto(null)} style={{ fontSize: '0.75rem', color: theme.danger, background: 'none', border: 'none', cursor: 'pointer' }}>
                Remove photo
              </button>
            )}
            <input ref={serverPhotoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
              const file = e.target.files[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = ev => setServerPhoto(ev.target.result);
              reader.readAsDataURL(file);
              e.target.value = '';
            }} />
          </div>

          <p style={{ color: theme.textSecondary, fontSize: '0.82rem', marginBottom: '8px' }}>
            Or choose an emoji icon:
          </p>

          {/* Emoji picker */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px', marginBottom: '16px' }}>
            {EMOJIS.map(e => (
              <button key={e} onClick={() => setSelectedEmoji(e)} style={{ width: '100%', aspectRatio: '1', borderRadius: '10px', border: 'none', backgroundColor: selectedEmoji === e ? theme.accent : theme.card, fontSize: '1.3rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: selectedEmoji === e ? `0 0 0 2px ${theme.accent}` : 'none' }}>
                {e}
              </button>
            ))}
          </div>

          <input
            autoFocus
            placeholder="Server name (e.g. Gaming Squad)"
            value={serverName}
            onChange={e => { setServerName(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.input, color: theme.text, fontSize: '0.95rem', outline: 'none', fontFamily: 'inherit', marginBottom: '12px' }}
          />
          {error && <p style={{ color: theme.danger, fontSize: '0.82rem', marginBottom: '10px' }}>{error}</p>}
          <button onClick={handleCreate} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: theme.accent, color: 'white', fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer' }}>
            Create Server
          </button>
        </Modal>
      )}

      {/* Join Server Modal */}
      {showJoin && (
        <Modal title="Join a Server" onClose={() => { setShowJoin(false); setError(''); }} theme={theme}>
          <p style={{ color: theme.textSecondary, fontSize: '0.85rem', marginBottom: '16px' }}>
            Enter the invite code shared by a friend.
          </p>
          <input
            autoFocus
            placeholder="XXX-XXX"
            value={inviteCode}
            maxLength={7}
            onChange={e => { setInviteCode(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.input, color: theme.text, fontSize: '1.2rem', outline: 'none', fontFamily: 'inherit', textAlign: 'center', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '12px' }}
          />
          {error && <p style={{ color: theme.danger, fontSize: '0.82rem', marginBottom: '10px' }}>{error}</p>}
          <button onClick={handleJoin} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: theme.accent, color: 'white', fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer' }}>
            Join Server
          </button>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children, theme }) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ backgroundColor: theme.surface, borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '380px', border: `1px solid ${theme.border}`, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h3 style={{ color: theme.text, fontWeight: '800', fontSize: '1.1rem' }}>{title}</h3>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '8px', border: 'none', backgroundColor: theme.card, color: theme.textSecondary, cursor: 'pointer', fontSize: '0.9rem' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default ServerList;