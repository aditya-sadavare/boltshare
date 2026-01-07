import { io, Socket } from 'socket.io-client';
import { SIGNALING_SERVER_URL } from '../constants';

class SignalingService {
  private socket: Socket | null = null;
  private callbacks: Map<string, (data: any) => void[]> = new Map(); // ← Array of callbacks
  private socketId: string | null = null;

  connect() {
    if (!this.socket) {
      this.socket = io(SIGNALING_SERVER_URL, {
        transports: ["websocket"]
      });
      
      this.socket.on('connect', () => {
        this.socketId = this.socket!.id;
        console.log('✅ Connected to signaling server:', this.socketId);
      });

      this.socket.on('receiver-joined', (id) => this.trigger('receiver-joined', id));
      this.socket.on('offer', (data) => {
        console.log('📥 Offer received from:', data.sender);
        this.trigger('offer', { ...data, sender: data.sender });
      });
      this.socket.on('answer', (data) => {
        console.log('📥 Answer received from:', data.sender);
        this.trigger('answer', { ...data, sender: data.sender });
      });
      this.socket.on('candidate', (data) => {
        this.trigger('candidate', data);
      });
      this.socket.on('session-error', (err) => this.trigger('error', err));
    }
    return this.socket;
  }

  createSession(sessionId: string) {
    this.socket?.emit('create-session', sessionId);
  }

  joinSession(sessionId: string) {
    this.socket?.emit('join-session', sessionId);
  }

  sendOffer(target: string, offer: RTCSessionDescriptionInit) {
    this.socket?.emit('offer', { target, offer });
  }

  sendAnswer(target: string, answer: RTCSessionDescriptionInit) {
    this.socket?.emit('answer', { target, answer });
  }

  sendCandidate(target: string, candidate: RTCIceCandidate) {
    this.socket?.emit('candidate', { target, candidate });
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, []);
    }
    this.callbacks.get(event)!.push(callback); // ← Add to array, don't overwrite
  }

  private trigger(event: string, data: any) {
    const callbacks = this.callbacks.get(event) || [];
    callbacks.forEach(callback => callback(data)); // ← Call all callbacks
  }
  
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const signaling = new SignalingService();