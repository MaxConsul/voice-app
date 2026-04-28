import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';

function TextChat({ socket, channelId, serverId, channelName, profile }) {
  const { theme } = useTheme();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    // Load message history
    socket.emit('get-text-messages', { channelId });

    socket.on('text-messages', ({ channelId: cId, messages }) => {
      if (cId === channelId) setMessages(messages);
    });

    socket.on('text-message', (msg) => {
      if (msg.channelId === channelId) {
        setMessages(prev => [...prev, msg]);
      }
    });

    return () => {
      socket.off('text-messages');
      socket.off('text-message');
    };
  }, [channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim()) return;
    socket.emit('text-message', {
      channelId,
      serverId,
      message: input.trim(),
      username: profile.username,
    });
    setInput('');
  };

  const sendImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image.'); return; }
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2MB.'); return; }
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const confirmSendImage = () => {
    if (!imagePreview) return;
    socket.emit('text-message', {
      channelId,
      serverId,
      message: imagePreview,
      username: profile.username,
      type: 'image',
    });
    setImagePreview(null);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: theme.bg }}>

      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.surface, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ color: theme.textSecondary, fontSize: '1.1rem' }}>📢</span>
        <h3 style={{ color: theme.text, fontWeight: '800', fontSize: '0.95rem' }}>{channelName}</h3>
        <span style={{ color: theme.textSecondary, fontSize: '0.78rem' }}>— Server text channel</span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: '4rem' }}>
            <p style={{ fontSize: '2rem', marginBottom: '8px' }}>📢</p>
            <p style={{ color: theme.text, fontWeight: '700', marginBottom: '4px' }}>Welcome to #{channelName}!</p>
            <p style={{ color: theme.textSecondary, fontSize: '0.88rem' }}>This is the beginning of the server chat.</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isSelf = msg.username === profile.username;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isSelf ? 'flex-end' : 'flex-start' }}>
              {!isSelf && (
                <p style={{ color: theme.textSecondary, fontSize: '0.78rem', marginBottom: '4px', paddingLeft: '4px' }}>
                  {msg.username}
                </p>
              )}
              {msg.type === 'image'
                ? <img src={msg.message} alt="shared" style={{ maxWidth: '260px', borderRadius: '12px', cursor: 'pointer' }}
                    onClick={() => { const w = window.open(); w.document.write(`<img src="${msg.message}" style="max-width:100%;height:auto;" />`); }} />
                : <div style={{ backgroundColor: isSelf ? theme.accent : theme.surface, padding: '10px 14px', borderRadius: isSelf ? '14px 14px 4px 14px' : '14px 14px 14px 4px', maxWidth: '400px', border: `1px solid ${theme.border}` }}>
                    <p style={{ color: isSelf ? 'white' : theme.text, wordBreak: 'break-word', fontSize: '0.95rem' }}>{msg.message}</p>
                  </div>
              }
              <p style={{ color: theme.textSecondary, fontSize: '0.7rem', marginTop: '3px', paddingLeft: '4px', paddingRight: '4px' }}>{msg.time}</p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop: `1px solid ${theme.border}`, backgroundColor: theme.surface }}>
        {imagePreview && (
          <div style={{ padding: '12px 24px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img src={imagePreview} alt="preview" style={{ maxHeight: '160px', maxWidth: '220px', borderRadius: '10px', display: 'block' }} />
              <button onClick={() => setImagePreview(null)} style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', border: 'none', backgroundColor: theme.danger, color: 'white', cursor: 'pointer', fontSize: '0.7rem', fontWeight: '800' }}>✕</button>
            </div>
            <button onClick={confirmSendImage} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', backgroundColor: theme.accent, color: 'white', fontWeight: '700', cursor: 'pointer' }}>Send</button>
          </div>
        )}
        <div style={{ padding: '16px 24px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={sendImage} />
          <button onClick={() => fileRef.current.click()} style={{ width: 38, height: 38, borderRadius: '10px', border: 'none', backgroundColor: theme.card, color: theme.textSecondary, cursor: 'pointer', fontSize: '1.1rem' }}>🖼</button>
          <input
            style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.input, color: theme.text, fontSize: '0.95rem', outline: 'none', fontFamily: 'inherit' }}
            placeholder={`Message #${channelName}`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
          />
          <button onClick={sendMessage} style={{ width: 38, height: 38, borderRadius: '10px', border: 'none', backgroundColor: theme.accent, color: 'white', cursor: 'pointer', fontSize: '1rem' }}>➤</button>
        </div>
      </div>
    </div>
  );
}

export default TextChat;