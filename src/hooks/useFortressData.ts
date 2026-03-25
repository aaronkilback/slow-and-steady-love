import { useQuery } from "@tanstack/react-query";
import { fortressClient } from "@/lib/fortress-client";
import { supabase } from "@/integrations/supabase/client";

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
      
      const mapSignals = (data: any[]): Signal[] =>
        data.map((signal: any) => ({
          id: signal.id,
          title: signal.title || signal.name || "Untitled Signal",
          description: signal.description || signal.summary || "",
          severity: signal.severity || signal.priority || "low",
          category: signal.category || signal.type || "General",
          source: signal.source || signal.origin || "Platform",
          created_at: signal.created_at,
          location: signal.location || signal.geo_location || null,
          details: signal.details || signal.content || signal.raw_data || signal.body || null,
          status: signal.status,
          assignee: signal.assignee || signal.assigned_to,
          metadata: signal.metadata || signal.extra_data,
          raw: signal,
        }));

      for (const table of SIGNAL_TABLES) {
        // Try with tab=recent filter first
        const withTab = await fortressClient
          .from(table)
          .select("*")
          .eq("tab", "recent")
          .order("created_at", { ascending: false })
          .limit(100);

        if (!withTab.error && withTab.data) {
          return mapSignals(withTab.data);
        }

        const code = (withTab.error as any)?.code;
        const msg = (withTab.error as any)?.message || "";

        // Table doesn't exist — try the next one
        if (code === "PGRST205" || code === "42P01") continue;

        // Column 'tab' doesn't exist — fall back to all signals for this table
        if (code === "42703" || msg.includes("tab")) {
          const withoutTab = await fortressClient
            .from(table)
            .select("*")
            .order("created_at", { ascending: false })
            .limit(100);

          if (!withoutTab.error && withoutTab.data) {
            return mapSignals(withoutTab.data);
          }
        }

        // Any other error — stop trying
        console.warn(`Error fetching signals from ${table}:`, withTab.error);
        break;
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
      // Fetch unique agent names from conversation history.
      // Fortress deployments may use different table names; try the most likely ones.
      const TABLE_CANDIDATES = ["agent_conversations", "aegis_conversations"] as const;

      let data: any[] | null = null;
      let lastError: any = null;

      for (const table of TABLE_CANDIDATES) {
        // Only select title - agent_id may not exist on Fortress table
        const resp = await fortressClient
          .from(table)
          .select("title")
          .order("updated_at", { ascending: false })
          .limit(200);

        if (!resp.error) {
          data = resp.data as any[];
          lastError = null;
          break;
        }

        lastError = resp.error;
        const code = (resp.error as any)?.code;
        // Skip to next table if this one doesn't exist
        if (code === "PGRST205" || code === "42P01") continue;
        break;
      }

      if (!data) {
        if (lastError) console.error("Error fetching agent conversations:", lastError);
        return [];
      }

      // Extract unique agent names from conversation titles like "Chat with RYAN-INTEL"
      // and from agent_id field
      const agentNames = new Set<string>();
      (data || []).forEach((conv: { title: string | null }) => {
        // Extract agent name from title pattern "Chat with [AgentName]"
        if (conv.title) {
          const match = conv.title.match(/^Chat with (.+)$/i);
          if (match && match[1]) {
            // Clean up the agent name (remove trailing punctuation like )**")
            const agentName = match[1].replace(/[)\*]+$/, '').trim();
            if (agentName && agentName.toLowerCase() !== 'aegis') {
              agentNames.add(agentName);
            }
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

// Wraith cyber threat findings from Fortress
export interface WraithFinding {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  threat_type: string;
  vector: string;
  created_at: string;
  status?: string;
  recommendation?: string;
  raw?: Record<string, any>;
}

export function useWraithFindings() {
  return useQuery({
    queryKey: ["fortress-wraith-findings"],
    queryFn: async () => {
      // Fetch from Fortress tables AND breach check in parallel
      const tableFindings = await fetchWraithTableFindings();
      const breachFindings = await fetchBreachCheckFindings();

      // Merge and deduplicate by id, breach findings first (more actionable)
      const allFindings = [...breachFindings, ...tableFindings];
      const seen = new Set<string>();
      return allFindings.filter((f) => {
        if (seen.has(f.id)) return false;
        seen.add(f.id);
        return true;
      });
    },
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60 * 5, // 5 min for breach data
  });
}

async function fetchWraithTableFindings(): Promise<WraithFinding[]> {
  const WRAITH_TABLES = ["wraith_findings", "cyber_threats", "device_threats"] as const;

  for (const table of WRAITH_TABLES) {
    const { data, error } = await fortressClient
      .from(table)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error && data) {
      return (data || []).map((finding: any) => ({
        id: finding.id,
        title: finding.title || finding.name || "Untitled Threat",
        description: finding.description || finding.summary || "",
        severity: finding.severity || finding.risk_level || "medium",
        threat_type: finding.threat_type || finding.type || finding.category || "unknown",
        vector: finding.vector || finding.attack_vector || finding.source || "unknown",
        created_at: finding.created_at,
        status: finding.status || "detected",
        recommendation: finding.recommendation || finding.mitigation || finding.action || null,
        raw: finding,
      })) as WraithFinding[];
    }

    const code = (error as any)?.code;
    if (code && code !== "PGRST205" && code !== "42P01") {
      console.warn(`Error fetching from ${table}:`, error);
      break;
    }
  }

  // Fallback: filter signals from Wraith source
  const { data: signalData, error: signalError } = await fortressClient
    .from("signals")
    .select("*")
    .or("source.ilike.%wraith%,category.ilike.%cyber%,category.ilike.%device%,category.ilike.%wifi%,category.ilike.%bluetooth%")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!signalError && signalData) {
    return (signalData || []).map((s: any) => ({
      id: s.id,
      title: s.title || "Untitled Threat",
      description: s.description || "",
      severity: s.severity || "medium",
      threat_type: s.category || "cyber",
      vector: s.source || "network",
      created_at: s.created_at,
      status: s.status || "detected",
      recommendation: s.details || null,
      raw: s,
    })) as WraithFinding[];
  }

  return [];
}

async function fetchBreachCheckFindings(): Promise<WraithFinding[]> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.access_token) return [];

    const response = await supabase.functions.invoke("wraith-breach-check", {
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
    });

    if (response.error) {
      console.warn("Breach check failed:", response.error);
      return [];
    }

    const result = response.data;
    if (result?.findings && Array.isArray(result.findings)) {
      return result.findings as WraithFinding[];
    }

    return [];
  } catch (err) {
    console.warn("Breach check error:", err);
    return [];
  }
}
