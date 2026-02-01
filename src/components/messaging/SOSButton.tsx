import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SOSButtonProps {
  onTrigger: () => void;
  disabled?: boolean;
}

export function SOSButton({ onTrigger, disabled }: SOSButtonProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const holdTimer = useRef<NodeJS.Timeout | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

  const HOLD_DURATION = 1500; // 1.5 seconds to trigger

  const startHold = () => {
    if (disabled) return;
    setIsHolding(true);
    setProgress(0);

    const startTime = Date.now();
    
    progressInterval.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / HOLD_DURATION) * 100, 100);
      setProgress(newProgress);
    }, 16);

    holdTimer.current = setTimeout(() => {
      onTrigger();
      endHold();
    }, HOLD_DURATION);
  };

  const endHold = () => {
    setIsHolding(false);
    setProgress(0);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (progressInterval.current) clearInterval(progressInterval.current);
  };

  useEffect(() => {
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, []);

  return (
    <motion.button
      onMouseDown={startHold}
      onMouseUp={endHold}
      onMouseLeave={endHold}
      onTouchStart={startHold}
      onTouchEnd={endHold}
      disabled={disabled}
      className={cn(
        "relative h-10 w-10 rounded-full overflow-hidden",
        "bg-destructive/10 border-2 border-destructive/50",
        "flex items-center justify-center",
        "transition-all select-none touch-none",
        isHolding && "border-destructive scale-110",
        disabled && "opacity-50"
      )}
      whileTap={{ scale: 1.1 }}
    >
      {/* Progress fill */}
      <motion.div
        className="absolute inset-0 bg-destructive origin-bottom"
        style={{ scaleY: progress / 100 }}
      />
      
      {/* Label */}
      <span className={cn(
        "relative z-10 text-[10px] font-black tracking-tight",
        isHolding ? "text-destructive-foreground" : "text-destructive"
      )}>
        SOS
      </span>
    </motion.button>
  );
}
