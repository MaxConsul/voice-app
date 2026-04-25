import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

const COLORS = [
  '#e94560', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#e91e63',
  '#00bcd4', '#8bc34a', '#ff5722', '#607d8b'
];

function AvatarSetup({ onDone }) {
  const { theme, mode, toggleTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState('');

  const initials = username.trim()
    ? username.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const handleDone = () => {
    if (!username.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (username.trim().length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }
    onDone({ username: username.trim(), color, initials });
  };

  return (
    <div style={{ ...styles.container, backgroundColor: theme.bg }}>

      {/* Theme Toggle */}
      <button style={{ ...styles.themeBtn, backgroundColor: theme.card, color: theme.text }} onClick={toggleTheme}>
        {mode === 'dark' ? '☀️ Light' : '🌙 Dark'}
      </button>

      <div style={{ ...styles.card, backgroundColor: theme.surface, border: `1px solid ${theme.border}` }}>

        <h1 style={{ ...styles.title, color: theme.accent }}>Pinnacle</h1>
        <p style={{ ...styles.subtitle, color: theme.textSecondary }}>Set up your profile to get started</p>

        {/* Avatar Preview */}
        <div style={{ ...styles.avatar, backgroundColor: color }}>
          {initials}
        </div>

        {/* Name Input */}
        <input
          style={{ ...styles.input, backgroundColor: theme.input, color: theme.text, border: `1px solid ${theme.border}` }}
          placeholder="Enter your name"
          value={username}
          maxLength={24}
          onChange={e => { setUsername(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleDone()}
          autoFocus
        />
        {error && <p style={styles.error}>{error}</p>}

        {/* Color Picker */}
        <p style={{ ...styles.colorLabel, color: theme.textSecondary }}>Choose your color</p>
        <div style={styles.colorGrid}>
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                ...styles.colorDot,
                backgroundColor: c,
                transform: color === c ? 'scale(1.25)' : 'scale(1)',
                boxShadow: color === c ? `0 0 0 3px ${theme.bg}, 0 0 0 5px ${c}` : 'none',
              }}
            />
          ))}
        </div>

        {/* Continue Button */}
        <button
          style={{ ...styles.button, backgroundColor: theme.accent }}
          onClick={handleDone}
        >
          Continue
        </button>

      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  themeBtn: { position: 'absolute', top: '20px', right: '20px', padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600' },
  card: { borderRadius: '20px', padding: '40px', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' },
  title: { fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.5px' },
  subtitle: { fontSize: '0.95rem', marginTop: '-8px' },
  avatar: { width: '90px', height: '90px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: '800', color: 'white', letterSpacing: '1px', marginBottom: '8px' },
  input: { width: '100%', padding: '12px 16px', borderRadius: '10px', fontSize: '1rem', outline: 'none', fontFamily: 'inherit' },
  error: { color: '#e94560', fontSize: '0.85rem', alignSelf: 'flex-start', marginTop: '-8px' },
  colorLabel: { fontSize: '0.85rem', alignSelf: 'flex-start', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' },
  colorGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', width: '100%' },
  colorDot: { width: '36px', height: '36px', borderRadius: '50%', border: 'none', cursor: 'pointer', transition: 'transform 0.15s ease, box-shadow 0.15s ease' },
  button: { width: '100%', padding: '13px', borderRadius: '10px', border: 'none', color: 'white', fontSize: '1rem', fontWeight: '700', cursor: 'pointer', marginTop: '8px' },
};

export default AvatarSetup;