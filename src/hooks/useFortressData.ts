import { useQuery } from "@tanstack/react-query";
import { fortressClient } from "@/lib/fortress-client";

// Types matching Fortress platform database - complete signal data
export interface Signal {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  source: string;
  created_at: string;
  location?: string;
  details?: string;
  status?: string;
  assignee?: string;
  metadata?: Record<string, any>;
  raw?: Record<string, any>; // Full raw signal for complete platform access
}

export interface Agent {
  id: string;
  name: string;
  type: "ai" | "human";
  role: string;
  description: string;
  status: "online" | "busy" | "offline";
  capabilities: string[];
  avatar_url?: string;
}

export interface Operator {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role?: string;
  status?: "online" | "busy" | "offline";
}

export function useSignals() {
  return useQuery({
    queryKey: ["fortress-signals"],
    queryFn: async () => {
      // Try multiple table names for cross-platform compatibility
      const SIGNAL_TABLES = ["signals", "security_signals", "alerts"] as const;
      
      for (const table of SIGNAL_TABLES) {
        const { data, error } = await fortressClient
          .from(table)
          .select("*") // Fetch ALL fields for complete signal content
          .order("created_at", { ascending: false })
          .limit(100);

        if (!error && data) {
          console.log('[Signals] Raw signal data from platform:', data[0]); // Debug first signal
          
          // Map to Signal interface, preserving all extra fields
          return (data || []).map((signal: any) => ({
            id: signal.id,
            title: signal.title || signal.name || "Untitled Signal",
            description: signal.description || signal.summary || signal.message || "",
            severity: signal.severity || signal.priority || signal.level || "low",
            category: signal.category || signal.type || signal.signal_type || "General",
            source: signal.source || signal.origin || signal.source_system || "Platform",
            created_at: signal.created_at || signal.timestamp,
            location: signal.location || signal.geo_location || signal.area || null,
            // Try multiple field names for details content
            details: signal.details || signal.content || signal.body || signal.notes || 
                     signal.raw_data || signal.full_description || signal.additional_info || null,
            status: signal.status || signal.state,
            assignee: signal.assignee || signal.assigned_to || signal.operator_id,
            metadata: signal.metadata || signal.extra_data || signal.context,
            raw: signal, // Keep full raw signal for complete access
          })) as Signal[];
        }

        const code = (error as any)?.code;
        if (code && code !== "PGRST205" && code !== "42P01") {
          console.warn(`Error fetching from ${table}:`, error);
          break;
        }
      }

      return [];
    },
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 1000 * 60, // Refetch every minute
  });
}

export function useAgents() {
  return useQuery({
    queryKey: ["fortress-agents"],
    queryFn: async () => {
      // Fetch AI agents from agents table
      const { data, error } = await fortressClient
        .from("agents")
        .select("*")
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching agents:", error);
        return [];
      }

      return (data || []) as Agent[];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useAgentConversationAgents() {
  return useQuery({
    queryKey: ["fortress-conversation-agents"],
    queryFn: async () => {
      // Fetch unique agent names from agent_conversations
      const { data, error } = await fortressClient
        .from("agent_conversations")
        .select("title")
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error fetching agent conversations:", error);
        return [];
      }

      // Extract unique agent names from conversation titles like "Chat with RYAN-INTEL"
      const agentNames = new Set<string>();
      (data || []).forEach((conv: { title: string | null }) => {
        if (conv.title) {
          const match = conv.title.match(/^Chat with (.+)$/);
          if (match && match[1]) {
            agentNames.add(match[1]);
          }
        }
      });

      // Convert to Agent objects
      return Array.from(agentNames).map((name): Agent => ({
        id: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        name: name,
        type: "ai",
        role: "Specialized AI Agent",
        description: `AI agent from your conversation history`,
        status: "online",
        capabilities: ["Intelligence Analysis", "Task Support"],
      }));
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useOperators() {
  return useQuery({
    queryKey: ["fortress-operators"],
    queryFn: async () => {
      // Fetch human operators from profiles table
      const { data, error } = await fortressClient
        .from("profiles")
        .select("id, full_name, avatar_url")
        .order("full_name", { ascending: true });

      if (error) {
        console.error("Error fetching operators:", error);
        return [];
      }

      return (data || []).map((profile: any) => ({
        id: profile.id,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        status: "online" as const, // Default status
      })) as Operator[];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Subscribe to realtime updates for signals
export function useRealtimeSignals(onNewSignal: (signal: Signal) => void) {
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
        onNewSignal(payload.new as Signal);
      }
    )
    .subscribe();

  return () => {
    fortressClient.removeChannel(channel);
  };
}
