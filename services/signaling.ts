import { io, Socket } from 'socket.io-client';
import { SIGNALING_SERVER_URL } from '../constants';

class SignalingService {
  private socket: Socket | null = null;
  private callbacks: Map<string, (data: any) => void> = new Map();

  connect() {
    if (!this.socket) {
      this.socket = io(SIGNALING_SERVER_URL);
      
      this.socket.on('connect', () => {
        console.log('Connected to signaling server');
      });

      this.socket.on('receiver-joined', (id) => this.trigger('receiver-joined', id));
      this.socket.on('offer', (data) => this.trigger('offer', data));
      this.socket.on('answer', (data) => this.trigger('answer', data));
      this.socket.on('candidate', (data) => this.trigger('candidate', data));
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
    this.callbacks.set(event, callback);
  }

  private trigger(event: string, data: any) {
    const callback = this.callbacks.get(event);
    if (callback) callback(data);
  }
  
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const signaling = new SignalingService();