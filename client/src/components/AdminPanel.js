import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

const ADMIN_URL = process.env.NODE_ENV === 'production'
  ? window.location.origin
  : 'http://localhost:5000';

function AdminPanel({ onClose }) {
  const { theme } = useTheme();
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const login = async () => {
    if (!password.trim()) { setError('Enter the admin password.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${ADMIN_URL}/admin/rooms`, {
        headers: { 'x-admin-password': password }
      });
      if (res.status === 401) { setError('Wrong password.'); setLoading(false); return; }
      const data = await res.json();
      setRooms(data.rooms);
      setAuthed(true);
    } catch (e) {
      setError('Could not connect to server.');
    }
    setLoading(false);
  };

  const refreshRooms = async () => {
    const res = await fetch(`${ADMIN_URL}/admin/rooms`, {
      headers: { 'x-admin-password': password }
    });
    const data = await res.json();
    setRooms(data.rooms);
  };

  const deleteRoom = async (code) => {
    setLoading(true);
    try {
      await fetch(`${ADMIN_URL}/admin/rooms/${code}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': password }
      });
      await refreshRooms();
      showSuccess(`Room ${code} deleted.`);
    } catch (e) {
      setError('Failed to delete room.');
    }
    setConfirmDelete(null);
    setLoading(false);
  };

  const deleteAllRooms = async () => {
    setLoading(true);
    try {
      await fetch(`${ADMIN_URL}/admin/rooms`, {
        method: 'DELETE',
        headers: { 'x-admin-password': password }
      });
      await refreshRooms();
      showSuccess('All rooms deleted.');
    } catch (e) {
      setError('Failed to delete all rooms.');
    }
    setConfirmDelete(null);
    setLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ backgroundColor: theme.surface, borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '540px', border: `1px solid ${theme.border}`, boxShadow: '0 24px 64px rgba(0,0,0,0.6)', maxHeight: '85vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h2 style={{ color: theme.text, fontWeight: '800', fontSize: '1.2rem' }}>🔐 Admin Panel</h2>
            <p style={{ color: theme.textSecondary, fontSize: '0.82rem', marginTop: '2px' }}>Manage active rooms</p>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: '10px', border: 'none', backgroundColor: theme.card, color: theme.textSecondary, cursor: 'pointer', fontSize: '1rem' }}>✕</button>
        </div>

        {/* Success message */}
        {successMsg && (
          <div style={{ backgroundColor: theme.success + '22', border: `1px solid ${theme.success}`, borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
            <p style={{ color: theme.success, fontSize: '0.88rem', fontWeight: '600' }}>✅ {successMsg}</p>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div style={{ backgroundColor: theme.danger + '22', border: `1px solid ${theme.danger}`, borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
            <p style={{ color: theme.danger, fontSize: '0.88rem' }}>❌ {error}</p>
          </div>
        )}

        {/* Confirm Delete Modal */}
        {confirmDelete && (
          <div style={{ backgroundColor: theme.card, border: `1px solid ${theme.danger}`, borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
            <p style={{ color: theme.text, fontWeight: '700', marginBottom: '6px' }}>
              {confirmDelete === 'all' ? '⚠️ Delete ALL rooms?' : `⚠️ Delete room ${confirmDelete}?`}
            </p>
            <p style={{ color: theme.textSecondary, fontSize: '0.85rem', marginBottom: '16px' }}>
              {confirmDelete === 'all'
                ? 'All users will be kicked out immediately.'
                : 'All users in this room will be kicked out.'}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: theme.textSecondary, cursor: 'pointer', fontWeight: '700' }}>
                Cancel
              </button>
              <button
                onClick={() => confirmDelete === 'all' ? deleteAllRooms() : deleteRoom(confirmDelete)}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: theme.danger, color: 'white', cursor: 'pointer', fontWeight: '700' }}
              >
                {loading ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        )}

        {/* Login */}
        {!authed ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              type="password"
              placeholder="Enter admin password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && login()}
              autoFocus
              style={{ padding: '12px 16px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.input, color: theme.text, fontSize: '1rem', outline: 'none', fontFamily: 'inherit' }}
            />
            <button
              onClick={login}
              disabled={loading}
              style={{ padding: '13px', borderRadius: '10px', border: 'none', backgroundColor: theme.accent, color: 'white', fontWeight: '700', fontSize: '1rem', cursor: 'pointer' }}
            >
              {loading ? 'Verifying...' : 'Login'}
            </button>
          </div>
        ) : (
          <div>
            {/* Stats bar */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <div style={{ flex: 1, backgroundColor: theme.card, borderRadius: '12px', padding: '14px', border: `1px solid ${theme.border}`, textAlign: 'center' }}>
                <p style={{ color: theme.accent, fontWeight: '800', fontSize: '1.6rem' }}>{rooms.length}</p>
                <p style={{ color: theme.textSecondary, fontSize: '0.78rem', fontWeight: '600' }}>Active Rooms</p>
              </div>
              <div style={{ flex: 1, backgroundColor: theme.card, borderRadius: '12px', padding: '14px', border: `1px solid ${theme.border}`, textAlign: 'center' }}>
                <p style={{ color: theme.accent, fontWeight: '800', fontSize: '1.6rem' }}>{rooms.reduce((a, r) => a + r.userCount, 0)}</p>
                <p style={{ color: theme.textSecondary, fontSize: '0.78rem', fontWeight: '600' }}>Total Users</p>
              </div>
              <button
                onClick={refreshRooms}
                style={{ padding: '14px', borderRadius: '12px', border: `1px solid ${theme.border}`, backgroundColor: theme.card, color: theme.textSecondary, cursor: 'pointer', fontSize: '1rem' }}
                title="Refresh"
              >
                🔄
              </button>
            </div>

            {/* Delete all button */}
            {rooms.length > 0 && (
              <button
                onClick={() => setConfirmDelete('all')}
                style={{ width: '100%', padding: '11px', borderRadius: '10px', border: `1px solid ${theme.danger}`, backgroundColor: theme.danger + '11', color: theme.danger, fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem', marginBottom: '16px' }}
              >
                🗑️ Delete All Rooms
              </button>
            )}

            {/* Room list */}
            {rooms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', backgroundColor: theme.card, borderRadius: '14px', border: `1px solid ${theme.border}` }}>
                <p style={{ fontSize: '2rem', marginBottom: '8px' }}>🏠</p>
                <p style={{ color: theme.textSecondary }}>No active rooms right now.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {rooms.map(room => (
                  <div key={room.code} style={{ backgroundColor: theme.card, borderRadius: '14px', padding: '16px 18px', border: `1px solid ${theme.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ color: theme.text, fontWeight: '800', fontSize: '1rem', letterSpacing: '2px' }}>{room.code}</span>
                          <span style={{ backgroundColor: theme.accent + '22', color: theme.accent, fontSize: '0.72rem', fontWeight: '700', padding: '2px 8px', borderRadius: '8px' }}>
                            {room.userCount} user{room.userCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <p style={{ color: theme.textSecondary, fontSize: '0.8rem' }}>Owner: <strong style={{ color: theme.warning }}>{room.owner}</strong></p>
                      </div>
                      <button
                        onClick={() => setConfirmDelete(room.code)}
                        style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', backgroundColor: theme.danger + '22', color: theme.danger, cursor: 'pointer', fontWeight: '700', fontSize: '0.8rem' }}
                      >
                        Delete
                      </button>
                    </div>

                    {/* Users in room */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {room.users.map((u, i) => (
                        <span key={i} style={{ backgroundColor: theme.surface, color: theme.textSecondary, fontSize: '0.76rem', padding: '3px 10px', borderRadius: '20px', border: `1px solid ${theme.border}`, fontWeight: u.isOwner ? '700' : '400' }}>
                          {u.isOwner ? '🎖️ ' : ''}{u.username}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminPanel;