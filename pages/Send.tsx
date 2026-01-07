import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'react-qr-code';
import { FileUp, Copy, Check, ArrowLeft, FileType } from 'lucide-react';
import { Button } from '../components/Button';
import { formatBytes, generateShareCode } from '../lib/utils';
import { signaling } from '../services/signaling';

interface SendProps {
  onBack: () => void;
  onFileSelected: (file: File) => void;
  onSessionCreated: (id: string) => void;
  onReceiverConnected: () => void;
}

export const Send: React.FC<SendProps> = ({ onBack, onFileSelected, onSessionCreated, onReceiverConnected }) => {
  const [file, setFile] = useState<File | null>(null);
  const [shareCode, setShareCode] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [qrSize, setQrSize] = useState(192);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      if (w < 640) setQrSize(160);
      else if (w < 1024) setQrSize(240);
      else setQrSize(320);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  useEffect(() => {
    // Generate session immediately upon mounting or when file is selected? 
    // Flow: Select file -> Generate Code.
  }, []);

  useEffect(() => {
    // Listen for receiver join
    const handleJoin = (receiverId: string) => {
      console.log('Receiver connected:', receiverId);
      onReceiverConnected();
    };
    signaling.on('receiver-joined', handleJoin);
  }, [onReceiverConnected]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      onFileSelected(selected);
      
      // Generate code and create session
      const code = generateShareCode();
      setShareCode(code);
      onSessionCreated(code);
      signaling.createSession(code);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(shareCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div 
      className="flex flex-col h-full gap-6"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-bold">Send File</h2>
      </div>

      {!file ? (
        <div 
          className="flex-1 border-2 border-dashed border-zinc-700 rounded-3xl flex flex-col items-center justify-center p-8 gap-4 hover:border-primary/50 hover:bg-surface/50 transition-all cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileSelect}
          />
          <div className="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center">
            <FileUp className="w-10 h-10 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium">Tap to browse</p>
            <p className="text-sm text-zinc-500">or drag and drop here</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6 flex-1">
          {/* File Card */}
          <motion.div 
            layout
            className="bg-surface p-4 rounded-2xl flex items-center gap-4 border border-zinc-800"
          >
            <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center">
              <FileType className="text-zinc-400" />
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="font-medium truncate">{file.name}</p>
              <p className="text-sm text-zinc-500">{formatBytes(file.size)}</p>
            </div>
          </motion.div>

          {/* Share Info */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col items-center justify-center gap-8 bg-surface/50 rounded-3xl p-8 border border-zinc-800/50"
          >
            <div className="bg-white p-4 rounded-2xl relative shadow-2xl shadow-primary/20">
               {/* QR Code */}
               <div className="flex items-center justify-center" style={{ width: qrSize, height: qrSize }}>
                 <QRCode 
                    value={shareCode} 
                    size={qrSize} 
                    fgColor="#000000"
                    bgColor="#ffffff"
                    style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
                 />
               </div>
               <motion.div 
                className="absolute inset-0 rounded-2xl border-4 border-primary"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
               />
            </div>

            <div className="text-center w-full">
              <p className="text-zinc-500 mb-2">Share Code</p>
              <div 
                className="flex items-center justify-between bg-black/50 p-4 rounded-xl cursor-pointer hover:bg-black/70 transition-colors"
                onClick={copyCode}
              >
                <span className="text-3xl font-mono font-bold tracking-widest text-primary">{shareCode}</span>
                {copied ? <Check className="text-success" /> : <Copy className="text-zinc-500" />}
              </div>
            </div>

            <div className="flex items-center gap-2 text-zinc-400 animate-pulse">
              <div className="w-2 h-2 bg-success rounded-full" />
              <span>Waiting for receiver...</span>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};