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
      pc.current?.close();
      window.removeEventListener('resize', compute);
    };
  }, []);

  const setupWebRTC = async () => {
    pc.current = new RTCPeerConnection(ICE_SERVERS);

    // ICE Connection State Debugging
    pc.current.oniceconnectionstatechange = () => {
      console.log('🔌 ICE State:', pc.current?.iceConnectionState);
      if (pc.current?.iceConnectionState === 'failed') {
        setStatus('❌ ICE Failed - Check Network/TURN');
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

    // Connection State
    pc.current.onconnectionstatechange = () => {
      const state = pc.current?.connectionState;
      console.log('Connection state:', state);
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
    
    // CRITICAL: onopen must fire before sending data
    dc.current.onopen = () => {
       console.log('✅ DataChannel Open (SENDER)');
       setStatus('Ready to send');
       sendMetadata();
    };
    
    dc.current.onerror = (e) => {
      console.error('❌ DataChannel Error:', e);
      setStatus('DataChannel Error');
    };
    
    dc.current.onclose = () => console.log('DataChannel Closed (Sender)');

    // CRITICAL: Wait for receiver to join BEFORE sending offer
    signaling.on('receiver-joined', async (receiverId) => {
      peerIdRef.current = receiverId;
      console.log('📢 Receiver joined:', receiverId);
      setStatus('Receiver found, exchanging keys...');
      
      // NOW send offer to the specific receiver
      const offer = await pc.current!.createOffer();
      await pc.current!.setLocalDescription(offer);
      signaling.sendOffer(receiverId, offer);
      console.log('📤 Offer sent to:', receiverId);
    });

    // Listen for Answer - CRITICAL: Only set remote description once
    signaling.on('answer', async ({ answer, sender }) => {
      if (pc.current && !pc.current.currentRemoteDescription) {
        await pc.current.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('📥 Answer received from:', sender);
      }
    });

    // Listen for ICE Candidates - CRITICAL: Only add after setRemoteDescription
    signaling.on('candidate', async ({ candidate }) => {
      if (pc.current && pc.current.remoteDescription) {
        try {
          await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('✅ ICE candidate added');
        } catch (e) {
          console.error('❌ Error adding ICE candidate:', e);
        }
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
    // CRITICAL: ondatachannel fires when sender creates channel
    pc.current!.ondatachannel = (e) => {
      dc.current = e.channel;
      console.log('✅ DataChannel received (RECEIVER)');
      
      dc.current.onopen = () => {
        console.log('✅ DataChannel Open (RECEIVER)');
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

    // Listen for Offer
    signaling.on('offer', async ({ offer, sender }) => {
      peerIdRef.current = sender;
      console.log('📥 Offer received from:', sender);
      await pc.current!.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await pc.current!.createAnswer();
      await pc.current!.setLocalDescription(answer);
      signaling.sendAnswer(sender, answer); // Send answer back to the sender
      console.log('📤 Answer sent to:', sender);
    });

    // Listen for ICE Candidates - CRITICAL: Only add after setRemoteDescription
    signaling.on('candidate', async ({ candidate }) => {
      if (pc.current && pc.current.remoteDescription) {
        try {
          await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('✅ ICE candidate added');
        } catch (e) {
          console.error('❌ Error adding ICE candidate:', e);
        }
      }
    });
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