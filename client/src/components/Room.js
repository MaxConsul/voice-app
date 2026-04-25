import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import Soundboard from './Soundboard';

function Avatar({ profile, size = 40, speaking = false, muted = false, deafened = false }) {
  const ring = speaking && !muted
    ? '0 0 0 3px #2ecc71'
    : 'none';

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
      {/* Status icon */}
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
  const roomId = roomInfo?.code;
  const username = profile?.username;

  const [users, setUsers] = useState([]);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [joinRequests, setJoinRequests] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [unread, setUnread] = useState(0);
  const [copied, setCopied] = useState(false);
  const [userStatuses, setUserStatuses] = useState({});
  const [soundboardOpen, setSoundboardOpen] = useState(false);

  const peersRef = useRef({});
  const streamRef = useRef(null);
  const audioRefs = useRef({});
  const chatBottomRef = useRef(null);
  const fileInputRef = useRef();

  const [imagePreview, setImagePreview] = useState(null);
  const [toast, setToast] = useState(null);

  // Sounds
  const playSound = (freqStart, freqEnd) => {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.setValueAtTime(freqStart, ctx.currentTime);
    o.frequency.setValueAtTime(freqEnd, ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.4);
  };

  // Speaking detection
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
    // Browser notifications permission
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      streamRef.current = stream;
      startSpeakingDetection(stream);
      socket.emit('join-room', roomId, username);

      socket.on('joined-success', ({ isOwner }) => setIsOwner(isOwner));
      socket.on('you-are-owner', () => setIsOwner(true));

      socket.on('existing-users', (existingUsers) => {
        setUsers(existingUsers);
        existingUsers.forEach(user => createOffer(user.id, stream));
      });

      socket.on('user-joined', (user) => {
        setUsers(prev => [...prev, user]);
        playSound(520, 660);
        if (document.hidden) {
          new Notification('Pinnacle', { body: `${user.username} joined the room` });
        }
      });

      socket.on('offer', async ({ from, offer }) => {
        const pc = createPeerConnection(from, stream);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { target: from, answer });
      });

      socket.on('answer', async ({ from, answer }) => {
        const pc = peersRef.current[from];
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
      });

      socket.on('ice-candidate', ({ from, candidate }) => {
        const pc = peersRef.current[from];
        if (pc) pc.addIceCandidate(new RTCIceCandidate(candidate));
      });

      socket.on('user-left', (id) => {
        if (peersRef.current[id]) {
          peersRef.current[id].close();
          delete peersRef.current[id];
        }
        setUsers(prev => prev.filter(u => u.id !== id));
        playSound(660, 520);
      });

      socket.on('join-request', ({ id, username: requester }) => {
        setJoinRequests(prev => [...prev, { id, username: requester }]);
        if (document.hidden) {
          new Notification('Pinnacle', { body: `${requester} wants to join` });
        }
      });

      socket.on('user-status', ({ id, muted, deafened }) => {
        setUserStatuses(prev => ({ ...prev, [id]: { muted, deafened } }));
      });

      socket.on('chat-message', (msg) => {
        setMessages(prev => [...prev, msg]);
        if (msg.username !== username) {
          if (!chatOpen) {
            setUnread(u => u + 1);
            // Show toast
            setToast(msg);
            setTimeout(() => setToast(null), 3500);
          }
          if (document.hidden) {
            new Notification(`${msg.username}`, { body: msg.type === 'image' ? '📷 Sent an image' : msg.message });
          }
        }
      });

      socket.on('play-sound', ({ soundData, soundName }) => {
        if (!deafened) {
          const audio = new Audio(soundData);
          audio.play();
          setToast({ username: '🔊 Soundboard', message: soundName, type: 'text' });
          setTimeout(() => setToast(null), 3500);
        }
      });

    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const createPeerConnection = (targetId, stream) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('ice-candidate', { target: targetId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      const audio = new Audio();
      audio.srcObject = e.streams[0];
      audioRefs.current[targetId] = audio;
      if (!deafened) audio.play();
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
    const track = streamRef.current.getAudioTracks()[0];
    track.enabled = !track.enabled;
    setMuted(prev => {
      socket.emit('user-status', roomId, { muted: !prev, deafened });
      return !prev;
    });
  };

  const toggleDeafen = () => {
    setDeafened(prev => {
      const newDeafened = !prev;
      // Mute mic too when deafening
      if (newDeafened) {
        streamRef.current.getAudioTracks()[0].enabled = false;
        setMuted(true);
      } else {
        streamRef.current.getAudioTracks()[0].enabled = true;
        setMuted(false);
      }
      // Mute/unmute all incoming audio
      Object.values(audioRefs.current).forEach(audio => {
        audio.muted = newDeafened;
      });
      socket.emit('user-status', roomId, { muted: newDeafened, deafened: newDeafened });
      return newDeafened;
    });
  };

  const leaveRoom = () => {
    streamRef.current.getTracks().forEach(track => track.stop());
    Object.values(peersRef.current).forEach(pc => pc.close());
    socket.disconnect();
    onLeave();
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const approveUser = (guestId, guestUsername) => {
    socket.emit('approve-join', roomId, guestId, guestUsername);
    setJoinRequests(prev => prev.filter(r => r.id !== guestId));
  };

  const rejectUser = (guestId) => {
    socket.emit('reject-join', roomId, guestId);
    setJoinRequests(prev => prev.filter(r => r.id !== guestId));
  };

  const sendMessage = () => {
    if (!messageInput.trim()) return;
    socket.emit('chat-message', roomId, messageInput, username);
    setMessageInput('');
  };

  const sendImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2MB.'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview(ev.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const confirmSendImage = () => {
    if (!imagePreview) return;
    socket.emit('chat-image', roomId, imagePreview, username);
    setImagePreview(null);
  };

  const toggleChat = () => {
    setChatOpen(prev => !prev);
    setSoundboardOpen(false);
    setUnread(0);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: theme.bg }}>

      {/* Join Request Popups */}
      <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* Toast notification */}
        {toast && (
          <div style={{
            backgroundColor: theme.surface, border: `1px solid ${theme.border}`,
            borderRadius: '14px', padding: '14px 18px', width: '280px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            animation: 'slideIn 0.3s ease',
            display: 'flex', alignItems: 'center', gap: '10px'
          }}>
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

        {/* Join Request Popups */}
        {joinRequests.map(req => (
          <div key={req.id} style={{ backgroundColor: theme.surface, border: `1px solid ${theme.accent}`, borderRadius: '14px', padding: '18px 20px', width: '280px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '800', fontSize: '0.9rem' }}>
                {req.username[0].toUpperCase()}
              </div>
              <div>
                <p style={{ color: theme.text, fontWeight: '700', fontSize: '0.9rem' }}>{req.username}</p>
                <p style={{ color: theme.textSecondary, fontSize: '0.78rem' }}>wants to join</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => approveUser(req.id, req.username)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', backgroundColor: theme.success, color: 'white', fontWeight: '700', cursor: 'pointer' }}>
                Accept
              </button>
              <button onClick={() => rejectUser(req.id)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', backgroundColor: theme.danger, color: 'white', fontWeight: '700', cursor: 'pointer' }}>
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Voice Panel */}
      <div style={{ width: '280px', backgroundColor: theme.surface, borderRight: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        {/* Room Header */}
        <div style={{ padding: '20px', borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <h3 style={{ color: theme.text, fontWeight: '800', fontSize: '1rem' }}>
              {roomInfo?.name || `Room ${roomId}`}
            </h3>
            {isOwner && (
              <span style={{ backgroundColor: theme.warning + '33', color: theme.warning, fontSize: '0.7rem', fontWeight: '700', padding: '2px 8px', borderRadius: '20px' }}>
                OWNER
              </span>
            )}
          </div>

          {/* Room Code + Copy */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: theme.textSecondary, fontSize: '0.8rem', letterSpacing: '2px', fontWeight: '700' }}>{roomId}</span>
            <button onClick={copyCode} style={{ padding: '3px 10px', borderRadius: '6px', border: 'none', backgroundColor: copied ? theme.success : theme.card, color: copied ? 'white' : theme.textSecondary, fontSize: '0.75rem', cursor: 'pointer', fontWeight: '600' }}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Users List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          <p style={{ color: theme.textSecondary, fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', paddingLeft: '4px' }}>
            Participants — {users.length + 1}
          </p>

          {/* You */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '10px', marginBottom: '4px', backgroundColor: theme.card }}>
            <Avatar profile={profile} size={36} speaking={speaking} muted={muted} deafened={deafened} />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <p style={{ color: theme.text, fontWeight: '700', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{username} (you)</p>
              <p style={{ color: theme.textSecondary, fontSize: '0.75rem' }}>
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
                  size={36}
                  muted={status.muted}
                  deafened={status.deafened}
                />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <p style={{ color: theme.text, fontWeight: '600', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.username}</p>
                  <p style={{ color: theme.textSecondary, fontSize: '0.75rem' }}>
                    {status.deafened ? 'Deafened' : status.muted ? 'Muted' : 'Connected'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Controls */}
        <div style={{ padding: '16px', borderTop: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Avatar profile={profile} size={34} />

          <div style={{ flex: 1 }} />

          {/* Mute */}
          <button
            onClick={toggleMute}
            title={muted ? 'Unmute' : 'Mute'}
            style={{
              width: 36,
              height: 36,
              borderRadius: '10px',
              border: 'none',
              backgroundColor: muted ? theme.danger : theme.card,
              color: muted ? 'white' : theme.textSecondary,
              cursor: 'pointer',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {muted ? '🔇' : '🎤'}
          </button>

          {/* Deafen */}
          <button
            onClick={toggleDeafen}
            title={deafened ? 'Undeafen' : 'Deafen'}
            style={{
              width: 36,
              height: 36,
              borderRadius: '10px',
              border: 'none',
              backgroundColor: deafened ? theme.danger : theme.card,
              color: deafened ? 'white' : theme.textSecondary,
              cursor: 'pointer',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {deafened ? '🔕' : '🎧'}
          </button>

          {/* Chat */}
          <button onClick={toggleChat} title="Chat" style={{ width: 36, height: 36, borderRadius: '10px', border: 'none', backgroundColor: chatOpen ? theme.accent : theme.card, color: chatOpen ? 'white' : theme.textSecondary, cursor: 'pointer', fontSize: '1rem', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            💬
            {unread > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, backgroundColor: theme.danger, color: 'white', borderRadius: '50%', width: 16, height: 16, fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800' }}>
                {unread}
              </span>
            )}
          </button>

          {/* Soundboard */}
          <button
            onClick={() => { setSoundboardOpen(prev => !prev); setChatOpen(false); }}
            title="Soundboard"
            style={{ width: 36, height: 36, borderRadius: '10px', border: 'none', backgroundColor: soundboardOpen ? theme.accent : theme.card, color: soundboardOpen ? 'white' : theme.textSecondary, cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            🎵
          </button>

          {/* Leave */}
          <button onClick={leaveRoom} title="Leave" style={{ width: 36, height: 36, borderRadius: '10px', border: 'none', backgroundColor: theme.danger, color: 'white', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✕
          </button>
        </div>
      </div>

      {/* Chat Panel */}
      {chatOpen && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: theme.bg }}>
          <div style={{ padding: '20px 24px', borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.surface }}>
            <h3 style={{ color: theme.text, fontWeight: '800' }}>Chat</h3>
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
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isSelf ? 'flex-end' : 'flex-start' }}>
                  {!isSelf && <p style={{ color: theme.textSecondary, fontSize: '0.78rem', marginBottom: '4px', paddingLeft: '4px' }}>{msg.username}</p>}
                  {msg.type === 'image'
                    ? <img
                        src={msg.message}
                        alt="shared"
                        style={{ maxWidth: '260px', borderRadius: '12px', cursor: 'pointer' }}
                        onClick={() => {
                          const win = window.open();
                          win.document.write(`<img src="${msg.message}" style="max-width:100%;height:auto;" />`);
                        }}
                      />
                    : (
                      <div style={{ backgroundColor: isSelf ? theme.accent : theme.surface, padding: '10px 14px', borderRadius: isSelf ? '14px 14px 4px 14px' : '14px 14px 14px 4px', maxWidth: '320px', border: `1px solid ${theme.border}` }}>
                        <p style={{ color: isSelf ? 'white' : theme.text, wordBreak: 'break-word', fontSize: '0.95rem' }}>{msg.message}</p>
                      </div>
                    )}
                  <p style={{ color: theme.textSecondary, fontSize: '0.7rem', marginTop: '3px', paddingLeft: '4px', paddingRight: '4px' }}>{msg.time}</p>
                </div>
              );
            })}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Input */}
          <div style={{ borderTop: `1px solid ${theme.border}`, backgroundColor: theme.surface }}>

            {/* Image Preview */}
            {imagePreview && (
              <div style={{ padding: '12px 24px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={imagePreview} alt="preview" style={{ maxHeight: '160px', maxWidth: '220px', borderRadius: '10px', display: 'block' }} />
                  <button
                    onClick={() => setImagePreview(null)}
                    style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', border: 'none', backgroundColor: theme.danger, color: 'white', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800' }}
                  >
                    ✕
                  </button>
                </div>
                <button
                  onClick={confirmSendImage}
                  style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', backgroundColor: theme.accent, color: 'white', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem', flexShrink: 0 }}
                >
                  Send
                </button>
              </div>
            )}

            {/* Input Row */}
            <div style={{ padding: '16px 24px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={sendImage} />
              <button onClick={() => fileInputRef.current.click()} style={{ width: 38, height: 38, borderRadius: '10px', border: 'none', backgroundColor: theme.card, color: theme.textSecondary, cursor: 'pointer', fontSize: '1.1rem', flexShrink: 0 }}>
                🖼
              </button>
              <input
                style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.input, color: theme.text, fontSize: '0.95rem', outline: 'none', fontFamily: 'inherit' }}
                placeholder="Type a message..."
                value={messageInput}
                onChange={e => setMessageInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
              />
              <button onClick={sendMessage} style={{ width: 38, height: 38, borderRadius: '10px', border: 'none', backgroundColor: theme.accent, color: 'white', cursor: 'pointer', fontSize: '1rem', flexShrink: 0 }}>
                ➤
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Soundboard Panel */}
      {soundboardOpen && (
        <Soundboard socket={socket} roomId={roomId} username={username} />
      )}

      {/* Theme toggle floating */}
      <button
        onClick={toggleTheme}
        style={{ position: 'fixed', bottom: '80px', right: '20px', width: 40, height: 40, borderRadius: '50%', border: 'none', backgroundColor: theme.card, color: theme.text, cursor: 'pointer', fontSize: '1rem', boxShadow: '0 2px 12px rgba(0,0,0,0.2)' }}
      >
        {mode === 'dark' ? '☀️' : '🌙'}
      </button>
    </div>
  );
}

export default Room;