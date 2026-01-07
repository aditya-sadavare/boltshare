export const SIGNALING_SERVER_URL = 'https://boltsharebackend.onrender.com';
export const CHUNK_SIZE = 64 * 1024; // 64KB chunks for stability
export const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:global.relay.metered.ca:80',
      username: 'fd26e7f0a8aaf72af97c4ad6',
      credential: 'sVNH8wGxLM1RgkTn'
    },
    {
      urls: 'turn:global.relay.metered.ca:80?transport=tcp',
      username: 'fd26e7f0a8aaf72af97c4ad6',
      credential: 'sVNH8wGxLM1RgkTn'
    },
    {
      urls: 'turn:global.relay.metered.ca:443',
      username: 'fd26e7f0a8aaf72af97c4ad6',
      credential: 'sVNH8wGxLM1RgkTn'
    }
  ],
};
