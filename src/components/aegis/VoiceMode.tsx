import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, X, Shield, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type VoiceState = "idle" | "listening" | "processing" | "speaking";

interface VoiceModeProps {
  isOpen: boolean;
  voiceState: VoiceState;
  isSupported: boolean;
  errorMessage?: string | null;
  interimTranscript: string;
  currentTranscript: string;
  aegisResponse: string;
  onClose: () => void;
  onToggleListening: () => void;
  onStopSpeaking: () => void;
}

export function VoiceMode({
  isOpen,
  voiceState,
  isSupported,
  errorMessage,
  interimTranscript,
  currentTranscript,
  aegisResponse,
  onClose,
  onToggleListening,
  onStopSpeaking,
}: VoiceModeProps) {
  const isListening = voiceState === "listening";
  const isProcessing = voiceState === "processing";
  const isSpeaking = voiceState === "speaking";

  const getStatusText = () => {
    if (!isSupported) return "Voice not supported in this browser";
    if (errorMessage) return errorMessage;
    switch (voiceState) {
      case "listening":
        return "Listening...";
      case "processing":
        return "Aegis is thinking...";
      case "speaking":
        return "Aegis is speaking...";
      default:
        return "Starting...";
    }
  };

  // Center button action - skip Aegis speech or do nothing (conversation is automatic)
  const handleCenterButtonClick = () => {
    if (isSpeaking) {
      onStopSpeaking();
    }
    // In listening state, speech detection handles everything automatically
  };

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

          {/* Main area */}
          <div className="relative flex items-center justify-center">
            {/* Animated rings for listening */}
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
              </>
            )}

            {/* Animated rings for speaking */}
            {isSpeaking && (
              <>
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={`speak-${i}`}
                    className="absolute rounded-full border border-accent/40"
                    initial={{ width: 180, height: 180, opacity: 0 }}
                    animate={{
                      width: [180, 200 + i * 30, 240 + i * 30],
                      height: [180, 200 + i * 30, 240 + i * 30],
                      opacity: [0.5, 0.2, 0],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: i * 0.3,
                      ease: "easeOut",
                    }}
                  />
                ))}
              </>
            )}

            {/* Processing spinner rings */}
            {isProcessing && (
              <motion.div
                className="absolute h-[200px] w-[200px] rounded-full border-2 border-dashed border-primary/40"
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              />
            )}

            {/* Static glowing rings */}
            {(isListening || isSpeaking) && (
              <>
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

            {/* Center orb - visual indicator, tap to skip speech */}
            <motion.button
              onClick={handleCenterButtonClick}
              disabled={!isSupported || isProcessing}
              className={cn(
                "relative z-10 flex h-40 w-40 items-center justify-center rounded-full transition-all",
                "bg-gradient-to-b from-card to-background",
                "border border-primary/30",
                "shadow-[0_0_60px_-10px_hsl(var(--primary))]",
                (isListening || isSpeaking) && "shadow-[0_0_80px_-5px_hsl(var(--primary))]",
                (!isSupported || isProcessing) && "opacity-50 cursor-not-allowed",
                isSpeaking && "cursor-pointer" // Only clickable when speaking (to skip)
              )}
              whileHover={isSpeaking ? { scale: 1.05 } : {}}
              whileTap={isSpeaking ? { scale: 0.95 } : {}}
              animate={(isListening || isSpeaking) ? { scale: [1, 1.02, 1] } : {}}
              transition={(isListening || isSpeaking) ? { duration: 1.5, repeat: Infinity } : {}}
            >
              {/* Inner glow rings */}
              <div className={cn(
                "absolute inset-2 rounded-full border transition-colors",
                (isListening || isSpeaking) ? "border-primary/50" : "border-primary/20"
              )} />
              <div className={cn(
                "absolute inset-4 rounded-full border transition-colors",
                (isListening || isSpeaking) ? "border-primary/30" : "border-primary/10"
              )} />
              
              {/* Icon based on state */}
              <motion.div
                animate={(isListening || isSpeaking) ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                {isSpeaking ? (
                  <Volume2 className="h-12 w-12 text-primary" />
                ) : isListening ? (
                  <Mic className="h-12 w-12 text-primary" />
                ) : isProcessing ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  >
                    <Shield className="h-12 w-12 text-primary" />
                  </motion.div>
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
            <motion.p
              className={cn(
                "text-xl font-light tracking-wide",
                (isListening || isSpeaking || isProcessing) ? "text-foreground" : "text-muted-foreground"
              )}
              animate={(isListening || isProcessing) ? { opacity: [1, 0.5, 1] } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              {getStatusText()}
            </motion.p>
          </motion.div>

          {/* Transcript displays */}
          <div className="absolute bottom-24 max-w-md px-6 text-center space-y-4">
            {/* User's captured text */}
            <AnimatePresence mode="wait">
              {(currentTranscript || interimTranscript) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <p className="text-sm text-muted-foreground mb-1">You said:</p>
                  <p className="text-lg text-foreground">
                    "{currentTranscript}{interimTranscript && <span className="text-primary/60">{interimTranscript}</span>}"
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Aegis response preview */}
            <AnimatePresence mode="wait">
              {aegisResponse && isSpeaking && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <p className="text-sm text-primary mb-1">Aegis:</p>
                  <p className="text-base text-muted-foreground line-clamp-3">
                    {aegisResponse}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom decorative element */}
          <div className="absolute bottom-8 flex items-center gap-2">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-primary/30" />
            <div className="h-10 w-10 rounded-full border border-primary/20 flex items-center justify-center">
              {isSpeaking ? (
                <Volume2 className="h-4 w-4 text-primary/50" />
              ) : (
                <Mic className="h-4 w-4 text-primary/50" />
              )}
            </div>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-primary/30" />
          </div>

          {/* Ambient glow effects */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className={cn(
              "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full blur-3xl transition-colors duration-500",
              isSpeaking ? "bg-accent/10" : "bg-primary/5"
            )} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
