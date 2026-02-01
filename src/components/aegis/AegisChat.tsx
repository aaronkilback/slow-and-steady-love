import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const welcomeMessage: Message = {
  id: "welcome",
  role: "assistant",
  content: `**Aegis Online** — Silent Shield Security Intelligence Platform

I'm your lead AI security agent, ready to assist with:
- 🔍 **Threat Analysis** — Analyze and explain security threats
- 📡 **System Monitoring** — Check status of all agents and systems  
- 🛡️ **Command Coordination** — Direct specialized agents for tasks
- 📊 **Intelligence Briefings** — Get security updates and reports

How can I assist you today, Operator?`,
  timestamp: new Date(),
};

export function AegisChat() {
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // TODO: Integrate with Lovable AI edge function
    // Simulating response for now
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Understood, Operator. Processing your request...

I've analyzed your query regarding: **"${userMessage.content}"**

Current system status:
- **Sentinel Agent**: Online, monitoring perimeter
- **OSINT Agent**: Active, processing intelligence feeds
- **Monitor Agent**: Running network analysis

I'll provide a detailed briefing shortly. Is there anything specific you'd like me to prioritize?`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1500);
  };

  const toggleVoice = () => {
    setIsListening(!isListening);
    // TODO: Implement voice recognition with ElevenLabs
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col">
      {/* Chat header */}
      <div className="flex items-center gap-3 border-b border-border bg-card/50 px-4 py-3">
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

      {/* Messages area */}
      <ScrollArea ref={scrollRef} className="flex-1 px-4 py-4">
        <div className="space-y-4 pb-4">
          <AnimatePresence initial={false}>
            {messages.map((message) => (
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
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                  <p className={cn(
                    "mt-2 text-[10px]",
                    message.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}>
                    {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isLoading && (
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
            variant={isListening ? "default" : "ghost"}
            size="icon"
            onClick={toggleVoice}
            className={cn(
              "shrink-0 transition-all",
              isListening && "bg-primary glow-cyan animate-pulse-glow"
            )}
          >
            {isListening ? (
              <MicOff className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </Button>
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Message Aegis..."
            className="flex-1 bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary"
            disabled={isLoading}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="shrink-0"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
