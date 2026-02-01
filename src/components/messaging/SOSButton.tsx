import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SOSButtonProps {
  onTrigger: () => void;
  disabled?: boolean;
}

export function SOSButton({ onTrigger, disabled }: SOSButtonProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [countdown, setCountdown] = useState(3);

  const handlePress = () => {
    if (disabled) return;
    
    if (!isConfirming) {
      setIsConfirming(true);
      setCountdown(3);
      
      // Auto-cancel after 3 seconds if not confirmed
      const timer = setTimeout(() => {
        setIsConfirming(false);
      }, 3000);
      
      // Countdown
      let count = 3;
      const countdownInterval = setInterval(() => {
        count--;
        setCountdown(count);
        if (count <= 0) {
          clearInterval(countdownInterval);
        }
      }, 1000);

      return () => {
        clearTimeout(timer);
        clearInterval(countdownInterval);
      };
    } else {
      // Confirmed - trigger SOS
      onTrigger();
      setIsConfirming(false);
    }
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsConfirming(false);
  };

  return (
    <div className="relative">
      <AnimatePresence mode="wait">
        {isConfirming ? (
          <motion.div
            key="confirming"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="flex items-center gap-1"
          >
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10"
              onClick={handleCancel}
            >
              <X className="h-4 w-4" />
            </Button>
            <motion.button
              onClick={handlePress}
              className={cn(
                "h-10 px-4 rounded-full font-bold text-sm",
                "bg-destructive text-destructive-foreground",
                "shadow-[0_0_20px_rgba(239,68,68,0.5)]",
                "animate-pulse"
              )}
              whileTap={{ scale: 0.95 }}
            >
              TAP TO CONFIRM
            </motion.button>
          </motion.div>
        ) : (
          <motion.button
            key="sos"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={handlePress}
            disabled={disabled}
            className={cn(
              "h-10 w-10 rounded-full flex items-center justify-center",
              "bg-destructive/20 border-2 border-destructive",
              "text-destructive font-black text-xs",
              "transition-all hover:bg-destructive hover:text-destructive-foreground",
              "hover:shadow-[0_0_15px_rgba(239,68,68,0.4)]",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            whileTap={{ scale: 0.9 }}
          >
            SOS
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
