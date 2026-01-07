import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Health check (important for Render)
app.get('/', (req, res) => {
  res.send('WebRTC Signaling Server is running 🚀');
});

// Store active sessions
const sessions = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-session', (sessionId) => {
    socket.join(sessionId);
    sessions.set(sessionId, { sender: socket.id, created: Date.now() });
    console.log(`Session created: ${sessionId}`);
  });

  socket.on('join-session', (sessionId) => {
    const session = sessions.get(sessionId);
    if (session) {
      socket.join(sessionId);
      io.to(session.sender).emit('receiver-joined', socket.id);
      console.log(`Receiver joined session: ${sessionId}`);
    } else {
      socket.emit('session-error', 'Session not found or expired');
    }
  });

  socket.on('offer', ({ target, offer }) => {
    io.to(target).emit('offer', { sender: socket.id, offer });
  });

  socket.on('answer', ({ target, answer }) => {
    io.to(target).emit('answer', { sender: socket.id, answer });
  });

  socket.on('candidate', ({ target, candidate }) => {
    io.to(target).emit('candidate', { sender: socket.id, candidate });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Auto-clean stale sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.created > 10 * 60 * 1000) {
      sessions.delete(id);
    }
  }
}, 60000);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Signaling server running on port ${PORT}`);
});
