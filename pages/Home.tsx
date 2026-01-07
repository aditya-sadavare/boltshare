import React from 'react';
import { motion } from 'framer-motion';
import { Send, Download } from 'lucide-react';

interface HomeProps {
  onSend: () => void;
  onReceive: () => void;
}

export const Home: React.FC<HomeProps> = ({ onSend, onReceive }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex flex-col h-full justify-center gap-8"
    >
      <div className="text-center space-y-4">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400"
        >
          Share Fast. <br/> Stay Private.
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-zinc-400 text-lg"
        >
          Direct P2P transfer. No limits. No cloud.
        </motion.p>
      </div>

      <div className="grid gap-6 mt-8 grid-cols-1 md:grid-cols-2">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onSend}
          className="group relative overflow-hidden bg-surface border border-zinc-800 p-6 md:p-8 lg:p-10 rounded-3xl flex items-center justify-between hover:border-primary/50 transition-all w-full"
        >
          <div className="flex flex-col items-start gap-2">
            <span className="text-3xl font-bold text-white">Send File</span>
            <span className="text-zinc-400">Generate a code or QR</span>
          </div>
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary transition-colors">
            <Send className="w-8 h-8 text-primary group-hover:text-white transition-colors" />
          </div>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onReceive}
          className="group relative overflow-hidden bg-surface border border-zinc-800 p-6 md:p-8 lg:p-10 rounded-3xl flex items-center justify-between hover:border-accent/50 transition-all w-full"
        >
          <div className="flex flex-col items-start gap-2">
            <span className="text-3xl font-bold text-white">Receive</span>
            <span className="text-zinc-400">Enter code or scan QR</span>
          </div>
          <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center group-hover:bg-accent transition-colors">
            <Download className="w-8 h-8 text-accent group-hover:text-white transition-colors" />
          </div>
        </motion.button>
      </div>
    </motion.div>
  );
};