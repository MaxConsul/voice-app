import { useState } from 'react';
import { useTheme } from './context/ThemeContext';
import AvatarSetup from './components/AvatarSetup';
import Dashboard from './components/Dashboard';
import Room from './components/Room';

function App() {
  const { theme } = useTheme();
  const [screen, setScreen] = useState('avatar');
  const [profile, setProfile] = useState(null);
  const [roomInfo, setRoomInfo] = useState(null);
  const [socket, setSocket] = useState(null);

  const handleAvatarDone = (profileData) => {
    setProfile(profileData);
    setScreen('dashboard');
  };

  const handleJoinRoom = (room, sock) => {
    setRoomInfo(room);
    setSocket(sock);
    setScreen('room');
  };

  const handleLeaveRoom = () => {
    setRoomInfo(null);
    setSocket(null);
    setScreen('dashboard');
  };

  return (
    <div style={{ backgroundColor: theme.bg, minHeight: '100vh', color: theme.text }}>
      {screen === 'avatar' && (
        <AvatarSetup onDone={handleAvatarDone} />
      )}
      {screen === 'dashboard' && (
        <Dashboard profile={profile} onJoinRoom={handleJoinRoom} />
      )}
      {screen === 'room' && (
        <Room
          roomInfo={roomInfo}
          profile={profile}
          socket={socket}
          onLeave={handleLeaveRoom}
        />
      )}
    </div>
  );
}

export default App;