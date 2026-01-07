import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { CircularProgress } from '../components/CircularProgress';
import { formatBytes, formatTime } from '../lib/utils';
import { signaling } from '../services/signaling';
import { ICE_SERVERS, CHUNK_SIZE } from '../constants';
import { FileMetadata, TransferProgress } from '../types';

interface TransferProps {
  role: 'SENDER' | 'RECEIVER';
  sessionId: string;
  file: File | null;
  onComplete: () => void;
}

export const Transfer: React.FC<TransferProps> = ({ role, sessionId, file, onComplete }) => {
  const [status, setStatus] = useState('Connecting...');
  const [progress, setProgress] = useState<TransferProgress>({
    bytesReceived: 0,
    totalBytes: file ? file.size : 0, // Receiver won't know initially
    speed: 0,
    eta: 0,
    mode: 'Detecting...'
  });
  
  // WebRTC Refs
  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const peerIdRef = useRef<string | null>(null); // Store peer ID for ICE candidates
  const initializationInProgress = useRef(false); // Prevent double initialization
  const [circleSize, setCircleSize] = useState(280);
  
  // Sender Refs
  const fileReader = useRef<FileReader | null>(null);
  const offset = useRef(0);
  
  // Receiver Refs
  const receivedChunks = useRef<ArrayBuffer[]>([]);
  const receivedSize = useRef(0);
  const fileMeta = useRef<FileMetadata | null>(null);
  
  // Stats
  const lastTime = useRef<number>(Date.now());
  const lastBytes = useRef<number>(0);

  useEffect(() => {
    // CRITICAL: Prevent double initialization in React StrictMode
    if (initializationInProgress.current) {
      console.log('⏭️ Initialization already in progress, skipping');
      return;
    }
    initializationInProgress.current = true;

    // CRITICAL: Initialize signaling connection FIRST
    console.log(`📍 Transfer mounted: role=${role}, sessionId=${sessionId}`);
    signaling.connect();
    
    // Note: Session creation/joining happens in Send/Receive pages
    // Transfer component just sets up WebRTC
    console.log(`🔗 Transfer ${role}: sessionId=${sessionId}`);
    
    // Close previous peer connection if it exists
    if (pc.current) {
      console.log('🔌 Closing previous peer connection');
      pc.current.close();
      pc.current = null;
    }
    
    // NOW setup WebRTC after session is initialized
    setupWebRTC();
    
    const compute = () => {
      const w = window.innerWidth;
      if (w < 640) setCircleSize(220);
      else if (w < 1024) setCircleSize(300);
      else setCircleSize(420);
    };
    compute();
    window.addEventListener('resize', compute);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', compute);
      // Don't close pc here - let it persist for the transfer
    };
  }, []); // ✅ Empty dependency array - mount only once

  const setupWebRTC = async () => {
    pc.current = new RTCPeerConnection(ICE_SERVERS);

    // ICE Connection State Debugging (REQUIRED)
    pc.current.oniceconnectionstatechange = () => {
      const state = pc.current?.iceConnectionState;
      console.log('🔌 ICE State:', state);
      if (state === 'failed') {
        setStatus('❌ ICE Failed - TURN server needed');
      } else if (state === 'connected' || state === 'completed') {
        console.log('✅ ICE Connected!');
      }
    };

    // ICE Candidates - CRITICAL: Send after peer connection created
    pc.current.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('📡 ICE Candidate:', event.candidate.candidate);
        // Store peer ID from signaling events
        const peerId = peerIdRef.current;
        if (peerId) {
          signaling.sendCandidate(peerId, event.candidate);
        }
      }
    };

    // Connection State Debugging (REQUIRED)
    pc.current.onconnectionstatechange = () => {
      const state = pc.current?.connectionState;
      console.log('🔗 Connection State:', state);
      if (state === 'connected') {
        setStatus('Connected');
        detectMode();
        if (role === 'SENDER') {
           // DataChannel is ready (handled in onopen)
        }
      } else if (state === 'failed') {
        setStatus('Connection Failed');
      }
    };

    if (role === 'SENDER') {
      setupSender();
    } else {
      setupReceiver();
    }
  };

  const detectMode = async () => {
      const stats = await pc.current?.getStats();
      let mode: 'LAN' | 'Internet' = 'Internet';
      if (stats) {
          stats.forEach(report => {
              if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                   // This is heuristic. 
                   // To be precise we need to check remoteCandidate type.
                   // But often we can't easily access the remote candidate details in all browsers directly from pair stats easily without cross-referencing.
                   // Simple check: Check RTT. LAN is usually < 10ms.
                   if (report.currentRoundTripTime < 0.015) {
                       mode = 'LAN';
                   }
              }
          });
      }
      setProgress(p => ({ ...p, mode }));
  };

  const setupSender = async () => {
    dc.current = pc.current!.createDataChannel("file-transfer", { ordered: true });
    dc.current.binaryType = "arraybuffer"; // CRITICAL for binary data
    
    console.log('📦 DataChannel created, waiting for onopen...');
    
    // CRITICAL: onopen must fire before sending data
    dc.current.onopen = () => {
       console.log('✅ DataChannel Open (SENDER) - Ready to send!');
       setStatus('Ready to send');
       sendMetadata();
    };
    
    dc.current.onerror = (e) => {
      console.error('❌ DataChannel Error:', e);
      setStatus('DataChannel Error');
    };
    
    dc.current.onclose = () => {
      console.log('⚠️ DataChannel Closed (Sender) - connection ended');
    };

    // CRITICAL: Wait for receiver to join BEFORE sending offer
    console.log('⏳ setupSender: Waiting for receiver-joined event...');
    const waitForReceiver = new Promise<string>((resolve) => {
      const handleReceiverJoined = (receiverId: string) => {
        console.log('📢 Receiver joined:', receiverId);
        resolve(receiverId);
      };
      signaling.on('receiver-joined', handleReceiverJoined);
      
      // ❌ FIX #4: Removed timeout - receiver already joined!
      // If receiver didn't join, server wouldn't emit receiver-joined event at all
    });
    
    const receiverId = await waitForReceiver;
    if (!receiverId) {
      console.error('No receiver joined');
      return;
    }
    
    peerIdRef.current = receiverId;
    setStatus('Receiver found, exchanging keys...');
    
    // NOW send offer to the specific receiver
    try {
      const offer = await pc.current!.createOffer();
      await pc.current!.setLocalDescription(offer);
      signaling.sendOffer(receiverId, offer);
      console.log('📤 Offer sent to:', receiverId);
    } catch (err) {
      console.error('❌ Error creating/sending offer:', err);
      setStatus('Error creating offer');
      return;
    }

    // Listen for Answer - CRITICAL: Only set remote description once
    // ✅ Already globally registered, just consume it
    signaling.on('answer', async ({ answer, sender }) => {
      if (pc.current && !pc.current.currentRemoteDescription) {
        try {
          await pc.current.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('📥 Answer received from:', sender);
        } catch (err) {
          console.error('❌ Error setting answer:', err);
        }
      }
    });

    // Listen for ICE Candidates - CRITICAL: Only add after setRemoteDescription
    // ✅ Already globally registered, just consume it
    signaling.on('candidate', async ({ candidate }) => {
      if (pc.current && pc.current.remoteDescription) {
        try {
          await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('✅ ICE candidate added');
        } catch (e) {
          console.error('❌ Error adding ICE candidate:', e);
        }
      } else {
        console.log('⏳ Candidate arrived before remote description, will be buffered on receiver side');
      }
    });
    
    // Flow control: request-chunk from receiver
    dc.current.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'request-chunk') {
            sendChunk();
        }
    };
  };

  const setupReceiver = () => {
    // ✅ FIX #2: Buffer for ICE candidates that arrive before setRemoteDescription
    const pendingCandidates: RTCIceCandidateInit[] = [];

    // CRITICAL: ondatachannel fires when sender creates channel
    pc.current!.ondatachannel = (e) => {
      dc.current = e.channel;
      dc.current.binaryType = "arraybuffer"; // CRITICAL for binary data
      console.log('✅ DataChannel received (RECEIVER)');
      
      dc.current.onopen = () => {
        console.log('✅ DataChannel Open (RECEIVER) - Ready to receive!');
        setStatus('Ready to receive');
        // Request first chunk when ready
        setTimeout(() => {
            dc.current?.send(JSON.stringify({ type: 'request-chunk' }));
        }, 100);
      };
      
      dc.current.onerror = (e) => {
        console.error('❌ DataChannel Error:', e);
        setStatus('DataChannel Error');
      };
      
      dc.current.onmessage = handleReceiveMessage;
    };

    // ✅ FIX #1: DO NOT re-register 'offer' listener here
    // It's already registered globally in signaling service
    // Instead, listen for the NEXT offer in case of reconnection
    const handleOfferOnce = async ({ offer, sender }: any) => {
      console.log('📥 [RECEIVER] Processing offer from:', sender);
      peerIdRef.current = sender;
      
      try {
        await pc.current!.setRemoteDescription(new RTCSessionDescription(offer));
        
        // ✅ FIX #2: Now process any pending ICE candidates
        console.log(`🧊 Processing ${pendingCandidates.length} pending ICE candidates`);
        for (const candidate of pendingCandidates) {
          try {
            await pc.current!.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error('❌ Error adding pending ICE candidate:', e);
          }
        }
        pendingCandidates.length = 0; // Clear buffer
        
        const answer = await pc.current!.createAnswer();
        await pc.current!.setLocalDescription(answer);
        signaling.sendAnswer(sender, answer);
        console.log('📤 Answer sent to:', sender);
      } catch (err) {
        console.error('❌ Error handling offer:', err);
      }
    };
    
    signaling.on('offer', handleOfferOnce);

    // ✅ FIX #2: Buffer ICE candidates until setRemoteDescription
    const handleCandidate = async (data: any) => {
      const { candidate } = data;
      
      if (pc.current && pc.current.remoteDescription) {
        // Remote description already set, add immediately
        try {
          await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('✅ ICE candidate added immediately');
        } catch (e) {
          console.error('❌ Error adding ICE candidate:', e);
        }
      } else {
        // Remote description not set yet, buffer it
        console.log('🧊 ICE candidate buffered (no remote description yet)');
        pendingCandidates.push(candidate);
      }
    };
    
    signaling.on('candidate', handleCandidate);
  };

  const sendMetadata = () => {
      if(!file) return;
      const meta: FileMetadata = { name: file.name, size: file.size, type: file.type };
      dc.current?.send(JSON.stringify({ type: 'metadata', payload: meta }));
      // Start sending data after brief delay
  };

  const sendChunk = () => {
    if (!file || !dc.current) return;
    
    if (offset.current >= file.size) {
        // Complete
        dc.current.send(JSON.stringify({ type: 'complete' }));
        onComplete();
        return;
    }

    const slice = file.slice(offset.current, offset.current + CHUNK_SIZE);
    const reader = new FileReader();
    reader.onload = (e) => {
        if(dc.current?.readyState === 'open') {
            dc.current.send(e.target?.result as ArrayBuffer);
            offset.current += slice.size;
            updateProgress(offset.current, file.size);
            // Wait for receiver to ask for next chunk (Backpressure handling)
            // Or simplistic mode: just send next if buffer low
            // For robustness, we implemented explicit 'request-chunk' from receiver side in this code
        }
    };
    reader.readAsArrayBuffer(slice);
  };

  const handleReceiveMessage = (e: MessageEvent) => {
      const data = e.data;
      if (typeof data === 'string') {
          const msg = JSON.parse(data);
          if (msg.type === 'metadata') {
              fileMeta.current = msg.payload;
              setProgress(p => ({ ...p, totalBytes: msg.payload.size }));
          } else if (msg.type === 'complete') {
              saveFile();
              onComplete();
          }
      } else {
          // Binary Data (Chunk)
          receivedChunks.current.push(data);
          receivedSize.current += data.byteLength;
          updateProgress(receivedSize.current, fileMeta.current?.size || 0);
          
          // Request next chunk
          dc.current?.send(JSON.stringify({ type: 'request-chunk' }));
      }
  };

  const updateProgress = (current: number, total: number) => {
      const now = Date.now();
      const timeDiff = (now - lastTime.current) / 1000; // seconds
      
      if (timeDiff > 0.5) { // Update stats every 500ms
          const bytesDiff = current - lastBytes.current;
          const speed = bytesDiff / timeDiff; // bytes/sec
          const remaining = total - current;
          const eta = speed > 0 ? remaining / speed : 0;
          
          setProgress(prev => ({
              ...prev,
              bytesReceived: current,
              totalBytes: total,
              speed,
              eta
          }));
          
          lastTime.current = now;
          lastBytes.current = current;
      } else {
          // Just update bytes
           setProgress(prev => ({ ...prev, bytesReceived: current }));
      }
  };

  const saveFile = () => {
      const blob = new Blob(receivedChunks.current, { type: fileMeta.current?.type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileMeta.current?.name || 'download';
      a.click();
      URL.revokeObjectURL(url);
  };

  const percentage = progress.totalBytes > 0 
    ? (progress.bytesReceived / progress.totalBytes) * 100 
    : 0;

  return (
     <div className="flex flex-col items-center justify-center h-full gap-12 px-4 md:px-8">
      <div className="relative">
        <CircularProgress progress={percentage} size={circleSize} />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div style={{ width: circleSize - 40, height: circleSize - 40 }} className="rounded-full border-2 border-dashed border-zinc-800 animate-[spin_10s_linear_infinite]" />
        </div>
      </div>

      <div className="text-center space-y-2 w-full max-w-xs md:max-w-md lg:max-w-lg">
        <motion.h3 
          layout 
          className="text-xl font-medium truncate"
        >
          {role === 'SENDER' ? `Sending ${file?.name}` : `Receiving ${fileMeta.current?.name || 'File'}...`}
        </motion.h3>
        
        <div className="grid grid-cols-2 gap-4 text-sm text-zinc-400 bg-surface p-4 rounded-xl border border-zinc-800">
           <div className="flex flex-col">
             <span>Speed</span>
             <span className="text-white font-mono">{formatBytes(progress.speed)}/s</span>
           </div>
           <div className="flex flex-col text-right">
             <span>ETA</span>
             <span className="text-white font-mono">{formatTime(progress.eta)}</span>
           </div>
           <div className="flex flex-col">
             <span>Size</span>
             <span className="text-white font-mono">{formatBytes(progress.bytesReceived)} / {formatBytes(progress.totalBytes)}</span>
           </div>
           <div className="flex flex-col text-right">
             <span>Mode</span>
             <span className={`font-bold ${progress.mode === 'LAN' ? 'text-success' : 'text-blue-400'}`}>
                {progress.mode}
             </span>
           </div>
        </div>
      </div>

      <p className="text-zinc-500 text-sm animate-pulse">{status}</p>
    </div>
  );
};