import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, X, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VoiceModeProps {
  isOpen: boolean;
  isListening: boolean;
  isSupported: boolean;
  interimTranscript: string;
  onClose: () => void;
  onToggleListening: () => void;
}

export function VoiceMode({
  isOpen,
  isListening,
  isSupported,
  interimTranscript,
  onClose,
  onToggleListening,
}: VoiceModeProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
        >
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
          >
            <X className="h-6 w-6" />
          </Button>

          {/* Header with branding */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="absolute top-8 flex items-center gap-2"
          >
            <Shield className="h-8 w-8 text-primary" />
            <span className="text-xl font-semibold text-foreground">Silent Shield</span>
          </motion.div>

          {/* Main microphone area */}
          <div className="relative flex items-center justify-center">
            {/* Animated rings */}
            {isListening && (
              <>
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute rounded-full border border-primary/30"
                    initial={{ width: 180, height: 180, opacity: 0 }}
                    animate={{
                      width: [180, 220 + i * 40, 260 + i * 40],
                      height: [180, 220 + i * 40, 260 + i * 40],
                      opacity: [0.6, 0.3, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: i * 0.4,
                      ease: "easeOut",
                    }}
                  />
                ))}

                {/* Static glowing rings */}
                <div className="absolute h-[280px] w-[280px] rounded-full border border-primary/20" />
                <div className="absolute h-[320px] w-[320px] rounded-full border border-primary/10" />
                <div className="absolute h-[360px] w-[360px] rounded-full border border-primary/5" />

                {/* Glow points on rings */}
                <motion.div
                  className="absolute h-[280px] w-[280px]"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                >
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_4px_hsl(var(--primary))]" />
                </motion.div>
                <motion.div
                  className="absolute h-[320px] w-[320px]"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                >
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_4px_hsl(var(--primary))]" />
                </motion.div>
              </>
            )}

            {/* Center microphone button */}
            <motion.button
              onClick={onToggleListening}
              disabled={!isSupported}
              className={cn(
                "relative z-10 flex h-40 w-40 items-center justify-center rounded-full transition-all",
                "bg-gradient-to-b from-card to-background",
                "border border-primary/30",
                "shadow-[0_0_60px_-10px_hsl(var(--primary))]",
                isListening && "shadow-[0_0_80px_-5px_hsl(var(--primary))]",
                !isSupported && "opacity-50 cursor-not-allowed"
              )}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              animate={isListening ? { scale: [1, 1.02, 1] } : {}}
              transition={isListening ? { duration: 1.5, repeat: Infinity } : {}}
            >
              {/* Inner glow ring */}
              <div className={cn(
                "absolute inset-2 rounded-full border transition-colors",
                isListening ? "border-primary/50" : "border-primary/20"
              )} />
              <div className={cn(
                "absolute inset-4 rounded-full border transition-colors",
                isListening ? "border-primary/30" : "border-primary/10"
              )} />
              
              {/* Microphone icon */}
              <motion.div
                animate={isListening ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                {isListening ? (
                  <MicOff className="h-12 w-12 text-primary" />
                ) : (
                  <Mic className="h-12 w-12 text-primary" />
                )}
              </motion.div>
            </motion.button>
          </div>

          {/* Status text */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-12 text-center"
          >
            {!isSupported ? (
              <p className="text-muted-foreground">Voice not supported in this browser</p>
            ) : isListening ? (
              <motion.p
                className="text-xl text-foreground font-light tracking-wide"
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                Listening...
              </motion.p>
            ) : (
              <p className="text-muted-foreground">Tap the microphone to speak</p>
            )}
          </motion.div>

          {/* Interim transcript display */}
          <AnimatePresence mode="wait">
            {interimTranscript && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute bottom-32 max-w-md px-6 text-center"
              >
                <p className="text-lg text-primary/80 italic">"{interimTranscript}"</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom decorative element */}
          <div className="absolute bottom-8 flex items-center gap-2">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-primary/30" />
            <div className="h-10 w-10 rounded-full border border-primary/20 flex items-center justify-center">
              <Mic className="h-4 w-4 text-primary/50" />
            </div>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-primary/30" />
          </div>

          {/* Ambient glow effects */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
