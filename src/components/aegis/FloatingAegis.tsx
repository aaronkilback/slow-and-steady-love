import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, X, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { useAegisChat } from "@/hooks/useAegisChat";
import { SOSButton } from "@/components/messaging/SOSButton";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface FloatingAegisProps {
  className?: string;
}

const welcomeContent = `**Aegis Online** — Silent Shield Security Intelligence Platform

I'm your lead AI security agent, ready to assist with:
- 🔍 **Threat Analysis** — Analyze and explain security threats
- 📡 **System Monitoring** — Check status of all agents and systems  
- 🛡️ **Command Coordination** — Direct specialized agents for tasks
- 📊 **Intelligence Briefings** — Get security updates and reports

How can I assist you today, Operator?`;

export function FloatingAegis({ className }: FloatingAegisProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const {
    messages,
    isStreaming,
    sendMessage,
  } = useAegisChat();

  const handleSOSTrigger = () => {
    // Navigate to the full SOS page for proper GPS + critical signal flow
    navigate("/sos");
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const message = input;
    setInput("");
    await sendMessage(message);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className={cn(
              "fixed bottom-24 right-4 z-40 flex items-center gap-3",
              className
            )}
          >
            {/* SOS Button */}
            <SOSButton onTrigger={handleSOSTrigger} />
            
            {/* Aegis Button */}
            <div className="relative">
              <Button
                size="icon"
                onClick={() => setIsOpen(true)}
                className="h-14 w-14 rounded-full shadow-lg glow-cyan bg-primary hover:bg-primary/90"
              >
                <Shield className="h-6 w-6" />
              </Button>
              
              {/* Pulse animation */}
              <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping pointer-events-none" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen Aegis overlay - optimized for mobile */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 bg-background flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-card/50 px-4 py-3 shrink-0">
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

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Messages area - takes remaining space */}
            <ScrollArea className="flex-1 min-h-0">
              <div ref={scrollRef} className="px-4 py-4 space-y-4">
                {/* Welcome message */}
                {messages.length === 0 && (
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

                {/* Messages */}
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
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
                
                {/* Streaming indicator */}
                {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
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

            {/* Input area - fixed at bottom with safe area padding */}
            <div className="border-t border-border bg-card/80 backdrop-blur-sm p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shrink-0">
              <div className="flex items-center gap-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Message Aegis..."
                  className="flex-1 bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary text-base"
                  disabled={isStreaming}
                  autoComplete="off"
                  autoCorrect="off"
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!input.trim() || isStreaming}
                  className="shrink-0 h-10 w-10"
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
