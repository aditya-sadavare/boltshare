import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all for P2P signaling
    methods: ["GET", "POST"]
  }
});

// Store active sessions roughly (auto-expiry logic handles cleanup)
const sessions = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User creates a session to send a file
  socket.on('create-session', (sessionId) => {
    socket.join(sessionId);
    sessions.set(sessionId, { sender: socket.id, created: Date.now() });
    console.log(`Session created: ${sessionId}`);
  });

  // Receiver joins a session
  socket.on('join-session', (sessionId) => {
    const session = sessions.get(sessionId);
    if (session) {
      socket.join(sessionId);
      // Notify sender that receiver joined
      io.to(session.sender).emit('receiver-joined', socket.id);
      console.log(`Receiver joined session: ${sessionId}`);
    } else {
      socket.emit('session-error', 'Session not found or expired');
    }
  });

  // WebRTC Signaling: Offer
  socket.on('offer', ({ target, offer }) => {
    io.to(target).emit('offer', { sender: socket.id, offer });
  });

  // WebRTC Signaling: Answer
  socket.on('answer', ({ target, answer }) => {
    io.to(target).emit('answer', { sender: socket.id, answer });
  });

  // WebRTC Signaling: ICE Candidate
  socket.on('candidate', ({ target, candidate }) => {
    io.to(target).emit('candidate', { sender: socket.id, candidate });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Cleanup logic could be added here
  });
});

// Auto-cleanup stale sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.created > 10 * 60 * 1000) {
      sessions.delete(id);
    }
  }
}, 60000);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});