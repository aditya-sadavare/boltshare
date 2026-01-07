import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Home } from './pages/Home';
import { Send } from './pages/Send';
import { Receive } from './pages/Receive';
import { Transfer } from './pages/Transfer';
import { Complete } from './pages/Complete';
import { TransferState, FileMetadata, TransferProgress } from './types';
import { signaling } from './services/signaling';

type Page = 'HOME' | 'SEND' | 'RECEIVE' | 'TRANSFER' | 'COMPLETE';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('HOME');
  const [role, setRole] = useState<'SENDER' | 'RECEIVER' | null>(null);
  
  // Shared state for the transfer session
  const [sessionId, setSessionId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<FileMetadata | null>(null);
  const [transferState, setTransferState] = useState<TransferState>(TransferState.IDLE);
  
  // WebRTC & Transfer Refs (lifted up to persist across page transitions if needed)
  // Ideally, these live in a Context, but for this structure, we pass props or use a global store.
  // For simplicity, we will instantiate the Transfer logic inside the Transfer Page or keep it mounted?
  // To ensure the connection stays alive, the Logic needs to be at App level or in a persistent component.
  // We will pass handlers to the pages.
  
  useEffect(() => {
    signaling.connect();
    return () => {
      signaling.disconnect();
    };
  }, []);

  const resetFlow = () => {
    setCurrentPage('HOME');
    setRole(null);
    setSessionId('');
    setFile(null);
    setMetadata(null);
    setTransferState(TransferState.IDLE);
    // Ideally disconnect WebRTC here
    window.location.reload(); // Hard reset for clean WebRTC state in this simple implementation
  };

  return (
    <div className="min-h-screen bg-background text-white selection:bg-primary/30">
      <div className="w-full max-w-screen-xl ml-8 min-h-screen flex flex-col relative overflow-hidden px-4 sm:px-6 lg:px-8">
        {/* Background Ambient Glow */}
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-accent/20 rounded-full blur-[100px] pointer-events-none" />

        <header className="p-6 flex justify-between items-center z-10">
          <div className="flex items-center gap-2 cursor-pointer" onClick={resetFlow}>
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center font-bold text-lg">
              B
            </div>
            <span className="font-bold text-xl tracking-tight">BoltShare</span>
          </div>
        </header>

        <main className="flex-1 flex flex-col p-6 z-10 relative">
          <AnimatePresence mode="wait">
            {currentPage === 'HOME' && (
              <Home 
                key="home" 
                onSend={() => { setRole('SENDER'); setCurrentPage('SEND'); }}
                onReceive={() => { setRole('RECEIVER'); setCurrentPage('RECEIVE'); }}
              />
            )}
            {currentPage === 'SEND' && (
              <Send 
                key="send"
                onBack={() => setCurrentPage('HOME')}
                onFileSelected={(f) => { setFile(f); }}
                onSessionCreated={(id) => setSessionId(id)}
                onReceiverConnected={() => setCurrentPage('TRANSFER')}
              />
            )}
            {currentPage === 'RECEIVE' && (
              <Receive 
                key="receive"
                onBack={() => setCurrentPage('HOME')}
                onConnect={(id) => { setSessionId(id); setCurrentPage('TRANSFER'); }}
              />
            )}
            {currentPage === 'TRANSFER' && (
              <Transfer 
                key="transfer"
                role={role!}
                sessionId={sessionId}
                file={file}
                onComplete={() => setCurrentPage('COMPLETE')}
              />
            )}
            {currentPage === 'COMPLETE' && (
              <Complete 
                key="complete"
                onReset={resetFlow}
              />
            )}
          </AnimatePresence>
        </main>
        
        <footer className="p-6 text-center text-zinc-600 text-xs">
          Privacy First. No Server Storage. P2P Encrypted.
        </footer>
      </div>
    </div>
  );
}