import { motion } from "framer-motion";
import { Shield, Eye, Radio, Search, User, Bot, Loader2, RefreshCw, Ghost } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useAgents, useOperators, useAgentConversationAgents, Agent, Operator } from "@/hooks/useFortressData";
import { useToast } from "@/hooks/use-toast";

type AgentStatus = "online" | "busy" | "offline";

const statusConfig: Record<AgentStatus, { label: string; color: string; dotColor: string }> = {
  online: { label: "Online", color: "text-low", dotColor: "bg-low" },
  busy: { label: "Busy", color: "text-medium", dotColor: "bg-medium" },
  offline: { label: "Offline", color: "text-muted-foreground", dotColor: "bg-muted-foreground" },
};

// Default AI agents that are always present in Aegis
const defaultAiAgents: Agent[] = [
  {
    id: "aegis",
    name: "Aegis",
    type: "ai",
    role: "Lead Intelligence Agent",
    description: "Primary AI coordinator for threat analysis, system monitoring, and command orchestration",
    status: "online",
    capabilities: ["Threat Analysis", "Agent Coordination", "Intelligence Briefings", "System Monitoring"],
  },
  {
    id: "sentinel",
    name: "Sentinel",
    type: "ai",
    role: "Perimeter Defense Agent",
    description: "Monitors network boundaries and detects intrusion attempts in real-time",
    status: "online",
    capabilities: ["Firewall Management", "Intrusion Detection", "Access Control", "Traffic Analysis"],
  },
  {
    id: "osint",
    name: "OSINT Hunter",
    type: "ai",
    role: "Open Source Intelligence Agent",
    description: "Gathers and analyzes publicly available intelligence from multiple sources",
    status: "online",
    capabilities: ["Threat Intelligence", "Dark Web Monitoring", "Social Engineering Detection", "Brand Monitoring"],
  },
  {
    id: "monitor",
    name: "Monitor",
    type: "ai",
    role: "Network Analysis Agent",
    description: "Continuous surveillance of internal network traffic and endpoint behavior",
    status: "online",
    capabilities: ["Traffic Analysis", "Anomaly Detection", "Endpoint Monitoring", "Data Loss Prevention"],
  },
];

const agentIcons: Record<string, React.ElementType> = {
  aegis: Shield,
  sentinel: Eye,
  osint: Search,
  monitor: Radio,
  wraith: Ghost,
};

function AgentCard({ agent, onChat }: { agent: Agent; onChat: (agent: Agent) => void }) {
  const status = statusConfig[agent.status || "offline"];
  const Icon = agentIcons[agent.id] || Shield;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={cn(
          "p-4 border-border bg-card transition-colors",
          agent.status !== "offline" ? "cursor-pointer hover:bg-card/80" : "opacity-60"
        )}
        onClick={() => agent.status !== "offline" && onChat(agent)}
      >
        <div className="flex items-start gap-3">
          <div className={cn(
            "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
            "bg-primary/20"
          )}>
            <Icon className="h-6 w-6 text-primary" />
            <div className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card",
              status.dotColor
            )} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground truncate">{agent.name}</h3>
              <Badge variant="outline" className={cn("text-xs", status.color)}>
                <Bot className="h-3 w-3 mr-1" />
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
        </div>
      </Card>
    </motion.div>
  );
}

function OperatorCard({ operator, onChat }: { operator: Operator; onChat: (operator: Operator) => void }) {
  const status = statusConfig[operator.status || "offline"];
  const initials = operator.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={cn(
          "p-4 border-border bg-card transition-colors",
          operator.status !== "offline" ? "cursor-pointer hover:bg-card/80" : "opacity-60"
        )}
        onClick={() => operator.status !== "offline" && onChat(operator)}
      >
        <div className="flex items-start gap-3">
          <div className="relative">
            <Avatar className="h-12 w-12">
              <AvatarImage src={operator.avatar_url || undefined} alt={operator.full_name} />
              <AvatarFallback className="bg-secondary text-muted-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card",
              status.dotColor
            )} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground truncate">{operator.full_name}</h3>
              <Badge variant="outline" className={cn("text-xs", status.color)}>
                {status.label}
              </Badge>
            </div>
            <p className="text-xs text-primary mt-0.5">{operator.role || "Security Operator"}</p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export function AgentDirectory() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: fortressAgents = [], isLoading: agentsLoading, refetch: refetchAgents } = useAgents();
  const { data: conversationAgents = [], isLoading: conversationAgentsLoading, refetch: refetchConversationAgents } = useAgentConversationAgents();
  const { data: operators = [], isLoading: operatorsLoading, refetch: refetchOperators } = useOperators();

  const isLoading = agentsLoading || operatorsLoading || conversationAgentsLoading;
  
  // Merge default AI agents with agents from Fortress and conversation history
  const allAgentIds = new Set<string>();
  const mergedAgents: Agent[] = [];
  
  // Add default agents first
  defaultAiAgents.forEach(agent => {
    if (!allAgentIds.has(agent.id)) {
      allAgentIds.add(agent.id);
      mergedAgents.push(agent);
    }
  });
  
  // Add Fortress agents
  fortressAgents.filter(a => a.type === "ai").forEach(agent => {
    if (!allAgentIds.has(agent.id)) {
      allAgentIds.add(agent.id);
      mergedAgents.push(agent);
    }
  });
  
  // Add agents from conversation history
  conversationAgents.forEach(agent => {
    if (!allAgentIds.has(agent.id)) {
      allAgentIds.add(agent.id);
      mergedAgents.push(agent);
    }
  });
  
  const aiAgents = mergedAgents;

  const handleAgentChat = (agent: Agent) => {
    toast({
      title: `Connecting to ${agent.name}`,
      description: "Opening chat with agent...",
    });
    // Navigate to agent-specific chat page
    navigate(`/agent/${agent.id}`);
  };

  const handleOperatorChat = (operator: Operator) => {
    toast({
      title: `Messaging ${operator.full_name}`,
      description: "Opening direct message...",
    });
    // Navigate to messages with operator context
    sessionStorage.setItem("selectedOperator", JSON.stringify(operator));
    navigate("/messages");
  };

  const handleRefresh = () => {
    refetchAgents();
    refetchConversationAgents();
    refetchOperators();
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading agents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Refresh header */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-border">
        <span className="text-xs text-muted-foreground">
          {aiAgents.length + operators.length} agents
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          className="h-8 px-2"
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      <ScrollArea className="flex-1 px-4 py-4">
        <div className="space-y-6 pb-4">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <Bot className="h-4 w-4" />
              AI Agents
            </h2>
            <div className="space-y-3">
              {aiAgents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} onChat={handleAgentChat} />
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <User className="h-4 w-4" />
              Human Operators ({operators.length})
            </h2>
            <div className="space-y-3">
              {operators.length === 0 ? (
                <Card className="p-6 text-center">
                  <User className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground">No operators found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Operators from Fortress will appear here
                  </p>
                </Card>
              ) : (
                operators.map((operator) => (
                  <OperatorCard key={operator.id} operator={operator} onChat={handleOperatorChat} />
                ))
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
