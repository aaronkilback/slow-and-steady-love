import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, Shield, Loader2, Plus, History, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { useAegisChat } from "@/hooks/useAegisChat";
import { useOpenAIRealtime } from "@/components/voice/useOpenAIRealtime";
import { useFortressPlatformData, generatePlatformSummary } from "@/hooks/useFortressPlatformData";
import { VoiceMode } from "./VoiceMode";

const welcomeContent = `**Aegis Online** — Silent Shield Security Intelligence Platform

I'm your lead AI security agent, ready to assist with:
- 🔍 **Threat Analysis** — Analyze and explain security threats
- 📡 **System Monitoring** — Check status of all agents and systems  
- 🛡️ **Command Coordination** — Direct specialized agents for tasks
- 📊 **Intelligence Briefings** — Get security updates and reports

How can I assist you today, Operator?`;

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

  // Fetch platform data for full Aegis awareness
  const { signals, locations, profiles, agents } = useFortressPlatformData();

  const [input, setInput] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [aegisResponse, setAegisResponse] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<{ id: string; name: string; role?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check for selected agent from agent directory
  useEffect(() => {
    const storedAgent = sessionStorage.getItem("selectedAgent");
    if (storedAgent) {
      try {
        const agent = JSON.parse(storedAgent);
        setSelectedAgent(agent);
        sessionStorage.removeItem("selectedAgent");
        
        // Auto-send greeting to the selected agent
        if (agent.id !== "aegis" && agent.name) {
          const greeting = `Connect me to ${agent.name}. I need to speak with this agent.`;
          setInput(greeting);
          // Focus input so user can modify or send
          setTimeout(() => inputRef.current?.focus(), 100);
        }
      } catch {
        sessionStorage.removeItem("selectedAgent");
      }
    }
  }, []);

  // Build context for voice mode including operator info, platform data, and recent messages
  const voiceContext = useMemo(() => {
    const recentMessages = messages.slice(-10).map(m => `${m.role}: ${m.content}`).join('\n');
    const platformSummary = generatePlatformSummary({ signals, locations, profiles, agents });
    const operatorInfo = currentConversationId 
      ? `Current conversation ID: ${currentConversationId}.` 
      : '';
    
    return `You are AEGIS, the lead AI security agent for the Silent Shield platform. Assist the operator with security briefings, threat analysis, and system monitoring.

CURRENT PLATFORM STATUS:
${platformSummary}

${operatorInfo}

Recent conversation context:
${recentMessages || '(No prior messages in this session)'}

You have full access to platform intelligence. Reference signals, team status, available agents, and locations when relevant. Continue conversations naturally.`;
  }, [messages, currentConversationId, signals, locations, profiles, agents]);

  // Track pending voice transcript to save when agent responds
  const pendingVoiceTranscriptRef = useRef<string | null>(null);

  // Save voice transcript to chat history
  const saveVoiceTranscript = useCallback(async (userText: string, assistantText: string) => {
    if (!userText.trim() && !assistantText.trim()) return;
    
    // Save user message first, then assistant response
    // The sendMessage function handles conversation creation and saving
    // But we need to save both messages directly since sendMessage triggers API call
    
    // For voice, we manually save to database since we already have the response
    try {
      const { fortressClient } = await import("@/lib/fortress-client");
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { user } } = await fortressClient.auth.getUser();
      if (!user) return;

      let convId = currentConversationId;

      // Create conversation if needed
      if (!convId) {
        const { data: newConv } = await supabase
          .from("aegis_conversations")
          .insert({ user_id: user.id, title: userText.slice(0, 50) + (userText.length > 50 ? "..." : "") })
          .select("id")
          .single();

        if (newConv?.id) {
          convId = newConv.id;
        }
      }

      if (!convId) return;

      // Save user message
      if (userText.trim()) {
        await supabase.from("aegis_messages").insert({
          conversation_id: convId,
          role: "user",
          content: `🎤 ${userText.trim()}`,
        });
      }

      // Save assistant response
      if (assistantText.trim()) {
        await supabase.from("aegis_messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: assistantText.trim(),
        });
      }
      
      console.log("[Voice] Saved transcript to chat history");
    } catch (error) {
      console.error("[Voice] Failed to save transcript:", error);
    }
  }, [currentConversationId]);

  // OpenAI Realtime API for voice
  const {
    status: realtimeStatus,
    isSupported,
    transcript,
    agentResponse: realtimeAgentResponse,
    connect: connectRealtime,
    disconnect: disconnectRealtime,
    stopSpeaking,
  } = useOpenAIRealtime({
    onTranscript: (text) => {
      setCurrentTranscript(text);
      // Store the transcript to save when agent response completes
      pendingVoiceTranscriptRef.current = text;
    },
    onAgentResponse: (text) => {
      setAegisResponse(prev => prev + text);
    },
    onAgentResponseComplete: (fullText) => {
      setAegisResponse(fullText);
      // Save both user transcript and agent response to chat history
      const userTranscript = pendingVoiceTranscriptRef.current || currentTranscript;
      if (userTranscript || fullText) {
        saveVoiceTranscript(userTranscript || "", fullText);
        pendingVoiceTranscriptRef.current = null;
      }
    },
    onError: (error) => {
      console.error("[Voice] Error:", error);
      setVoiceError(error);
    },
    agentContext: voiceContext,
  });

  // Pass realtime status directly to VoiceMode (same type now)
  const voiceState = realtimeStatus;

  // Generate platform summary for text chat
  const platformSummary = useMemo(() => 
    generatePlatformSummary({ signals, locations, profiles, agents }),
    [signals, locations, profiles, agents]
  );

  // Handle sending message (for text input)
  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    const message = input;
    setInput("");
    await sendMessage(message, platformSummary);
  }, [input, isStreaming, sendMessage, platformSummary]);

  // Handle opening voice mode - CRITICAL: connect() called directly from click handler
  const handleOpenVoiceMode = useCallback(() => {
    setVoiceModeOpen(true);
    setCurrentTranscript("");
    setAegisResponse("");
    setVoiceError(null);
    // CRITICAL: This MUST be called directly from the click handler for iOS PWA
    connectRealtime();
  }, [connectRealtime]);

  // Handle closing voice mode
  const handleCloseVoiceMode = useCallback(() => {
    disconnectRealtime();
    setVoiceModeOpen(false);
    setVoiceError(null);
    // Keep last transcript/response visible after closing for easier debugging.
  }, [disconnectRealtime]);

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
              <div className="relative mt-4 mb-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <ScrollArea className="h-[calc(100vh-11rem)]">
                <div className="space-y-2 pr-4">
                  {conversations
                    .filter((conv) =>
                      !historySearch ||
                      (conv.title || "").toLowerCase().includes(historySearch.toLowerCase())
                    )
                    .map((conv) => (
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
                  {conversations.length > 0 && historySearch && conversations.filter((conv) =>
                    (conv.title || "").toLowerCase().includes(historySearch.toLowerCase())
                  ).length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No matches for "{historySearch}"
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
            onClick={isSupported ? handleOpenVoiceMode : undefined}
            disabled={!isSupported}
            className="shrink-0 transition-all hover:text-primary"
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
        {!isSupported && (
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            Voice mode is not supported on this device
          </p>
        )}
      </div>

      {/* Fullscreen Voice Mode */}
      <VoiceMode
        isOpen={voiceModeOpen}
        voiceState={voiceState}
        isSupported={isSupported}
        errorMessage={voiceError}
        interimTranscript=""
        currentTranscript={currentTranscript || transcript}
        aegisResponse={aegisResponse || realtimeAgentResponse}
        onClose={handleCloseVoiceMode}
        onToggleListening={disconnectRealtime}
        onStopSpeaking={stopSpeaking}
      />
    </div>
  );
}
