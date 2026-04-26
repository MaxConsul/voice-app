import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

function ChannelList({ server, activeChannelId, channelUsers, onJoinChannel, onLeaveChannel, isAdmin, profile, activeServerId }) {
  const { theme } = useTheme();
  const [showCreate, setShowCreate] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [copied, setCopied] = useState(false);
  const [socket, setSocket] = useState(null);

  const copyInvite = () => {
    navigator.clipboard.writeText(server.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const playSound = (freqStart, freqEnd) => {
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.setValueAtTime(freqStart, ctx.currentTime);
      o.frequency.setValueAtTime(freqEnd, ctx.currentTime + 0.1);
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.4);
    } catch (e) {}
  };

  return (
    <div style={{ width: '240px', backgroundColor: theme.surface, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${theme.border}`, flexShrink: 0 }}>

      {/* Server Header */}
      <div style={{ padding: '16px', borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <span style={{ fontSize: '1.6rem' }}>{server.icon}</span>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <h3 style={{ color: theme.text, fontWeight: '800', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{server.name}</h3>
            <p style={{ color: theme.textSecondary, fontSize: '0.75rem' }}>{server.memberCount} member{server.memberCount !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Invite code */}
        <div style={{ backgroundColor: theme.card, borderRadius: '8px', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: `1px solid ${theme.border}` }}>
          <div>
            <p style={{ color: theme.textSecondary, fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invite Code</p>
            <p style={{ color: theme.text, fontWeight: '800', fontSize: '0.88rem', letterSpacing: '2px' }}>{server.id}</p>
          </div>
          <button onClick={copyInvite} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', backgroundColor: copied ? theme.success : theme.accent, color: 'white', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer' }}>
            {copied ? '✓' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Channels */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', marginBottom: '6px' }}>
          <p style={{ color: theme.textSecondary, fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Voice Channels
          </p>
          {isAdmin && (
            <button
              onClick={() => setShowCreate(true)}
              title="Add Channel"
              style={{ width: 20, height: 20, borderRadius: '4px', border: 'none', backgroundColor: 'transparent', color: theme.textSecondary, cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}
            >
              +
            </button>
          )}
        </div>

        {server.channels.map(ch => {
          const usersInChannel = channelUsers[ch.id] || [];
          const isActive = activeChannelId === ch.id;
          const iAmInChannel = usersInChannel.find(u => u.id === profile?.socketId);

          return (
            <div key={ch.id}>
              <button
                onClick={() => {
                  playSound(520, 660);
                  onJoinChannel(ch);
                }}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: '8px', border: 'none',
                  backgroundColor: isActive ? theme.accent + '33' : 'transparent',
                  color: isActive ? theme.accent : theme.textSecondary,
                  cursor: 'pointer', textAlign: 'left', fontSize: '0.92rem', fontWeight: isActive ? '700' : '500',
                  display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px',
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>🔊</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.name}</span>
                {usersInChannel.length > 0 && (
                  <span style={{ backgroundColor: theme.success + '33', color: theme.success, fontSize: '0.68rem', fontWeight: '700', padding: '1px 6px', borderRadius: '8px' }}>
                    {usersInChannel.length}
                  </span>
                )}
              </button>

              {/* Users in channel */}
              {usersInChannel.length > 0 && (
                <div style={{ paddingLeft: '28px', marginBottom: '4px' }}>
                  {usersInChannel.map(u => (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 6px', borderRadius: '6px' }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: '800', color: 'white', flexShrink: 0 }}>
                        {u.username[0].toUpperCase()}
                      </div>
                      <span style={{ color: theme.textSecondary, fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {u.username}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create Channel Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: theme.surface, borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '360px', border: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ color: theme.text, fontWeight: '800' }}>Create Channel</h3>
              <button onClick={() => setShowCreate(false)} style={{ width: 32, height: 32, borderRadius: '8px', border: 'none', backgroundColor: theme.card, color: theme.textSecondary, cursor: 'pointer' }}>✕</button>
            </div>
            <input
              autoFocus
              placeholder="Channel name (e.g. Gaming)"
              value={channelName}
              onChange={e => setChannelName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (() => {
                if (channelName.trim()) {
                  onJoinChannel(null, channelName.trim());
                  setChannelName('');
                  setShowCreate(false);
                }
              })()}
              style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.input, color: theme.text, fontSize: '0.95rem', outline: 'none', fontFamily: 'inherit', marginBottom: '12px' }}
            />
            <button
              onClick={() => {
                if (channelName.trim()) {
                  onJoinChannel(null, channelName.trim());
                  setChannelName('');
                  setShowCreate(false);
                }
              }}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: theme.accent, color: 'white', fontWeight: '700', cursor: 'pointer' }}
            >
              Create Channel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChannelList;