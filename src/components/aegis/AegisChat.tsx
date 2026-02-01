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
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
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
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [aegisResponse, setAegisResponse] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const voiceModeOpenRef = useRef(voiceModeOpen);
  
  useEffect(() => { voiceModeOpenRef.current = voiceModeOpen; }, [voiceModeOpen]);

  // Browser speech recognition - same as main Fortress platform
  const { 
    isListening, 
    isSupported, 
    startListening, 
    stopListening 
  } = useSpeechRecognition({
    onTranscript: (transcript) => {
      setCurrentTranscript(prev => prev + transcript);
      setInterimTranscript("");
    },
    onInterimTranscript: (transcript) => {
      setInterimTranscript(transcript);
    },
    continuous: true,
  });

  // Sync listening state
  useEffect(() => {
    if (isListening && voiceState !== "listening") {
      setVoiceState("listening");
    }
  }, [isListening, voiceState]);

  // Resume listening after Aegis finishes speaking
  const handleSpeechEnd = useCallback(() => {
    if (voiceModeOpenRef.current) {
      setVoiceState("idle");
      setAegisResponse("");
      setCurrentTranscript("");
      setInterimTranscript("");
      // Auto-restart listening after response
      setTimeout(() => {
        if (voiceModeOpenRef.current) {
          startListening();
          setVoiceState("listening");
        }
      }, 500);
    }
  }, [startListening]);

  // OpenAI TTS with onyx voice
  const { speak, stop: stopSpeaking } = useOpenAITTS({
    onEnd: handleSpeechEnd,
    onError: (err) => {
      console.error("TTS error:", err);
      setVoiceState("idle");
    },
  });

  // Handle sending message (for text input)
  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    const message = input;
    setInput("");
    await sendMessage(message);
  }, [input, isStreaming, sendMessage]);

  // Voice toggle - tap to stop listening and send, tap again to start
  const handleVoiceToggle = useCallback(() => {
    if (voiceState === "listening") {
      // User tapped while listening - stop and send what we have
      stopListening();
      const transcript = currentTranscript.trim();
      if (transcript) {
        setVoiceState("processing");
        sendMessage(transcript);
        setCurrentTranscript("");
        setInterimTranscript("");
      } else {
        setVoiceState("idle");
      }
    } else if (voiceState === "idle") {
      // Start listening
      setCurrentTranscript("");
      setInterimTranscript("");
      startListening();
      setVoiceState("listening");
    }
  }, [voiceState, stopListening, startListening, currentTranscript, sendMessage]);

  // Watch for new assistant messages to speak
  useEffect(() => {
    if (!voiceModeOpen) return;
    // Only trigger TTS when we're actively waiting for a response (processing state)
    if (voiceState !== "processing") return;
    
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant") return;
    if (isStreaming) return; // Wait for streaming to complete
    
    // Check if this is a new message we haven't spoken yet
    if (lastMessage.id === lastMessageIdRef.current) return;
    
    console.log("[Voice] New assistant message detected, triggering TTS");
    
    // New complete assistant message
    lastMessageIdRef.current = lastMessage.id;
    setAegisResponse(lastMessage.content);
    setVoiceState("speaking");
    
    // Strip markdown for speech
    const textToSpeak = lastMessage.content
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/#{1,6}\s/g, "")
      .replace(/`[^`]*`/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[-•]/g, "");
    
    console.log("[Voice] Speaking:", textToSpeak.substring(0, 100) + "...");
    speak(textToSpeak);
  }, [messages, isStreaming, voiceModeOpen, voiceState, speak]);

  // Handle closing voice mode
  const handleCloseVoiceMode = useCallback(() => {
    stopListening();
    stopSpeaking();
    setVoiceModeOpen(false);
    setVoiceState("idle");
    setCurrentTranscript("");
    setInterimTranscript("");
    setAegisResponse("");
    lastMessageIdRef.current = null;
  }, [stopListening, stopSpeaking]);

  // Handle opening voice mode - automatically start listening
  const handleOpenVoiceMode = useCallback(() => {
    setVoiceModeOpen(true);
    setCurrentTranscript("");
    setInterimTranscript("");
    setAegisResponse("");
    lastMessageIdRef.current = messages[messages.length - 1]?.id || null;
    // Start listening immediately when voice mode opens
    setTimeout(() => {
      startListening();
      setVoiceState("listening");
    }, 300);
  }, [messages, startListening]);

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
        interimTranscript=""
        currentTranscript={currentTranscript}
        aegisResponse={aegisResponse}
        onClose={handleCloseVoiceMode}
        onToggleListening={handleVoiceToggle}
        onStopSpeaking={() => {
          stopSpeaking();
          setVoiceState("idle");
        }}
      />
    </div>
  );
}
