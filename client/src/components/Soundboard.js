import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

const MAX_SOUNDS = 10;
const MAX_DURATION = 5;

function Soundboard({ socket, channelId, username, serverId }) {
  const { theme } = useTheme();
  const [sounds, setSounds] = useState([]);
  const [playing, setPlaying] = useState(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [trimming, setTrimming] = useState(null);
  const fileRef = useRef();

  // ── Load server soundboard on mount ──────────────────────────
  useEffect(() => {
    socket.emit('soundboard-get', { serverId });

    socket.on('soundboard-update', ({ sounds }) => {
      setSounds(sounds);
    });

    return () => {
      socket.off('soundboard-update');
    };
  }, [serverId]);

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
        const name = file.name.replace(/\.[^/.]+$/, '').slice(0, 20);
        if (audio.duration <= MAX_DURATION) {
          const sound = { id: Date.now(), name, data: ev.target.result, addedBy: username };
          socket.emit('soundboard-add', { serverId, sound });
        } else {
          setTrimming({
            name,
            data: ev.target.result,
            duration: audio.duration,
            start: 0,
            end: Math.min(MAX_DURATION, audio.duration),
          });
        }
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
    const audio = new Audio(sound.data);
    audio.play();
    setPlaying(sound.id);
    audio.onended = () => setPlaying(null);
    socket.emit('play-sound', channelId, sound.data, sound.name);
  };

  const removeSound = (soundId) => {
    socket.emit('soundboard-remove', { serverId, soundId });
  };

  const saveTrimmed = async (updatedTrimming) => {
    const t = updatedTrimming || trimming;
    if (!t) return;
    try {
      const trimmed = await trimAudio(t.data, t.start, t.end);
      const sound = { id: Date.now(), name: t.name, data: trimmed, addedBy: username };
      socket.emit('soundboard-add', { serverId, sound });
      setTrimming(null);
    } catch (e) {
      setError('Failed to trim audio. Please try another file.');
    }
  };

  const trimAudio = (dataUrl, start, end) => {
    return new Promise((resolve, reject) => {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      fetch(dataUrl)
        .then(r => r.arrayBuffer())
        .then(buf => audioCtx.decodeAudioData(buf))
        .then(decoded => {
          const sampleRate = decoded.sampleRate;
          const startSample = Math.floor(start * sampleRate);
          const endSample = Math.floor(end * sampleRate);
          const frameCount = endSample - startSample;
          const trimmedBuffer = audioCtx.createBuffer(
            decoded.numberOfChannels, frameCount, sampleRate
          );
          for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
            const original = decoded.getChannelData(ch);
            trimmedBuffer.copyToChannel(original.slice(startSample, endSample), ch);
          }
          const wavData = bufferToWave(trimmedBuffer, frameCount);
          const blob = new Blob([wavData], { type: 'audio/wav' });
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result);
          reader.readAsDataURL(blob);
        })
        .catch(reject);
    });
  };

  const bufferToWave = (abuffer, len) => {
    const numOfChan = abuffer.numberOfChannels;
    const length = len * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let offset = 0;
    let pos = 0;

    const setUint16 = (data) => { view.setUint16(pos, data, true); pos += 2; };
    const setUint32 = (data) => { view.setUint32(pos, data, true); pos += 4; };

    setUint32(0x46464952);
    setUint32(length - 8);
    setUint32(0x45564157);
    setUint32(0x20746d66);
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164);
    setUint32(length - pos - 4);

    for (let i = 0; i < abuffer.numberOfChannels; i++) {
      channels.push(abuffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }
    return buffer;
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: theme.bg }}>

      {/* Trimmer Modal */}
      {trimming && (
        <TrimmerModal
          trimming={trimming}
          setTrimming={setTrimming}
          saveTrimmed={saveTrimmed}
          theme={theme}
        />
      )}

      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.surface }}>
        <h3 style={{ color: theme.text, fontWeight: '800' }}>Soundboard</h3>
        <p style={{ color: theme.textSecondary, fontSize: '0.8rem', marginTop: '2px' }}>
          Shared sounds for this server — everyone hears them! 🔊
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
            borderRadius: '14px', padding: '28px', textAlign: 'center',
            cursor: 'pointer', backgroundColor: dragging ? theme.accent + '11' : 'transparent',
            transition: 'all 0.2s ease', marginBottom: '20px'
          }}
        >
          <p style={{ fontSize: '1.8rem', marginBottom: '8px' }}>🎵</p>
          <p style={{ color: theme.text, fontWeight: '700', marginBottom: '4px' }}>
            Drop a sound here or click to upload
          </p>
          <p style={{ color: theme.textSecondary, fontSize: '0.82rem' }}>
            MP3, WAV, OGG · Sounds over 5s can be trimmed · {sounds.length}/{MAX_SOUNDS}
          </p>
          <input ref={fileRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleFileChange} />
        </div>

        {error && (
          <div style={{ backgroundColor: theme.danger + '22', border: `1px solid ${theme.danger}`, borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
            <p style={{ color: theme.danger, fontSize: '0.88rem' }}>{error}</p>
          </div>
        )}

        {sounds.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '3rem' }}>
            <p style={{ color: theme.textSecondary, fontSize: '0.9rem' }}>No sounds yet. Upload your first meme sound! 🔊</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
            {sounds.map(sound => (
              <div key={sound.id} style={{
                backgroundColor: theme.surface,
                border: `1px solid ${playing === sound.id ? theme.accent : theme.border}`,
                borderRadius: '14px', padding: '16px 12px', display: 'flex',
                flexDirection: 'column', alignItems: 'center', gap: '10px',
                position: 'relative', transition: 'all 0.2s ease',
                boxShadow: playing === sound.id ? `0 0 12px ${theme.accent}44` : 'none'
              }}>
                <button onClick={() => removeSound(sound.id)} style={{
                  position: 'absolute', top: 8, right: 8, width: 20, height: 20,
                  borderRadius: '50%', border: 'none', backgroundColor: theme.card,
                  color: theme.textSecondary, cursor: 'pointer', fontSize: '0.65rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800'
                }}>✕</button>

                <button onClick={() => playSound(sound)} style={{
                  width: 56, height: 56, borderRadius: '50%', border: 'none',
                  backgroundColor: playing === sound.id ? theme.accent : theme.card,
                  color: playing === sound.id ? 'white' : theme.textSecondary,
                  cursor: 'pointer', fontSize: '1.4rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  transform: playing === sound.id ? 'scale(1.08)' : 'scale(1)'
                }}>
                  {playing === sound.id ? '🔊' : '▶'}
                </button>

                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: theme.text, fontSize: '0.82rem', fontWeight: '700', wordBreak: 'break-word', lineHeight: '1.3' }}>
                    {sound.name}
                  </p>
                  {sound.addedBy && (
                    <p style={{ color: theme.textSecondary, fontSize: '0.7rem', marginTop: '2px' }}>
                      by {sound.addedBy}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Trimmer Modal ─────────────────────────────────────────────────
function TrimmerModal({ trimming, setTrimming, saveTrimmed, theme }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const audioRef = useRef(null);
  const animRef = useRef(null);

  const duration = trimming.duration;
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(Math.min(5, duration));
  const [previewing, setPreviewing] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [dragStartX, setDragStartX] = useState(null);
  const [dragStartValues, setDragStartValues] = useState(null);
  const [waveform, setWaveform] = useState(null);
  const [playhead, setPlayhead] = useState(null);

  const trimDuration = end - start;
  const isValid = trimDuration > 0 && trimDuration <= 5;

  useEffect(() => {
    const decode = async () => {
      try {
        const res = await fetch(trimming.data);
        const arrayBuf = await res.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const decoded = await audioCtx.decodeAudioData(arrayBuf);
        const raw = decoded.getChannelData(0);
        const samples = 300;
        const blockSize = Math.floor(raw.length / samples);
        const peaks = [];
        for (let i = 0; i < samples; i++) {
          let max = 0;
          for (let j = 0; j < blockSize; j++) {
            const val = Math.abs(raw[i * blockSize + j]);
            if (val > max) max = val;
          }
          peaks.push(max);
        }
        setWaveform(peaks);
      } catch (e) {
        setWaveform(Array(300).fill(0.5));
      }
    };
    decode();
    return () => {
      if (audioRef.current) audioRef.current.pause();
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  useEffect(() => {
    if (!waveform || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const startPct = start / duration;
    const endPct = end / duration;
    const startX = startPct * W;
    const endX = endPct * W;

    ctx.fillStyle = theme.card;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, startX, H);
    ctx.fillRect(endX, 0, W - endX, H);

    ctx.fillStyle = isValid ? 'rgba(233,69,96,0.15)' : 'rgba(231,76,60,0.15)';
    ctx.fillRect(startX, 0, endX - startX, H);

    const barW = W / waveform.length;
    waveform.forEach((peak, i) => {
      const x = i * barW;
      const barH = peak * H * 0.85;
      const inRegion = x >= startX && x <= endX;
      ctx.fillStyle = inRegion
        ? (isValid ? '#e94560' : '#e74c3c')
        : 'rgba(255,255,255,0.15)';
      ctx.fillRect(x + 1, (H - barH) / 2, Math.max(barW - 1, 1), barH);
    });

    if (playhead !== null) {
      const px = (playhead / duration) * W;
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, H);
      ctx.stroke();
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(startX - 2, 0, 4, H);
    ctx.fillStyle = isValid ? '#e94560' : '#e74c3c';
    ctx.beginPath();
    ctx.roundRect(startX - 12, H / 2 - 14, 14, 28, 4);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('◀', startX - 5, H / 2 + 4);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(endX - 2, 0, 4, H);
    ctx.fillStyle = isValid ? '#e94560' : '#e74c3c';
    ctx.beginPath();
    ctx.roundRect(endX - 2, H / 2 - 14, 14, 28, 4);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.fillText('▶', endX + 5, H / 2 + 4);

  }, [waveform, start, end, duration, isValid, theme, playhead]);

  const getXPct = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const onMouseDown = (e) => {
    const pct = getXPct(e);
    const startPct = start / duration;
    const endPct = end / duration;
    const threshold = 0.04;
    if (Math.abs(pct - startPct) < threshold) {
      setDragging('start');
    } else if (Math.abs(pct - endPct) < threshold) {
      setDragging('end');
    } else if (pct > startPct && pct < endPct) {
      setDragging('region');
      setDragStartX(pct);
      setDragStartValues({ start, end });
    }
  };

  const onMouseMove = (e) => {
    if (!dragging) return;
    const pct = getXPct(e);
    const time = pct * duration;
    if (dragging === 'start') {
      const newStart = Math.max(0, Math.min(time, end - 0.1));
      setStart(parseFloat(newStart.toFixed(2)));
    } else if (dragging === 'end') {
      const newEnd = Math.min(duration, Math.max(time, start + 0.1));
      setEnd(parseFloat(newEnd.toFixed(2)));
    } else if (dragging === 'region' && dragStartX !== null) {
      const delta = (pct - dragStartX) * duration;
      let newStart = dragStartValues.start + delta;
      let newEnd = dragStartValues.end + delta;
      const regionLen = dragStartValues.end - dragStartValues.start;
      if (newStart < 0) { newStart = 0; newEnd = regionLen; }
      if (newEnd > duration) { newEnd = duration; newStart = duration - regionLen; }
      setStart(parseFloat(newStart.toFixed(2)));
      setEnd(parseFloat(newEnd.toFixed(2)));
    }
  };

  const onMouseUp = () => setDragging(null);

  const preview = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    cancelAnimationFrame(animRef.current);
    const audio = new Audio(trimming.data);
    audioRef.current = audio;
    audio.currentTime = start;
    audio.play();
    setPreviewing(true);
    setPlayhead(start);
    const startTime = performance.now();
    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const current = start + elapsed;
      if (current >= end) {
        audio.pause();
        setPreviewing(false);
        setPlayhead(null);
        return;
      }
      setPlayhead(current);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
  };

  const fmt = (s) => `${s.toFixed(1)}s`;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ backgroundColor: theme.surface, borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '520px', border: `1px solid ${theme.border}`, boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>

        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ color: theme.text, fontWeight: '800', fontSize: '1.1rem', marginBottom: '4px' }}>Trim Sound</h3>
          <p style={{ color: theme.textSecondary, fontSize: '0.82rem' }}>Drag the handles or the highlighted region — max 5 seconds</p>
        </div>

        <div style={{ backgroundColor: theme.card, borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', border: `1px solid ${theme.border}` }}>
          <p style={{ color: theme.text, fontWeight: '700', fontSize: '0.88rem' }}>🎵 {trimming.name}</p>
          <p style={{ color: theme.textSecondary, fontSize: '0.76rem', marginTop: '2px' }}>Total length: {fmt(duration)}</p>
        </div>

        <div ref={containerRef} style={{ position: 'relative', marginBottom: '12px', borderRadius: '12px', overflow: 'hidden', border: `1px solid ${theme.border}` }}>
          {!waveform ? (
            <div style={{ height: 100, backgroundColor: theme.card, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: theme.textSecondary, fontSize: '0.85rem' }}>Loading waveform...</p>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              width={460}
              height={100}
              style={{ width: '100%', height: 100, display: 'block', cursor: dragging ? 'grabbing' : 'grab' }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onTouchStart={onMouseDown}
              onTouchMove={onMouseMove}
              onTouchEnd={onMouseUp}
            />
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <span style={{ color: theme.textSecondary, fontSize: '0.76rem' }}>0s</span>
          <span style={{ color: theme.textSecondary, fontSize: '0.76rem' }}>{fmt(duration / 2)}</span>
          <span style={{ color: theme.textSecondary, fontSize: '0.76rem' }}>{fmt(duration)}</span>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <div style={{ flex: 1, backgroundColor: theme.card, borderRadius: '10px', padding: '10px 14px', border: `1px solid ${theme.border}`, textAlign: 'center' }}>
            <p style={{ color: theme.textSecondary, fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Start</p>
            <p style={{ color: theme.accent, fontWeight: '800', fontSize: '1rem' }}>{fmt(start)}</p>
          </div>
          <div style={{ flex: 1, backgroundColor: isValid ? theme.success + '22' : theme.danger + '22', borderRadius: '10px', padding: '10px 14px', border: `1px solid ${isValid ? theme.success : theme.danger}`, textAlign: 'center' }}>
            <p style={{ color: theme.textSecondary, fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Duration</p>
            <p style={{ color: isValid ? theme.success : theme.danger, fontWeight: '800', fontSize: '1rem' }}>{fmt(trimDuration)}</p>
          </div>
          <div style={{ flex: 1, backgroundColor: theme.card, borderRadius: '10px', padding: '10px 14px', border: `1px solid ${theme.border}`, textAlign: 'center' }}>
            <p style={{ color: theme.textSecondary, fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>End</p>
            <p style={{ color: theme.accent, fontWeight: '800', fontSize: '1rem' }}>{fmt(end)}</p>
          </div>
        </div>

        <p style={{ color: theme.textSecondary, fontSize: '0.78rem', textAlign: 'center', marginBottom: '20px' }}>
          {isValid
            ? '✅ Drag handles to adjust · Drag region to move · Preview to listen'
            : '❌ Selection is too long — drag the handles inward to shorten it'}
        </p>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => { if (audioRef.current) audioRef.current.pause(); setTrimming(null); }}
            style={{ flex: 1, padding: '12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: theme.textSecondary, cursor: 'pointer', fontWeight: '700', fontSize: '0.9rem' }}
          >
            Cancel
          </button>
          <button
            onClick={preview}
            disabled={previewing || !waveform}
            style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: theme.card, color: previewing ? theme.accent : theme.text, cursor: 'pointer', fontWeight: '700', fontSize: '0.9rem' }}
          >
            {previewing ? '▶ Playing...' : '▶ Preview'}
          </button>
          <button
            onClick={() => saveTrimmed({ ...trimming, start, end })}
            disabled={!isValid || !waveform}
            style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: isValid ? theme.accent : theme.card, color: isValid ? 'white' : theme.textSecondary, cursor: isValid ? 'pointer' : 'not-allowed', fontWeight: '700', fontSize: '0.9rem' }}
          >
            Save Clip
          </button>
        </div>
      </div>
    </div>
  );
}

export default Soundboard;