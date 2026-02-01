import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Shield, Eye, Radio, Clock, MapPin, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type Severity = "critical" | "high" | "medium" | "low";

interface SignalItem {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  category: string;
  source: string;
  timestamp: Date;
  location?: string;
  details?: string;
}

// Mock data - will be replaced with real data from database
const mockSignals: SignalItem[] = [
  {
    id: "1",
    title: "Unauthorized Access Attempt",
    description: "Multiple failed login attempts detected from suspicious IP range",
    severity: "critical",
    category: "Intrusion Detection",
    source: "Sentinel Agent",
    timestamp: new Date(Date.now() - 1000 * 60 * 2),
    location: "Gateway Server",
    details: "15 failed attempts from IP 192.168.1.x range within 30 seconds. Pattern suggests automated brute force attack. Source IPs have been temporarily blocked.",
  },
  {
    id: "2",
    title: "Threat Intelligence Update",
    description: "New ransomware variant identified affecting financial sector",
    severity: "high",
    category: "Intelligence",
    source: "OSINT Agent",
    timestamp: new Date(Date.now() - 1000 * 60 * 15),
    details: "IOCs have been updated in the threat database. All perimeter systems scanning for indicators.",
  },
  {
    id: "3",
    title: "Anomalous Network Traffic",
    description: "Unusual outbound data transfer pattern detected",
    severity: "medium",
    category: "Network Monitor",
    source: "Monitor Agent",
    timestamp: new Date(Date.now() - 1000 * 60 * 45),
    location: "Workstation WS-042",
    details: "2.3GB outbound transfer to external IP. Under investigation - may be legitimate backup activity.",
  },
  {
    id: "4",
    title: "System Health Check Complete",
    description: "All primary security systems operating normally",
    severity: "low",
    category: "Status",
    source: "Aegis",
    timestamp: new Date(Date.now() - 1000 * 60 * 60),
    details: "Daily automated health check completed. All 47 monitored endpoints responding. No anomalies detected.",
  },
  {
    id: "5",
    title: "Firewall Rule Update",
    description: "New egress rules deployed successfully",
    severity: "low",
    category: "Configuration",
    source: "Sentinel Agent",
    timestamp: new Date(Date.now() - 1000 * 60 * 120),
    details: "12 new blocking rules deployed based on latest threat intelligence. No service disruption reported.",
  },
];

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

function SignalCard({ signal }: { signal: SignalItem }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = severityConfig[signal.severity];
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
        style={{ borderLeftColor: `hsl(var(--${signal.severity}))` }}
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
                  {signal.severity.toUpperCase()}
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
                  {formatTimeAgo(signal.timestamp)}
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
            {isExpanded && signal.details && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {signal.details}
                  </p>
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
  const [signals] = useState<SignalItem[]>(mockSignals);

  return (
    <ScrollArea className="flex-1 px-4 py-4">
      <div className="space-y-3 pb-4">
        <AnimatePresence>
          {signals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </AnimatePresence>
      </div>
    </ScrollArea>
  );
}
