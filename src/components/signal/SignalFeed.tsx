import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Shield, Eye, Radio, Clock, MapPin, ChevronDown, ChevronUp, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSignals, Signal as SignalType } from "@/hooks/useFortressData";
import { fortressClient } from "@/lib/fortress-client";

type Severity = "critical" | "high" | "medium" | "low";

const severityConfig: Record<Severity, { color: string; bgColor: string; icon: React.ElementType; glowClass: string }> = {
  critical: { color: "text-critical", bgColor: "bg-critical/10", icon: AlertTriangle, glowClass: "glow-critical" },
  high: { color: "text-high", bgColor: "bg-high/10", icon: Shield, glowClass: "glow-high" },
  medium: { color: "text-medium", bgColor: "bg-medium/10", icon: Eye, glowClass: "glow-medium" },
  low: { color: "text-low", bgColor: "bg-low/10", icon: Radio, glowClass: "glow-low" },
};

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function SignalCard({ signal }: { signal: SignalType }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const severity = (signal.severity || "low") as Severity;
  const config = severityConfig[severity];
  const Icon = config.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <Card 
        className={cn(
          "cursor-pointer border-l-4 transition-all duration-200",
          config.bgColor,
          isExpanded && config.glowClass
        )}
        style={{ borderLeftColor: `hsl(var(--${severity}))` }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className={cn("mt-0.5 rounded-lg p-2", config.bgColor)}>
              <Icon className={cn("h-4 w-4", config.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className={cn("text-xs", config.color)}>
                  {severity.toUpperCase()}
                </Badge>
                <span className="text-xs text-muted-foreground">{signal.category}</span>
              </div>
              <h3 className="font-medium text-sm text-foreground leading-tight">
                {signal.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {signal.description}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTimeAgo(new Date(signal.created_at))}
                </span>
                {signal.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {signal.location}
                  </span>
                )}
                <span className="text-primary">{signal.source}</span>
              </div>
            </div>
            <div className="text-muted-foreground">
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
          
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-border space-y-3">
                  {/* Full description */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                    <p className="text-sm text-foreground leading-relaxed">
                      {signal.description}
                    </p>
                  </div>
                  
                  {/* Details if available */}
                  {signal.details && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Details</p>
                      <p className="text-sm text-foreground leading-relaxed">
                        {signal.details}
                      </p>
                    </div>
                  )}
                  
                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Source</p>
                      <p className="text-foreground font-medium">{signal.source || "Unknown"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Category</p>
                      <p className="text-foreground font-medium">{signal.category || "General"}</p>
                    </div>
                    {signal.location && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Location</p>
                        <p className="text-foreground font-medium">{signal.location}</p>
                      </div>
                    )}
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Timestamp</p>
                      <p className="text-foreground font-medium">
                        {new Date(signal.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </motion.div>
  );
}

export function SignalFeed() {
  const { data: signals = [], isLoading, refetch, isRefetching } = useSignals();
  const [localSignals, setLocalSignals] = useState<SignalType[]>([]);

  // Update local signals when data changes
  useEffect(() => {
    if (signals.length > 0) {
      setLocalSignals(signals);
    }
  }, [signals]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = fortressClient
      .channel("signals-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "signals",
        },
        (payload) => {
          setLocalSignals((prev) => [payload.new as SignalType, ...prev]);
        }
      )
      .subscribe();

    return () => {
      fortressClient.removeChannel(channel);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading signals...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Refresh header */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-border">
        <span className="text-xs text-muted-foreground">
          {localSignals.length} signals
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="h-8 px-2"
        >
          <RefreshCw className={cn("h-4 w-4 mr-1", isRefetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <ScrollArea className="flex-1 px-4 py-4">
        <div className="space-y-3 pb-4">
          {localSignals.length === 0 ? (
            <div className="text-center py-12">
              <Radio className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No signals detected</p>
              <p className="text-xs text-muted-foreground mt-1">
                All systems operating normally
              </p>
            </div>
          ) : (
            <AnimatePresence>
              {localSignals.map((signal) => (
                <SignalCard key={signal.id} signal={signal} />
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
