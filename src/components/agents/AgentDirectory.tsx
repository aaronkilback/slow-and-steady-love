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

// Featured agents shown at the top of the mobile roster. These are the
// Fortress call_signs we want operators to reach for first; the actual
// persona / specialty / display name for each comes from the live
// ai_agents row on Fortress, so mobile and the Fortress webapp roster
// always show the SAME names. (Previously mobile shipped its own
// hardcoded "OSINT Hunter" / "Sentinel" copies which led to operators
// looking for those names on Fortress and not finding them.)
const FEATURED_CALL_SIGNS = [
  "AEGIS-CMD",
  "AUTO-SENT",
  "ECHO-WATCH",
  "MATRIX",
  "WRAITH",
  "GUARDIAN",
  "HORATIO",
  "ARGUS",
];

// Icons keyed by Fortress call_sign. Falls back to a generic shield
// for any agent we haven't picked an icon for yet.
const agentIcons: Record<string, React.ElementType> = {
  "AEGIS-CMD": Shield,
  "AUTO-SENT": Eye,
  "ECHO-WATCH": Search,
  "MATRIX": Radio,
  "WRAITH": Ghost,
};

function AgentCard({ agent, onChat }: { agent: Agent; onChat: (agent: Agent) => void }) {
  const status = statusConfig[agent.status || "offline"];
  const Icon = agentIcons[agent.name?.toUpperCase()] || Shield;

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
            {agent.specialty && (
              <p className="text-xs text-foreground/80 mt-1 line-clamp-2">
                <span className="font-medium text-muted-foreground">Specialty:</span>{" "}
                {agent.specialty}
              </p>
            )}

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

  // Order: featured Fortress agents first (in the order listed in
  // FEATURED_CALL_SIGNS), then the rest of the active Fortress roster,
  // then any agents discovered only through prior conversation history.
  // Names, persona, and specialty come straight from Fortress so the
  // mobile cards mirror what /command-center shows.
  const aiAgents: Agent[] = (() => {
    const seen = new Set<string>();
    const out: Agent[] = [];

    const fortressByCallSign = new Map<string, Agent>();
    fortressAgents.filter(a => a.type === "ai").forEach(a => {
      fortressByCallSign.set(a.name.toUpperCase(), a);
    });

    for (const cs of FEATURED_CALL_SIGNS) {
      const a = fortressByCallSign.get(cs.toUpperCase());
      if (a && !seen.has(a.id)) {
        seen.add(a.id);
        out.push(a);
      }
    }

    fortressAgents.filter(a => a.type === "ai").forEach(a => {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        out.push(a);
      }
    });

    conversationAgents.forEach(a => {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        out.push(a);
      }
    });

    return out;
  })();

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
