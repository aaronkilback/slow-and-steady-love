import { useState, useEffect, useRef } from "react";
import { Communication } from "@/hooks/useCommsData";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send, ArrowUpRight, ArrowDownLeft, Check, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface ThreadViewProps {
  contactIdentifier: string;
  contactName: string | null;
  communications: Communication[];
  onBack: () => void;
  onSend: (message: string) => Promise<void>;
  isSending: boolean;
  startPolling: () => void;
  stopPolling: () => void;
}

function DeliveryStatus({ status }: { status: string | null }) {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === "delivered" || s === "sent") {
    return <Check className="h-3 w-3 text-primary" />;
  }
  if (s === "queued" || s === "sending") {
    return <Clock className="h-3 w-3 text-muted-foreground" />;
  }
  if (s === "failed" || s === "undelivered") {
    return <span className="text-[10px] text-destructive">Failed</span>;
  }
  return <span className="text-[10px] text-muted-foreground">{status}</span>;
}

export function ThreadView({
  contactIdentifier,
  contactName,
  communications,
  onBack,
  onSend,
  isSending,
  startPolling,
  stopPolling,
}: ThreadViewProps) {
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter messages for this contact and sort ascending
  const threadMessages = communications
    .filter((c) => c.contact_identifier === contactIdentifier)
    .sort(
      (a, b) =>
        new Date(a.message_timestamp).getTime() - new Date(b.message_timestamp).getTime()
    );

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [threadMessages.length]);

  // Start polling when thread opens, stop on close
  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async () => {
    const text = message.trim();
    if (!text) return;
    setMessage("");
    await onSend(text);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const displayName = contactName || contactIdentifier;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold truncate">{displayName}</h3>
          {contactName && (
            <p className="text-xs text-muted-foreground truncate">{contactIdentifier}</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-hide">
        {threadMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">No messages yet</p>
          </div>
        ) : (
          threadMessages.map((msg) => {
            const isOutbound = msg.direction === "outbound";
            return (
              <div
                key={msg.id}
                className={cn("flex", isOutbound ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm",
                    isOutbound
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-secondary text-secondary-foreground rounded-bl-md"
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.message_body}</p>
                  <div
                    className={cn(
                      "flex items-center gap-1.5 mt-1",
                      isOutbound ? "justify-end" : "justify-start"
                    )}
                  >
                    {isOutbound ? (
                      <ArrowUpRight className="h-2.5 w-2.5 opacity-60" />
                    ) : (
                      <ArrowDownLeft className="h-2.5 w-2.5 opacity-60" />
                    )}
                    <span className="text-[10px] opacity-60">
                      {format(new Date(msg.message_timestamp), "HH:mm")}
                    </span>
                    {isOutbound && <DeliveryStatus status={msg.provider_status} />}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Compose bar */}
      <div className="border-t border-border bg-card/50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            placeholder="Type a message…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSending}
            className="flex-1 bg-secondary/50 border-0 focus-visible:ring-1"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={isSending || !message.trim()}
            className="shrink-0"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
