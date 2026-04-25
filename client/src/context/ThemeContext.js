import { createContext, useContext, useState } from 'react';

const ThemeContext = createContext();

export const themes = {
  dark: {
    bg: '#0e0e16',
    surface: '#1a1a2e',
    card: '#16213e',
    cardHover: '#0f3460',
    accent: '#e94560',
    accentHover: '#c73652',
    text: '#ffffff',
    textSecondary: '#a0a0b0',
    border: '#2a2a3e',
    input: '#0f1923',
    success: '#2ecc71',
    danger: '#e74c3c',
    warning: '#f39c12',
    bubble: '#0f3460',
    bubbleSelf: '#e94560',
  },
  light: {
    bg: '#f0f2f5',
    surface: '#ffffff',
    card: '#f7f8fa',
    cardHover: '#e8eaf0',
    accent: '#e94560',
    accentHover: '#c73652',
    text: '#111122',
    textSecondary: '#666680',
    border: '#dde1ee',
    input: '#eef0f5',
    success: '#27ae60',
    danger: '#c0392b',
    warning: '#e67e22',
    bubble: '#e8eaf0',
    bubbleSelf: '#e94560',
  }
};

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState('dark');
  const theme = themes[mode];
  const toggleTheme = () => setMode(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, mode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}