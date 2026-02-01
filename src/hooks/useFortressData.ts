import { useQuery } from "@tanstack/react-query";
import { fortressClient } from "@/lib/fortress-client";

// Types matching Fortress platform database
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
      // Try to fetch from the signals table
      const { data, error } = await fortressClient
        .from("signals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error fetching signals:", error);
        // Return empty array if table doesn't exist or other error
        return [];
      }

      return (data || []) as Signal[];
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
