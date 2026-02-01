import { motion } from "framer-motion";
import { Shield, Eye, Radio, Search, User, Bot, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type AgentStatus = "online" | "busy" | "offline";
type AgentType = "ai" | "human";

interface Agent {
  id: string;
  name: string;
  type: AgentType;
  role: string;
  description: string;
  status: AgentStatus;
  capabilities: string[];
  icon: React.ElementType;
}

const agents: Agent[] = [
  {
    id: "aegis",
    name: "Aegis",
    type: "ai",
    role: "Lead Intelligence Agent",
    description: "Primary AI coordinator for threat analysis, system monitoring, and command orchestration",
    status: "online",
    capabilities: ["Threat Analysis", "Agent Coordination", "Intelligence Briefings", "System Monitoring"],
    icon: Shield,
  },
  {
    id: "sentinel",
    name: "Sentinel",
    type: "ai",
    role: "Perimeter Defense Agent",
    description: "Monitors network boundaries and detects intrusion attempts in real-time",
    status: "online",
    capabilities: ["Firewall Management", "Intrusion Detection", "Access Control", "Traffic Analysis"],
    icon: Eye,
  },
  {
    id: "osint",
    name: "OSINT Hunter",
    type: "ai",
    role: "Open Source Intelligence Agent",
    description: "Gathers and analyzes publicly available intelligence from multiple sources",
    status: "busy",
    capabilities: ["Threat Intelligence", "Dark Web Monitoring", "Social Engineering Detection", "Brand Monitoring"],
    icon: Search,
  },
  {
    id: "monitor",
    name: "Monitor",
    type: "ai",
    role: "Network Analysis Agent",
    description: "Continuous surveillance of internal network traffic and endpoint behavior",
    status: "online",
    capabilities: ["Traffic Analysis", "Anomaly Detection", "Endpoint Monitoring", "Data Loss Prevention"],
    icon: Radio,
  },
  {
    id: "sarah",
    name: "Sarah Chen",
    type: "human",
    role: "Senior Security Analyst",
    description: "Lead analyst specializing in advanced persistent threats and incident response",
    status: "online",
    capabilities: ["Incident Response", "APT Analysis", "Forensics", "Team Lead"],
    icon: User,
  },
  {
    id: "marcus",
    name: "Marcus Williams",
    type: "human",
    role: "SOC Analyst",
    description: "Front-line security operations center analyst handling real-time alerts",
    status: "offline",
    capabilities: ["Alert Triage", "Log Analysis", "Escalation", "Documentation"],
    icon: User,
  },
];

const statusConfig: Record<AgentStatus, { label: string; color: string; dotColor: string }> = {
  online: { label: "Online", color: "text-low", dotColor: "bg-low" },
  busy: { label: "Busy", color: "text-medium", dotColor: "bg-medium" },
  offline: { label: "Offline", color: "text-muted-foreground", dotColor: "bg-muted-foreground" },
};

function AgentCard({ agent }: { agent: Agent }) {
  const status = statusConfig[agent.status];
  const Icon = agent.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="p-4 border-border bg-card hover:bg-card/80 transition-colors">
        <div className="flex items-start gap-3">
          <div className={cn(
            "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
            agent.type === "ai" ? "bg-primary/20" : "bg-secondary"
          )}>
            {agent.type === "ai" ? (
              <Icon className="h-6 w-6 text-primary" />
            ) : (
              <Icon className="h-6 w-6 text-muted-foreground" />
            )}
            <div className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card",
              status.dotColor
            )} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground truncate">{agent.name}</h3>
              <Badge variant="outline" className={cn("text-xs", status.color)}>
                {agent.type === "ai" ? <Bot className="h-3 w-3 mr-1" /> : null}
                {status.label}
              </Badge>
            </div>
            <p className="text-xs text-primary mt-0.5">{agent.role}</p>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {agent.description}
            </p>
            
            <div className="flex flex-wrap gap-1 mt-2">
              {agent.capabilities.slice(0, 3).map((cap) => (
                <Badge key={cap} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {cap}
                </Badge>
              ))}
              {agent.capabilities.length > 3 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  +{agent.capabilities.length - 3}
                </Badge>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            disabled={agent.status === "offline"}
          >
            <MessageCircle className="h-5 w-5" />
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}

export function AgentDirectory() {
  const aiAgents = agents.filter(a => a.type === "ai");
  const humanAgents = agents.filter(a => a.type === "human");

  return (
    <ScrollArea className="flex-1 px-4 py-4">
      <div className="space-y-6 pb-4">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Bot className="h-4 w-4" />
            AI Agents
          </h2>
          <div className="space-y-3">
            {aiAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <User className="h-4 w-4" />
            Human Operators
          </h2>
          <div className="space-y-3">
            {humanAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
