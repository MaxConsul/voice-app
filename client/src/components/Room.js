import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import Soundboard from './Soundboard';
import Audex from './Audex';

function Avatar({ profile, size = 40, speaking = false, muted = false, deafened = false }) {
  const ring = speaking && !muted ? '0 0 0 3px #2ecc71' : 'none';
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        overflow: 'hidden', boxShadow: ring,
        transition: 'box-shadow 0.15s ease',
        backgroundColor: profile.color,
        backgroundImage: profile.photo ? `url(${profile.photo})` : 'none',
        backgroundSize: 'cover', backgroundPosition: 'center',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.36, fontWeight: '800', color: 'white',
      }}>
        {!profile.photo && profile.initials}
      </div>
      {(muted || deafened) && (
        <div style={{
          position: 'absolute', bottom: -2, right: -2,
          backgroundColor: '#e74c3c', borderRadius: '50%',
          width: size * 0.38, height: size * 0.38,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.2, border: '2px solid white'
        }}>
          {deafened ? '🔇' : '🎙'}
        </div>
      )}
    </div>
  );
}

function Room({ roomInfo, profile, socket, onLeave }) {
  const { theme, mode, toggleTheme } = useTheme();
  const channelId = roomInfo?.code;
  const serverId = roomInfo?.serverId;
  const username = profile?.username;

  const [users, setUsers] = useState([]);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [unread, setUnread] = useState(0);
  const [userStatuses, setUserStatuses] = useState({});
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [toast, setToast] = useState(null);
  const [audexOpen, setAudexOpen] = useState(false);
  const [audexActive, setAudexActive] = useState(false);
  const [audexJoining, setAudexJoining] = useState(false);

  const peersRef = useRef({});
  const streamRef = useRef(null);
  const audioRefs = useRef({});
  const chatBottomRef = useRef(null);
  const fileInputRef = useRef();
  const deafenedRef = useRef(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
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

  const startSpeakingDetection = (stream) => {
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 512;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const detect = () => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setSpeaking(avg > 10);
      requestAnimationFrame(detect);
    };
    detect();
  };

  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    let localStream = null;

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      localStream = stream;
      streamRef.current = stream;
      startSpeakingDetection(stream);

      // ── Define WebRTC helpers inside effect so they close over stream ──

      const _createPeerConnection = (targetId) => {
        if (peersRef.current[targetId]) {
          peersRef.current[targetId].close();
        }
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ]
        });
        
        // Make sure we add audio tracks properly
        const audioTracks = stream.getAudioTracks();
        console.log('Adding tracks to peer:', targetId, 'tracks:', audioTracks.length);
        stream.getTracks().forEach(track => {
          const sender = pc.addTrack(track, stream);
          console.log('Added track:', track.kind, track.enabled, track.readyState);
        });

        pc.onicecandidate = (e) => {
          if (e.candidate) socket.emit('ice-candidate', { target: targetId, candidate: e.candidate });
        };
        pc.ontrack = (e) => {
          // Reuse existing audio element if possible
          if (!audioRefs.current[targetId]) {
            audioRefs.current[targetId] = new Audio();
          }
          const audio = audioRefs.current[targetId];
          audio.srcObject = e.streams[0];
          audio.autoplay = true;
          audio.muted = deafenedRef.current;
          // Append to DOM to prevent garbage collection
          audio.style.display = 'none';
          document.body.appendChild(audio);
          audio.play().catch(() => {});
        };
        pc.onconnectionstatechange = () => {
          console.log(`Peer ${targetId}: ${pc.connectionState}`);
        };
        pc.onsignalingstatechange = () => {
          console.log(`Peer ${targetId} signaling: ${pc.signalingState}`);
        };
        peersRef.current[targetId] = pc;
        return pc;
      };

      const _createOffer = async (targetId) => {
        console.log('Creating offer to:', targetId);
        const pc = _createPeerConnection(targetId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { target: targetId, offer });
      };

      // ── Existing users when joining ──────────────────────────
      const handleExistingUsers = ({ users: existingUsers, channelId: cId }) => {
        if (cId !== channelId) return;
        console.log('Existing users in channel:', existingUsers);
        setUsers(existingUsers);
        existingUsers.forEach(user => _createOffer(user.id));
      };

      // ── New user joined ──────────────────────────────────────
      const handleUserJoined = (user) => {
        if (user.channelId !== channelId) return;
        console.log('New user joined channel:', user);
        setUsers(prev => {
          if (prev.find(u => u.id === user.id)) return prev;
          return [...prev, user];
        });
        playSound(520, 660);
      };

      // ── WebRTC: Offer received ───────────────────────────────
      const handleOffer = async ({ from, offer }) => {
        console.log('Received offer from:', from);
        const pc = _createPeerConnection(from);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { target: from, answer });
      };

      // ── WebRTC: Answer received ──────────────────────────────
      const handleAnswer = async ({ from, answer }) => {
        console.log('Received answer from:', from);
        const pc = peersRef.current[from];
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          } catch (e) {
            console.warn('Error setting remote description:', e);
          }
        }
      };

      // ── WebRTC: ICE candidate ────────────────────────────────
      const handleIce = ({ from, candidate }) => {
        const pc = peersRef.current[from];
        if (pc) pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.warn('ICE error:', e));
      };

      // ── User left ────────────────────────────────────────────
      const handleUserLeft = (id) => {
        console.log('User left:', id);
        if (peersRef.current[id]) {
          peersRef.current[id].close();
          delete peersRef.current[id];
        }
        if (audioRefs.current[id]) {
          audioRefs.current[id].pause();
          delete audioRefs.current[id];
        }
        setUsers(prev => prev.filter(u => u.id !== id));
        playSound(660, 520);
      };

      const handleUserStatus = ({ id, muted, deafened }) => {
        setUserStatuses(prev => ({ ...prev, [id]: { muted, deafened } }));
      };

      const handleChatMessage = (msg) => {
        setMessages(prev => [...prev, msg]);
        if (msg.username !== username) {
          setChatOpen(prev => {
            if (!prev) setUnread(u => u + 1);
            return prev;
          });
          showToast(msg);
          if (document.hidden) {
            new Notification(`${msg.username}`, {
              body: msg.type === 'image' ? '📷 Sent an image' : msg.message
            });
          }
        }
      };

      const handlePlaySound = ({ soundData, soundName }) => {
        if (!deafenedRef.current) {
          const audio = new Audio(soundData);
          audio.play().catch(() => {});
          showToast({ username: '🔊 Soundboard', message: soundName, type: 'text' });
        }
      };

      socket.on('audex-invited', () => {
        setAudexJoining(true);
        setTimeout(() => {
          setAudexJoining(false);
          setAudexActive(true);
        }, 3500);
      });

      // Register listeners
      socket.on('channel-existing-users', handleExistingUsers);
      socket.on('user-joined-channel', handleUserJoined);
      socket.on('offer', handleOffer);
      socket.on('answer', handleAnswer);
      socket.on('ice-candidate', handleIce);
      socket.on('user-left', handleUserLeft);
      socket.on('user-status', handleUserStatus);
      socket.on('chat-message', handleChatMessage);
      socket.on('play-sound', handlePlaySound);

      // Wait for stream to be fully active before joining
      const tracks = stream.getAudioTracks();
      if (tracks.length > 0) {
        tracks[0].enabled = true;
      }

      // Small delay to ensure stream is ready
      setTimeout(() => {
        console.log('Room mounted, joining channel:', channelId);
        console.log('Audio tracks:', stream.getAudioTracks().map(t => `${t.label} enabled:${t.enabled} readyState:${t.readyState}`));
        socket.emit('join-channel', { channelId, serverId, username });
      }, 500);

      // Cleanup
      return () => {
        // ... existing cleanup ...
        // Remove audio elements from DOM
        Object.values(audioRefs.current).forEach(audio => {
          audio.pause();
          if (audio.parentNode) audio.parentNode.removeChild(audio);
        });
        audioRefs.current = {};
      };
    }).catch(err => {
      console.error('Microphone error:', err);
    });
  }, [channelId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleMute = () => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(prev => {
      const newMuted = !prev;
      socket.emit('user-status', channelId, { muted: newMuted, deafened: deafenedRef.current });
      return newMuted;
    });
  };

  const toggleDeafen = () => {
    setDeafened(prev => {
      const newDeafened = !prev;
      deafenedRef.current = newDeafened;
      const track = streamRef.current?.getAudioTracks()[0];
      if (track) track.enabled = !newDeafened;
      setMuted(newDeafened);
      Object.values(audioRefs.current).forEach(audio => { audio.muted = newDeafened; });
      socket.emit('user-status', channelId, { muted: newDeafened, deafened: newDeafened });
      return newDeafened;
    });
  };

  const leaveRoom = () => {
    // Stop mic tracks
    streamRef.current?.getTracks().forEach(t => t.stop());
    // Close peer connections
    Object.values(peersRef.current).forEach(pc => pc.close());
    peersRef.current = {};
    // Tell server we left the channel
    socket.emit('leave-channel', { channelId, serverId });
    onLeave();
  };

  const sendMessage = () => {
    if (!messageInput.trim()) return;
    const msg = messageInput.trim();

    // Check if it's an Audex command
    if (msg.startsWith('!') && audexActive) {
      const parts = msg.slice(1).split(' ');
      const command = parts[0];
      const args = parts.slice(1).join(' ');
      socket.emit('audex-command', { command, args, channelId, username });
      // Also show the command in chat so others see it
      socket.emit('chat-message', channelId, msg, username);
      setMessageInput('');
      return;
    }

    socket.emit('chat-message', channelId, msg, username);
    setMessageInput('');
  };

  const sendImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2MB.'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const confirmSendImage = () => {
    if (!imagePreview) return;
    socket.emit('chat-image', channelId, imagePreview, username);
    setImagePreview(null);
  };

  const toggleChat = () => {
    setChatOpen(prev => !prev);
    setSoundboardOpen(false);
    setAudexOpen(false);
    setUnread(0);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: theme.bg }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 1000, backgroundColor: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '14px', padding: '14px 18px', width: '280px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '800', fontSize: '0.9rem', flexShrink: 0 }}>
            {toast.username[0].toUpperCase()}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <p style={{ color: theme.text, fontWeight: '700', fontSize: '0.85rem' }}>{toast.username}</p>
            <p style={{ color: theme.textSecondary, fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {toast.type === 'image' ? '📷 Sent an image' : toast.message}
            </p>
          </div>
        </div>
      )}

      {/* Voice Panel */}
      <div style={{ width: '260px', backgroundColor: theme.surface, borderRight: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        {/* Channel Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: theme.textSecondary, fontSize: '0.9rem' }}>🔊</span>
            <h3 style={{ color: theme.text, fontWeight: '800', fontSize: '0.95rem' }}>
              {roomInfo?.name || 'Channel'}
            </h3>
          </div>
        </div>

        {/* Users List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          <p style={{ color: theme.textSecondary, fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', paddingLeft: '4px' }}>
            Participants — {users.length + 1}
          </p>

          {/* You */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '10px', marginBottom: '4px', backgroundColor: theme.card }}>
            <Avatar profile={profile} size={34} speaking={speaking} muted={muted} deafened={deafened} />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <p style={{ color: theme.text, fontWeight: '700', fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {username} (you)
              </p>
              <p style={{ color: theme.textSecondary, fontSize: '0.74rem' }}>
                {deafened ? 'Deafened' : muted ? 'Muted' : speaking ? 'Speaking...' : 'Connected'}
              </p>
            </div>
          </div>

          {/* Others */}
          {users.map(user => {
            const status = userStatuses[user.id] || {};
            return (
              <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '10px', marginBottom: '4px' }}>
                <Avatar
                  profile={{ initials: user.username[0].toUpperCase(), color: '#3498db', photo: null }}
                  size={34}
                  muted={status.muted}
                  deafened={status.deafened}
                />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <p style={{ color: theme.text, fontWeight: '600', fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user.username}
                  </p>
                  <p style={{ color: theme.textSecondary, fontSize: '0.74rem' }}>
                    {status.deafened ? 'Deafened' : status.muted ? 'Muted' : 'Connected'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Controls */}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Avatar profile={profile} size={32} />
          <div style={{ flex: 1 }} />

          <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} style={{ width: 34, height: 34, borderRadius: '10px', border: 'none', backgroundColor: muted ? theme.danger : theme.card, color: muted ? 'white' : theme.textSecondary, cursor: 'pointer', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {muted ? '🔇' : '🎤'}
          </button>

          <button onClick={toggleDeafen} title={deafened ? 'Undeafen' : 'Deafen'} style={{ width: 34, height: 34, borderRadius: '10px', border: 'none', backgroundColor: deafened ? theme.danger : theme.card, color: deafened ? 'white' : theme.textSecondary, cursor: 'pointer', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {deafened ? '🔕' : '🎧'}
          </button>

          <button onClick={toggleChat} title="Chat" style={{ width: 34, height: 34, borderRadius: '10px', border: 'none', backgroundColor: chatOpen ? theme.accent : theme.card, color: chatOpen ? 'white' : theme.textSecondary, cursor: 'pointer', fontSize: '0.95rem', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            💬
            {unread > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, backgroundColor: theme.danger, color: 'white', borderRadius: '50%', width: 16, height: 16, fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800' }}>
                {unread}
              </span>
            )}
          </button>

          <button onClick={() => { setSoundboardOpen(p => !p); setChatOpen(false); }} title="Soundboard" style={{ width: 34, height: 34, borderRadius: '10px', border: 'none', backgroundColor: soundboardOpen ? theme.accent : theme.card, color: soundboardOpen ? 'white' : theme.textSecondary, cursor: 'pointer', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            🎵
          </button>

          {/* Audex — only show if active */}
          {audexActive && (
            <button
              onClick={() => { setAudexOpen(p => !p); setChatOpen(false); setSoundboardOpen(false); }}
              title="Audex Music Bot"
              style={{ width: 34, height: 34, borderRadius: '10px', border: 'none', backgroundColor: audexOpen ? theme.accent : theme.card, color: audexOpen ? 'white' : theme.textSecondary, cursor: 'pointer', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              🤖
            </button>
          )}

          <button onClick={leaveRoom} title="Leave Channel" style={{ width: 34, height: 34, borderRadius: '10px', border: 'none', backgroundColor: theme.danger, color: 'white', cursor: 'pointer', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✕
          </button>
        </div>
      </div>

      {/* Chat Panel */}
      {chatOpen && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: theme.bg }}>
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.surface }}>
            <h3 style={{ color: theme.text, fontWeight: '800' }}>💬 {roomInfo?.name}</h3>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', marginTop: '4rem' }}>
                <p style={{ fontSize: '2rem', marginBottom: '8px' }}>💬</p>
                <p style={{ color: theme.textSecondary }}>No messages yet. Say hi!</p>
              </div>
            )}
            {messages.map((msg, i) => {
              const isSelf = msg.username === username;
              const isBot = msg.isBot;
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isBot ? 'flex-start' : isSelf ? 'flex-end' : 'flex-start' }}>
                  {(!isSelf || isBot) && (
                    <p style={{ color: isBot ? theme.accent : theme.textSecondary, fontSize: '0.78rem', marginBottom: '4px', paddingLeft: '4px', fontWeight: isBot ? '700' : '400' }}>
                      {msg.username}
                    </p>
                  )}
                  {msg.type === 'image'
                    ? <img src={msg.message} alt="shared" style={{ maxWidth: '260px', borderRadius: '12px', cursor: 'pointer' }}
                        onClick={() => { const w = window.open(); w.document.write(`<img src="${msg.message}" style="max-width:100%;height:auto;" />`); }} />
                    : <div style={{
                        backgroundColor: isBot ? theme.card : isSelf ? theme.accent : theme.surface,
                        padding: '10px 14px',
                        borderRadius: isBot ? '4px 14px 14px 14px' : isSelf ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        maxWidth: '320px',
                        border: isBot ? `1px solid ${theme.accent}44` : `1px solid ${theme.border}`,
                        borderLeft: isBot ? `3px solid ${theme.accent}` : undefined,
                      }}>
                        <p style={{ color: isBot ? theme.text : isSelf ? 'white' : theme.text, wordBreak: 'break-word', fontSize: '0.9rem', whiteSpace: 'pre-line' }}>
                          {msg.message}
                        </p>
                      </div>
                  }
                  <p style={{ color: theme.textSecondary, fontSize: '0.7rem', marginTop: '3px', paddingLeft: '4px', paddingRight: '4px' }}>{msg.time}</p>
                </div>
              );
            })}
            <div ref={chatBottomRef} />
          </div>

          <div style={{ borderTop: `1px solid ${theme.border}`, backgroundColor: theme.surface }}>
            {imagePreview && (
              <div style={{ padding: '12px 24px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={imagePreview} alt="preview" style={{ maxHeight: '160px', maxWidth: '220px', borderRadius: '10px', display: 'block' }} />
                  <button onClick={() => setImagePreview(null)} style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', border: 'none', backgroundColor: theme.danger, color: 'white', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800' }}>✕</button>
                </div>
                <button onClick={confirmSendImage} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', backgroundColor: theme.accent, color: 'white', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem', flexShrink: 0 }}>Send</button>
              </div>
            )}
            <div style={{ padding: '16px 24px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={sendImage} />
              <button onClick={() => fileInputRef.current.click()} style={{ width: 38, height: 38, borderRadius: '10px', border: 'none', backgroundColor: theme.card, color: theme.textSecondary, cursor: 'pointer', fontSize: '1.1rem', flexShrink: 0 }}>🖼</button>
              <input
                style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.input, color: theme.text, fontSize: '0.95rem', outline: 'none', fontFamily: 'inherit' }}
                placeholder="Type a message..."
                value={messageInput}
                onChange={e => setMessageInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
              />
              <button onClick={sendMessage} style={{ width: 38, height: 38, borderRadius: '10px', border: 'none', backgroundColor: theme.accent, color: 'white', cursor: 'pointer', fontSize: '1rem', flexShrink: 0 }}>➤</button>
            </div>
          </div>
        </div>
      )}

      {/* Soundboard Panel */}
      {soundboardOpen && (
        <Soundboard socket={socket} roomId={channelId} username={username} />
      )}

      {/* Audex Panel */}
      {audexOpen && (
        <Audex
          socket={socket}
          channelId={channelId}
          username={username}
          isActive={audexActive}
          onInvite={() => {
            socket.emit('audex-invite', { channelId });
            setAudexActive(true);
          }}
        />
      )}

      {/* Audex Joining Animation */}
      {audexJoining && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 5000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>

            {/* Animated bot icon */}
            <div style={{
              width: 100, height: 100, borderRadius: '28px',
              backgroundColor: theme.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '3rem',
              boxShadow: `0 0 60px ${theme.accent}88`,
              animation: 'audexPop 0.5s ease',
            }}>
              🤖
            </div>

            {/* Connecting dots */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} style={{
                  width: i === 2 ? 10 : 7,
                  height: i === 2 ? 10 : 7,
                  borderRadius: '50%',
                  backgroundColor: theme.accent,
                  opacity: 0.3,
                  animation: `audexDot 1s ${i * 0.15}s infinite`,
                }} />
              ))}
            </div>

            <div>
              <p style={{ color: 'white', fontWeight: '800', fontSize: '1.3rem', marginBottom: '6px' }}>
                Audex is joining...
              </p>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.88rem' }}>
                Setting up your music bot 🎵
              </p>
            </div>

            {/* Progress bar */}
            <div style={{ width: 220, height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                backgroundColor: theme.accent,
                borderRadius: 2,
                animation: 'audexProgress 3.5s linear forwards',
              }} />
            </div>

            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem' }}>
              Powered by Audex v1.0
            </p>
          </div>
        </div>
      )}

      
    </div>
  );
}

export default Room;