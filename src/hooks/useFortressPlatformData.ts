import { useState, useEffect, useCallback } from "react";
import { fortressClient } from "@/lib/fortress-client";

interface Signal {
  id: string;
  type: string;
  priority: string;
  title: string;
  description?: string;
  status: string;
  created_at: string;
}

interface UserLocation {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  status: string;
  updated_at: string;
  profile?: {
    name?: string;
    full_name?: string;
  };
}

interface TeamProfile {
  id: string;
  name?: string;
  full_name?: string;
  avatar_url?: string;
  role?: string;
  status?: string;
}

interface FortressPlatformData {
  signals: Signal[];
  locations: UserLocation[];
  profiles: TeamProfile[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// Table name variants for cross-platform compatibility
const SIGNAL_TABLES = ["signals", "security_signals", "alerts"] as const;
const LOCATION_TABLES = ["user_locations", "locations", "operator_locations"] as const;
const PROFILE_TABLES = ["profiles", "users", "operators"] as const;

async function tryFetchFromTables<T>(
  tables: readonly string[],
  queryFn: (table: string) => Promise<{ data: T[] | null; error: any }>
): Promise<T[]> {
  for (const table of tables) {
    try {
      const { data, error } = await queryFn(table);
      if (!error && data) {
        return data;
      }
      // If table doesn't exist, try next
      const code = (error as any)?.code;
      if (code && code !== "PGRST205" && code !== "42P01") {
        console.warn(`Error fetching from ${table}:`, error.message);
        break;
      }
    } catch (e) {
      console.warn(`Exception fetching from ${table}:`, e);
    }
  }
  return [];
}

export function useFortressPlatformData(): FortressPlatformData {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [locations, setLocations] = useState<UserLocation[]>([]);
  const [profiles, setProfiles] = useState<TeamProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch signals - recent active signals
      const signalsData = await tryFetchFromTables<Signal>(SIGNAL_TABLES, async (table) => {
        const result = await fortressClient
          .from(table)
          .select("id, type, priority, title, description, status, created_at")
          .order("created_at", { ascending: false })
          .limit(20);
        return result;
      });
      setSignals(signalsData);

      // Fetch user locations with profiles
      const locationsData = await tryFetchFromTables<UserLocation>(LOCATION_TABLES, async (table) => {
        const result = await fortressClient
          .from(table)
          .select("id, user_id, latitude, longitude, status, updated_at")
          .order("updated_at", { ascending: false })
          .limit(50);
        return result;
      });
      setLocations(locationsData);

      // Fetch team profiles
      const profilesData = await tryFetchFromTables<TeamProfile>(PROFILE_TABLES, async (table) => {
        const result = await fortressClient
          .from(table)
          .select("id, name, full_name, avatar_url")
          .limit(100);
        return result;
      });
      setProfiles(profilesData);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to fetch platform data";
      setError(msg);
      console.error("[FortressPlatformData]", msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    signals,
    locations,
    profiles,
    isLoading,
    error,
    refresh: fetchData,
  };
}

/**
 * Generates a concise summary of platform data for AI context
 */
export function generatePlatformSummary(data: {
  signals: Signal[];
  locations: UserLocation[];
  profiles: TeamProfile[];
}): string {
  const { signals, locations, profiles } = data;

  const lines: string[] = [];

  // Signals summary
  if (signals.length > 0) {
    const critical = signals.filter((s) => s.priority === "critical" || s.priority === "high");
    const active = signals.filter((s) => s.status === "active" || s.status === "open");
    lines.push(`SIGNALS: ${signals.length} total, ${critical.length} high-priority, ${active.length} active.`);
    
    // List top 5 recent signals
    const topSignals = signals.slice(0, 5);
    if (topSignals.length > 0) {
      lines.push("Recent signals:");
      topSignals.forEach((s) => {
        lines.push(`- [${s.priority?.toUpperCase() || "INFO"}] ${s.title || s.type}${s.status ? ` (${s.status})` : ""}`);
      });
    }
  } else {
    lines.push("SIGNALS: No active signals detected.");
  }

  // Team status summary
  if (profiles.length > 0) {
    lines.push(`\nTEAM: ${profiles.length} operators registered.`);
    
    // List operators with locations/status
    if (locations.length > 0) {
      const activeCount = locations.filter((l) => l.status === "active" || l.status === "online").length;
      const idleCount = locations.filter((l) => l.status === "idle" || l.status === "away").length;
      const offlineCount = locations.length - activeCount - idleCount;
      lines.push(`Status: ${activeCount} active, ${idleCount} idle, ${offlineCount} offline.`);
    }
  }

  // If no data at all
  if (signals.length === 0 && profiles.length === 0 && locations.length === 0) {
    return "Platform data unavailable. Operating with limited intelligence.";
  }

  return lines.join("\n");
}
