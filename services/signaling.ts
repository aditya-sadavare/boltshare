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

      this.socket.on('receiver-joined', (id) => {
        console.log('🔔 [SERVER] Receiver joined event fired:', id);
        this.trigger('receiver-joined', id);
      });
      this.socket.on('offer', (data) => {
        console.log('📥 [SERVER] Offer received from:', data.sender);
        this.trigger('offer', { ...data, sender: data.sender });
      });
      this.socket.on('answer', (data) => {
        console.log('📥 [SERVER] Answer received from:', data.sender);
        this.trigger('answer', { ...data, sender: data.sender });
      });
      this.socket.on('candidate', (data) => {
        console.log('❄️ [SERVER] ICE candidate received, triggering listeners');
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
    const callbackList = this.callbacks.get(event)!;
    console.log(`👂 [SIGNALING] Listener registered for "${event}". Total listeners: ${callbackList.length + 1}`);
    callbackList.push(callback); // ← Add to array, don't overwrite
  }

  private trigger(event: string, data: any) {
    const callbacks = this.callbacks.get(event) || [];
    console.log(`🔔 [SIGNALING] Triggering "${event}" event. Callbacks: ${callbacks.length}`);
    callbacks.forEach((callback, index) => {
      console.log(`  → Calling callback ${index + 1}/${callbacks.length}`);
      callback(data);
    });
  }
  
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const signaling = new SignalingService();