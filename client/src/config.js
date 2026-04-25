const isProduction = window.location.hostname !== 'localhost';

export const SOCKET_URL = isProduction
  ? window.location.origin
  : 'http://localhost:5000';