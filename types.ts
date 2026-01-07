export interface FileMetadata {
  name: string;
  size: number;
  type: string;
}

export enum TransferState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  TRANSFERRING = 'TRANSFERRING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface TransferProgress {
  bytesReceived: number;
  totalBytes: number;
  speed: number; // bytes per second
  eta: number; // seconds
  mode: 'LAN' | 'Internet' | 'Detecting...';
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'candidate' | 'join';
  payload: any;
}
