import { useState } from 'react';
import Lobby from './components/Lobby';
import Room from './components/Room';

function App() {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');

  const handleJoin = (room, name) => {
    setRoomId(room);
    setUsername(name);
    setJoined(true);
  };

  return (
    <div>
      {!joined
        ? <Lobby onJoin={handleJoin} />
        : <Room roomId={roomId} username={username} />
      }
    </div>
  );
}

export default App;