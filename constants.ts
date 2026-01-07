export const SIGNALING_SERVER_URL = 'http://localhost:3001'; // Update for production
export const CHUNK_SIZE = 64 * 1024; // 64KB chunks for stability
export const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // In production, add TURN servers here for reliable Internet Mode
  ],
};
