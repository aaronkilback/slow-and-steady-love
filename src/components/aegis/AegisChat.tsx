import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, Shield, Loader2, Plus, History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { useAegisChat } from "@/hooks/useAegisChat";
import { useOpenAIRealtime } from "@/hooks/useOpenAIRealtime";
import { useWhisperSTT } from "@/hooks/useWhisperSTT";
import { useOpenAITTS } from "@/hooks/useOpenAITTS";
import { VoiceMode } from "./VoiceMode";

const welcomeContent = `**Aegis Online** — Silent Shield Security Intelligence Platform

I'm your lead AI security agent, ready to assist with:
- 🔍 **Threat Analysis** — Analyze and explain security threats
- 📡 **System Monitoring** — Check status of all agents and systems  
- 🛡️ **Command Coordination** — Direct specialized agents for tasks
- 📊 **Intelligence Briefings** — Get security updates and reports

How can I assist you today, Operator?`;

type VoiceState = "idle" | "listening" | "processing" | "speaking";
type VoiceTransport = "realtime" | "push_to_talk";

function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isPWAStandalone() {
  if (typeof window === "undefined") return false;
  const navStandalone = Boolean((navigator as unknown as { standalone?: boolean }).standalone);
  const mediaStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return navStandalone || mediaStandalone;
}

export function AegisChat() {
  const {
    conversations,
    currentConversationId,
    messages,
    isLoading,
    isStreaming,
    sendMessage,
    startNewConversation,
    selectConversation,
    deleteConversation,
  } = useAegisChat();

  const [input, setInput] = useState("");
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceTransport, setVoiceTransport] = useState<VoiceTransport>("realtime");
  const [voiceOverlayMessage, setVoiceOverlayMessage] = useState<string | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [aegisResponse, setAegisResponse] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const voiceTransportRef = useRef<VoiceTransport>("realtime");
  useEffect(() => {
    voiceTransportRef.current = voiceTransport;
  }, [voiceTransport]);

  // OpenAI Realtime API for voice
  const {
    status: realtimeStatus,
    isSupported,
    connect: connectRealtime,
    disconnect: disconnectRealtime,
    error: realtimeError,
  } = useOpenAIRealtime({
    agentContext: "You are in voice mode, assisting with security operations.",
    onTranscript: (text) => {
      setCurrentTranscript(text);
    },
    onAgentResponseComplete: (text) => {
      if (voiceTransportRef.current !== "realtime") return;
      setAegisResponse(text);
      // Briefly show response then clear for next turn
      setTimeout(() => {
        setAegisResponse("");
        setCurrentTranscript("");
      }, 3000);
    },
    onError: (error) => {
      console.error("[Voice] Error:", error);
    },
    onStatusChange: (status) => {
      if (voiceTransportRef.current !== "realtime") return;
      // Map realtime status to voice state
      switch (status) {
        case "idle":
          setVoiceState("idle");
          break;
        case "connecting":
          setVoiceState("processing");
          break;
        case "connected":
        case "listening":
          setVoiceState("listening");
          break;
        case "speaking":
          setVoiceState("speaking");
          break;
      }
    },
  });

  const realtimeStatusRef = useRef(realtimeStatus);
  useEffect(() => {
    realtimeStatusRef.current = realtimeStatus;
  }, [realtimeStatus]);

  const whisper = useWhisperSTT({
    onError: (err) => {
      console.error("[Voice][STT] Error:", err);
      setVoiceOverlayMessage(err.message || "Microphone recording failed");
    },
  });

  const {
    speak,
    stop: stopTTS,
    isSpeaking: isTtsSpeaking,
    isLoading: isTtsLoading,
  } = useOpenAITTS({
    onStart: () => {
      if (voiceTransportRef.current === "push_to_talk") setVoiceState("speaking");
    },
    onEnd: () => {
      if (voiceTransportRef.current === "push_to_talk") setVoiceState("idle");
    },
    onError: (err) => {
      console.error("[Voice][TTS] Error:", err);
      setVoiceOverlayMessage(err.message || "Audio playback failed");
      if (voiceTransportRef.current === "push_to_talk") setVoiceState("idle");
    },
  });

  const switchToPushToTalk = useCallback(() => {
    setVoiceTransport("push_to_talk");
    setVoiceOverlayMessage(null);
    disconnectRealtime();
    setVoiceState("idle");
  }, [disconnectRealtime]);

  // Handle realtime connection errors - offer PTT as fallback
  useEffect(() => {
    if (!voiceModeOpen) return;
    if (voiceTransport !== "realtime") return;
    if (!realtimeError) return;

    // Show error but don't auto-switch - let user decide
    setVoiceOverlayMessage(realtimeError);
  }, [voiceModeOpen, voiceTransport, realtimeError]);

  // Drive overlay state from push-to-talk activity
  useEffect(() => {
    if (voiceTransport !== "push_to_talk") return;

    if (whisper.isListening) {
      setVoiceState("listening");
      return;
    }
    if (whisper.isProcessing || isTtsLoading) {
      setVoiceState("processing");
      return;
    }
    if (isTtsSpeaking) {
      setVoiceState("speaking");
      return;
    }
  }, [voiceTransport, whisper.isListening, whisper.isProcessing, isTtsLoading, isTtsSpeaking]);

  // Handle sending message (for text input)
  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    const message = input;
    setInput("");
    await sendMessage(message);
  }, [input, isStreaming, sendMessage]);

  // Handle closing voice mode
  const handleCloseVoiceMode = useCallback(() => {
    disconnectRealtime();
    stopTTS();
    whisper.cancelListening();
    setVoiceModeOpen(false);
    setVoiceState("idle");
    setVoiceTransport("realtime");
    setVoiceOverlayMessage(null);
    setCurrentTranscript("");
    setAegisResponse("");
  }, [disconnectRealtime, stopTTS, whisper]);

  // Handle opening voice mode - connect to realtime API
  // CRITICAL: connectRealtime() MUST be called synchronously from this click handler
  // for iOS PWA to properly authorize microphone access.
  const handleOpenVoiceMode = useCallback(() => {
    setVoiceModeOpen(true);
    setCurrentTranscript("");
    setAegisResponse("");
    setVoiceOverlayMessage(null);

    // Always attempt realtime first - the hook now handles iOS-specific
    // AudioContext resume and optimized audio constraints
    setVoiceTransport("realtime");
    setVoiceState("processing");
    
    // Connect synchronously from user gesture (critical for iOS PWA)
    connectRealtime();
  }, [connectRealtime]);

  // Handle stopping speech (not applicable with realtime API in same way)
  const handleStopSpeaking = useCallback(() => {
    if (voiceTransportRef.current === "push_to_talk") {
      stopTTS();
      setVoiceState("idle");
      return;
    }

    // With realtime API, we can't easily interrupt mid-speech
    // Just update local state
    setVoiceState("listening");
  }, [stopTTS]);

  const handlePTTStart = useCallback(async () => {
    if (voiceTransportRef.current !== "push_to_talk") return;
    if (whisper.isProcessing || isTtsLoading) return;
    setVoiceOverlayMessage(null);
    setAegisResponse("");
    setCurrentTranscript("");
    await whisper.startListening();
  }, [isTtsLoading, whisper]);

  const handlePTTEnd = useCallback(async () => {
    if (voiceTransportRef.current !== "push_to_talk") return;
    const transcript = await whisper.stopListening();
    if (!transcript) return;

    setCurrentTranscript(transcript);
    setVoiceState("processing");

    const assistantText = await sendMessage(transcript);
    if (!assistantText) return;

    setAegisResponse(assistantText);
    // Speak with iOS-safe TTS (onyx voice via backend)
    await speak(assistantText);
  }, [sendMessage, speak, whisper]);

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    if (!scrollRef.current) return;
    const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
    const target = scrollContainer || scrollRef.current;
    target.scrollTop = target.scrollHeight;
  }, []);

  // Scroll to bottom when messages finish loading or change
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      requestAnimationFrame(() => {
        scrollToBottom();
        setTimeout(scrollToBottom, 100);
        setTimeout(scrollToBottom, 300);
      });
    }
  }, [messages, isLoading, scrollToBottom]);

  // Scroll when streaming new content
  useEffect(() => {
    if (isStreaming) {
      scrollToBottom();
    }
  }, [isStreaming, messages, scrollToBottom]);

  // Scroll when switching conversations
  useEffect(() => {
    if (currentConversationId) {
      setTimeout(scrollToBottom, 400);
    }
  }, [currentConversationId, scrollToBottom]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const displayMessages = messages.length > 0 ? messages : [];

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col">
      {/* Chat header */}
      <div className="flex items-center justify-between border-b border-border bg-card/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 glow-cyan-sm">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-low" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Aegis</h2>
            <p className="text-xs text-muted-foreground">Lead AI Security Agent</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={startNewConversation}>
            <Plus className="h-5 w-5" />
          </Button>
          
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <History className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Conversation History</SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-8rem)] mt-4">
                <div className="space-y-2 pr-4">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors",
                        currentConversationId === conv.id 
                          ? "bg-primary/20 border border-primary/50" 
                          : "bg-card hover:bg-card/80"
                      )}
                      onClick={() => selectConversation(conv.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {conv.title || "New Conversation"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(conv.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(conv.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                  {conversations.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No previous conversations
                    </p>
                  )}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Messages area */}
      <ScrollArea ref={scrollRef} className="flex-1 px-4 py-4">
        <div className="space-y-4 pb-4">
          {/* Show welcome message when no messages */}
          {displayMessages.length === 0 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-card border border-border rounded-bl-md">
                <div className="prose prose-sm max-w-none prose-invert prose-p:text-foreground prose-strong:text-primary prose-li:text-muted-foreground">
                  <ReactMarkdown>{welcomeContent}</ReactMarkdown>
                </div>
              </div>
            </motion.div>
          )}

          <AnimatePresence initial={false}>
            {displayMessages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border border-border rounded-bl-md"
                  )}
                >
                  <div className={cn(
                    "prose prose-sm max-w-none",
                    message.role === "user" 
                      ? "prose-invert" 
                      : "prose-invert prose-p:text-foreground prose-strong:text-primary prose-li:text-muted-foreground"
                  )}>
                    <ReactMarkdown>{message.content || "..."}</ReactMarkdown>
                  </div>
                  <p className={cn(
                    "mt-2 text-[10px]",
                    message.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}>
                    {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isStreaming && displayMessages[displayMessages.length - 1]?.role !== "assistant" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Aegis is processing...</span>
              </div>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t border-border bg-card/50 p-4 safe-area-bottom">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenVoiceMode}
            disabled={!isSupported}
            className="shrink-0 transition-all hover:text-primary"
            title={!isSupported ? "Speech not supported" : "Open voice mode"}
          >
            <Mic className="h-5 w-5" />
          </Button>
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Message Aegis..."
            className="flex-1 bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary"
            disabled={isStreaming}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="shrink-0"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Fullscreen Voice Mode */}
      <VoiceMode
        isOpen={voiceModeOpen}
        voiceState={voiceState}
        isSupported={isSupported}
        transport={voiceTransport}
        errorMessage={voiceOverlayMessage ?? realtimeError}
        interimTranscript=""
        currentTranscript={currentTranscript}
        aegisResponse={aegisResponse}
        onClose={handleCloseVoiceMode}
        onToggleListening={handleStopSpeaking}
        onStopSpeaking={handleStopSpeaking}
        onPressToTalkStart={voiceTransport === "push_to_talk" ? handlePTTStart : undefined}
        onPressToTalkEnd={voiceTransport === "push_to_talk" ? handlePTTEnd : undefined}
        onSwitchToPushToTalk={switchToPushToTalk}
      />
    </div>
  );
}
