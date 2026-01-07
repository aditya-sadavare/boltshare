import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowRight, RotateCcw } from 'lucide-react';
import { Button } from '../components/Button';
import confetti from 'canvas-confetti';

interface CompleteProps {
  onReset: () => void;
}

export const Complete: React.FC<CompleteProps> = ({ onReset }) => {
  React.useEffect(() => {
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#3b82f6', '#8b5cf6', '#10b981']
    });
  }, []);

  return (
    <motion.div 
      className="flex flex-col h-full items-center justify-center gap-8"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="w-24 h-24 bg-success/10 rounded-full flex items-center justify-center mb-4">
        <CheckCircle className="w-12 h-12 text-success" />
      </div>

      <h2 className="text-4xl font-bold text-center">Transfer Complete!</h2>
      <p className="text-zinc-400 text-center max-w-xs">
        The file has been successfully transferred. No data was saved on any server.
      </p>

      <div className="w-full max-w-xs space-y-4 mt-8">
        <Button fullWidth onClick={onReset} variant="primary">
          Send Another File
          <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
    </motion.div>
  );
};