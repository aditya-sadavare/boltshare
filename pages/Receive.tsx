import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Scan, ArrowRight } from 'lucide-react';
import { Button } from '../components/Button';
import { signaling } from '../services/signaling';

interface ReceiveProps {
  onBack: () => void;
  onConnect: (id: string) => void;
}

export const Receive: React.FC<ReceiveProps> = ({ onBack, onConnect }) => {
  const [code, setCode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);

  // Ensure signaling is connected on mount
  useEffect(() => {
    signaling.connect();
  }, []);

  // Simplified Mock QR Logic as we don't have a reliable library in this text environment
  // In production, use `jsQR` with `requestAnimationFrame` on a canvas
  // For this output, I'll simulate the "Camera" view and allow code entry.
  // CRITICAL: Only request camera if user clicks scan.

  const startScanning = async () => {
    setError('');
    setIsScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setHasCameraPermission(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        // Here we would attach the scanning logic loop
        // scanLoop(); 
      }
    } catch (err) {
      console.error(err);
      setError('Camera access denied or unavailable.');
      setIsScanning(false);
    }
  };

  const stopScanning = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setIsScanning(false);
  };

  const handleConnect = async () => {
    if (code.length < 6) {
      setError('Invalid code');
      return;
    }
    
    console.log('🔗 Receiver: handleConnect called, code:', code);
    setIsConnecting(true);
    setError('');
    
    try {
      // CRITICAL: Wait for server to confirm session exists
      // by listening for 'offer' which comes only if sender exists
      console.log('⏳ Waiting for offer from server...');
      
      let sessionConfirmed = false;
      const timeout = new Promise<boolean>((resolve) => {
        console.log('⏰ 10 second timeout started');
        setTimeout(() => {
          console.log('⏰ Timeout fired - no offer received');
          resolve(false);
        }, 10000);
      });
      
      const confirmation = new Promise<boolean>((resolve) => {
        const handleOffer = (data: any) => {
          console.log('✅ Session confirmed! Offer received:', data);
          resolve(true);
          // Don't remove listener - we need it in Transfer component
        };
        console.log('👂 Registering offer listener');
        signaling.on('offer', handleOffer);
      });
      
      // Join session on server
      console.log('📢 Sending joinSession to server:', code);
      signaling.joinSession(code);
      
      // Wait for session confirmation or timeout
      sessionConfirmed = await Promise.race([confirmation, timeout]);
      console.log('🏁 Session confirmation result:', sessionConfirmed);
      
      if (!sessionConfirmed) {
        console.error('❌ Session not confirmed - timeout or no sender');
        setError('Session not found or sender offline');
        setIsConnecting(false);
        return;
      }
      
      console.log('✅ Moving to Transfer page');
      // NOW navigate to Transfer
      onConnect(code);
    } catch (err) {
      console.error('❌ Connection error:', err);
      setError('Connection failed');
      setIsConnecting(false);
    }
  };

  return (
    <motion.div 
      className="flex flex-col h-full gap-8"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <div className="flex items-center gap-4">
        <button onClick={() => { stopScanning(); onBack(); }} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-bold">Receive File</h2>
      </div>

      <div className="flex-1 flex flex-col gap-8">
        {!isScanning ? (
          <>
            <div className="space-y-4">
              <label className="text-zinc-400 block ml-1">Enter Share Code</label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="XY12Z3"
                  className="w-full bg-surface border border-zinc-700 rounded-2xl p-6 text-3xl font-mono text-center tracking-widest uppercase focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-zinc-700"
                />
              </div>
              {error && <p className="text-red-500 text-sm text-center">{error}</p>}
              <Button fullWidth onClick={handleConnect} disabled={code.length < 6 || isConnecting}>
                {isConnecting ? 'Connecting...' : 'Connect'}
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>

            <div className="relative flex items-center justify-center py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-800"></div>
              </div>
              <span className="relative bg-background px-4 text-zinc-500">OR</span>
            </div>

            <Button variant="secondary" fullWidth onClick={startScanning}>
              <Scan className="w-5 h-5" />
              Scan QR Code
            </Button>
          </>
        ) : (
          <div className="flex-1 flex flex-col relative bg-black rounded-3xl overflow-hidden">
             <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" />
             <div className="absolute inset-0 border-4 border-primary/50 z-10 animate-pulse"></div>
             <div className="z-20 absolute bottom-8 left-0 right-0 flex justify-center">
               <Button variant="secondary" onClick={stopScanning}>Cancel Scan</Button>
             </div>
             <div className="z-20 absolute top-8 left-0 right-0 text-center bg-black/50 p-2">
                Point camera at sender's QR
             </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};