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
  severity?: string;
  category?: string;
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

interface Agent {
  id: string;
  name: string;
  type: string;
  role?: string;
  status?: string;
}

interface FortressPlatformData {
  signals: Signal[];
  locations: UserLocation[];
  profiles: TeamProfile[];
  agents: Agent[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// Table name variants for cross-platform compatibility
const SIGNAL_TABLES = ["signals", "security_signals", "alerts"] as const;
const LOCATION_TABLES = ["user_locations", "locations", "operator_locations"] as const;
const PROFILE_TABLES = ["profiles", "users", "operators"] as const;
const AGENT_TABLES = ["agents", "ai_agents"] as const;
const CONVERSATION_TABLES = ["agent_conversations", "aegis_conversations"] as const;

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
  const [agents, setAgents] = useState<Agent[]>([]);
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

      // Fetch agents from agents table
      const agentsData = await tryFetchFromTables<Agent>(AGENT_TABLES, async (table) => {
        const result = await fortressClient
          .from(table)
          .select("id, name, type, role, status")
          .limit(50);
        return result;
      });

      // Also discover agents from conversation titles
      const conversationAgents: Agent[] = [];
      for (const table of CONVERSATION_TABLES) {
        try {
          const { data, error: convError } = await fortressClient
            .from(table)
            .select("title")
            .order("updated_at", { ascending: false })
            .limit(100);
          
          if (!convError && data) {
            const seenNames = new Set<string>();
            data.forEach((conv: { title: string | null }) => {
              if (conv.title) {
                const match = conv.title.match(/^Chat with (.+)$/);
                if (match && match[1] && !seenNames.has(match[1])) {
                  seenNames.add(match[1]);
                  conversationAgents.push({
                    id: match[1].toLowerCase().replace(/[^a-z0-9]/g, '-'),
                    name: match[1],
                    type: "ai",
                    role: "Specialized AI Agent",
                    status: "online",
                  });
                }
              }
            });
            break;
          }
        } catch {
          // Continue to next table
        }
      }

      // Merge agents, avoiding duplicates
      const allAgents = [...agentsData];
      const existingIds = new Set(allAgents.map(a => a.id));
      conversationAgents.forEach(a => {
        if (!existingIds.has(a.id)) {
          allAgents.push(a);
        }
      });
      setAgents(allAgents);
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
    agents,
    isLoading,
    error,
    refresh: fetchData,
  };
}

/**
 * Categorizes signals for travel risk analysis
 */
function categorizeSignalsForTravel(signals: Signal[]): {
  weather: Signal[];
  disasters: Signal[];
  geopolitical: Signal[];
  security: Signal[];
  health: Signal[];
  infrastructure: Signal[];
  travel: Signal[];
  other: Signal[];
} {
  const categories = {
    weather: [] as Signal[],
    disasters: [] as Signal[],
    geopolitical: [] as Signal[],
    security: [] as Signal[],
    health: [] as Signal[],
    infrastructure: [] as Signal[],
    travel: [] as Signal[],
    other: [] as Signal[],
  };

  const categoryPatterns = {
    weather: /weather|storm|hurricane|typhoon|tornado|flood|rain|snow|heat|cold|temperature|climate|wind|lightning|forecast/i,
    disasters: /earthquake|tsunami|volcano|wildfire|fire|landslide|avalanche|disaster|emergency|evacuation|natural/i,
    geopolitical: /conflict|war|military|protest|civil|unrest|political|government|coup|sanction|border|embargo|diplomatic|terrorism|attack/i,
    security: /crime|theft|robbery|assault|kidnap|hostage|threat|violence|gang|cartel|piracy|security|danger|warning/i,
    health: /health|disease|outbreak|epidemic|pandemic|virus|covid|flu|medical|hospital|quarantine|vaccination|illness/i,
    infrastructure: /power|electricity|blackout|outage|transport|airport|road|highway|bridge|internet|communication|fuel|shortage/i,
    travel: /travel|flight|airline|visa|entry|exit|restriction|advisory|tourism|hotel|accommodation/i,
  };

  signals.forEach((signal) => {
    const text = `${signal.title} ${signal.description || ""} ${signal.category || ""} ${signal.type || ""}`.toLowerCase();
    let matched = false;

    for (const [category, pattern] of Object.entries(categoryPatterns)) {
      if (pattern.test(text)) {
        categories[category as keyof typeof categories].push(signal);
        matched = true;
        break;
      }
    }

    if (!matched) {
      categories.other.push(signal);
    }
  });

  return categories;
}

/**
 * Generates a comprehensive summary of platform data for AI context,
 * optimized for travel risk assessment
 */
export function generatePlatformSummary(data: {
  signals: Signal[];
  locations: UserLocation[];
  profiles: TeamProfile[];
  agents?: Agent[];
}): string {
  const { signals, locations, profiles, agents = [] } = data;
  const lines: string[] = [];

  // Categorize signals for travel risk analysis
  const categorized = categorizeSignalsForTravel(signals);

  // High-level overview
  const critical = signals.filter((s) => s.priority === "critical" || s.priority === "high" || s.severity === "critical" || s.severity === "high");
  const active = signals.filter((s) => s.status === "active" || s.status === "open");
  
  lines.push("=== PLATFORM INTELLIGENCE BRIEFING ===\n");
  lines.push(`OVERVIEW: ${signals.length} total signals, ${critical.length} high-priority, ${active.length} active.\n`);

  // Weather & Climate Intelligence
  if (categorized.weather.length > 0) {
    lines.push("🌦️ WEATHER & CLIMATE:");
    categorized.weather.slice(0, 5).forEach((s) => {
      const priority = s.priority || s.severity || "info";
      lines.push(`  - [${priority.toUpperCase()}] ${s.title}${s.description ? `: ${s.description.slice(0, 100)}` : ""}`);
    });
    if (categorized.weather.length > 5) lines.push(`  ... and ${categorized.weather.length - 5} more weather alerts`);
    lines.push("");
  }

  // Natural Disasters
  if (categorized.disasters.length > 0) {
    lines.push("🌋 NATURAL DISASTERS:");
    categorized.disasters.slice(0, 5).forEach((s) => {
      const priority = s.priority || s.severity || "info";
      lines.push(`  - [${priority.toUpperCase()}] ${s.title}${s.description ? `: ${s.description.slice(0, 100)}` : ""}`);
    });
    if (categorized.disasters.length > 5) lines.push(`  ... and ${categorized.disasters.length - 5} more disaster alerts`);
    lines.push("");
  }

  // Geopolitical & Conflict
  if (categorized.geopolitical.length > 0) {
    lines.push("🌐 GEOPOLITICAL & CONFLICT:");
    categorized.geopolitical.slice(0, 5).forEach((s) => {
      const priority = s.priority || s.severity || "info";
      lines.push(`  - [${priority.toUpperCase()}] ${s.title}${s.description ? `: ${s.description.slice(0, 100)}` : ""}`);
    });
    if (categorized.geopolitical.length > 5) lines.push(`  ... and ${categorized.geopolitical.length - 5} more geopolitical alerts`);
    lines.push("");
  }

  // Security Threats
  if (categorized.security.length > 0) {
    lines.push("🔒 SECURITY THREATS:");
    categorized.security.slice(0, 5).forEach((s) => {
      const priority = s.priority || s.severity || "info";
      lines.push(`  - [${priority.toUpperCase()}] ${s.title}${s.description ? `: ${s.description.slice(0, 100)}` : ""}`);
    });
    if (categorized.security.length > 5) lines.push(`  ... and ${categorized.security.length - 5} more security alerts`);
    lines.push("");
  }

  // Health & Medical
  if (categorized.health.length > 0) {
    lines.push("🏥 HEALTH & MEDICAL:");
    categorized.health.slice(0, 5).forEach((s) => {
      const priority = s.priority || s.severity || "info";
      lines.push(`  - [${priority.toUpperCase()}] ${s.title}${s.description ? `: ${s.description.slice(0, 100)}` : ""}`);
    });
    if (categorized.health.length > 5) lines.push(`  ... and ${categorized.health.length - 5} more health alerts`);
    lines.push("");
  }

  // Infrastructure & Utilities
  if (categorized.infrastructure.length > 0) {
    lines.push("🔌 INFRASTRUCTURE & UTILITIES:");
    categorized.infrastructure.slice(0, 5).forEach((s) => {
      const priority = s.priority || s.severity || "info";
      lines.push(`  - [${priority.toUpperCase()}] ${s.title}${s.description ? `: ${s.description.slice(0, 100)}` : ""}`);
    });
    if (categorized.infrastructure.length > 5) lines.push(`  ... and ${categorized.infrastructure.length - 5} more infrastructure alerts`);
    lines.push("");
  }

  // Travel Advisories
  if (categorized.travel.length > 0) {
    lines.push("✈️ TRAVEL ADVISORIES:");
    categorized.travel.slice(0, 5).forEach((s) => {
      const priority = s.priority || s.severity || "info";
      lines.push(`  - [${priority.toUpperCase()}] ${s.title}${s.description ? `: ${s.description.slice(0, 100)}` : ""}`);
    });
    if (categorized.travel.length > 5) lines.push(`  ... and ${categorized.travel.length - 5} more travel advisories`);
    lines.push("");
  }

  // Other/Uncategorized signals
  if (categorized.other.length > 0) {
    lines.push("📋 OTHER INTELLIGENCE:");
    categorized.other.slice(0, 3).forEach((s) => {
      const priority = s.priority || s.severity || "info";
      lines.push(`  - [${priority.toUpperCase()}] ${s.title}`);
    });
    if (categorized.other.length > 3) lines.push(`  ... and ${categorized.other.length - 3} more signals`);
    lines.push("");
  }

  // Agents summary
  if (agents.length > 0) {
    const onlineAgents = agents.filter((a) => a.status === "online");
    lines.push(`🤖 AGENTS: ${agents.length} available (${onlineAgents.length} online)`);
    lines.push("  Available: " + agents.map(a => a.name).join(", "));
    lines.push("");
  }

  // Team status summary
  if (profiles.length > 0) {
    lines.push(`👥 TEAM: ${profiles.length} operators registered`);
    
    if (locations.length > 0) {
      const activeCount = locations.filter((l) => l.status === "active" || l.status === "online").length;
      const idleCount = locations.filter((l) => l.status === "idle" || l.status === "away").length;
      const offlineCount = locations.length - activeCount - idleCount;
      lines.push(`  Status: ${activeCount} active, ${idleCount} idle, ${offlineCount} offline`);
      
      // Group locations by region if available
      const locationsWithCoords = locations.filter(l => l.latitude && l.longitude);
      if (locationsWithCoords.length > 0) {
        lines.push(`  ${locationsWithCoords.length} operators with known locations`);
      }
    }
    lines.push("");
  }

  // No data fallback
  if (signals.length === 0 && profiles.length === 0 && locations.length === 0 && agents.length === 0) {
    return "Platform data unavailable. Operating with limited intelligence.";
  }

  // Travel risk guidance
  lines.push("=== TRAVEL RISK ANALYSIS GUIDANCE ===");
  lines.push("When assessing travel risks, consider:");
  lines.push("• Weather conditions at origin, destination, and transit points");
  lines.push("• Active natural disasters and evacuation zones");
  lines.push("• Geopolitical stability and civil unrest");
  lines.push("• Local security threats and crime rates");
  lines.push("• Health advisories, disease outbreaks, and medical infrastructure");
  lines.push("• Transportation disruptions and infrastructure status");
  lines.push("• Entry/exit requirements, visa restrictions, and travel bans");
  lines.push("• Team member locations and emergency extraction routes");

  return lines.join("\n");
}
