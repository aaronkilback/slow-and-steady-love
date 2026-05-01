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
  /** One-sentence persona / how the agent communicates. */
  description: string;
  /** Domain expertise — what this agent is the specialist for. */
  specialty?: string;
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

// CYBER_ADVISORY_CATEGORIES + classifySignal mirror the logic in
// Fortress webapp's SignalHistory.tsx so the mobile Recent feed matches
// what /signals shows under the Recent tab on Fortress. Updates here
// must stay in lockstep with Fortress.
const CYBER_ADVISORY_CATEGORIES = new Set([
  "cyber_threat",
  "vulnerability",
  "malware",
  "phishing",
  "data_breach",
  "ransomware",
]);

const INTERNATIONAL_URL_PATTERNS = [
  /locale=(?!en_CA|en_US)[a-z]{2}_[A-Z]{2}/i,
  /otagodailytimes/i, /maribyrnong/i, /netflixuk/i,
  /\.com\.au\b/, /\.co\.uk\b/, /\.co\.nz\b/, /\.de\b/, /\.fr\b/, /\.at\b/,
];
const INTERNATIONAL_CONTENT_PATTERNS = [
  /extinction rebellion\s+(austria|germany|uk|cape town|australia|netherlands|sweden|norway|france|italy|spain|japan)/i,
  /\b(new zealand|fonterra|melbourne|sydney|london|berlin|paris|tokyo)\b/i,
];

function isAutoHidden(s: any): boolean {
  return s.relevance_score != null && s.relevance_score === 0;
}

function isCyberAdvisory(s: any): boolean {
  const cat = s.rule_category || s.category || "";
  return CYBER_ADVISORY_CATEGORIES.has(cat) && (s.relevance_score ?? 1) < 0.55;
}

function isInternationalSignal(s: any): boolean {
  const sourceUrl = (s.source_url || s.raw_json?.source_url || s.raw_json?.url || "").toLowerCase();
  const text = `${s.normalized_text || ""} ${s.title || ""} ${s.description || ""}`.toLowerCase();
  if (INTERNATIONAL_URL_PATTERNS.some((p) => p.test(sourceUrl))) return true;
  if (INTERNATIONAL_CONTENT_PATTERNS.some((p) => p.test(text))) return true;
  return false;
}

function isQuestionableSignal(s: any): boolean {
  if (s.quality_score != null && s.quality_score < 0.4) return true;
  if (s.relevance_score != null && s.relevance_score > 0 && s.relevance_score < 0.4) return true;
  // confidence may be stored as 0-1 or 0-100; treat <0.3 / <30 as low
  const conf = s.confidence;
  if (typeof conf === "number") {
    const normalized = conf > 1 ? conf : conf * 100;
    if (normalized < 30) return true;
  }
  const text = `${s.normalized_text || ""} ${s.title || ""} ${s.description || ""}`.toLowerCase();
  const sourceUrl = (s.source_url || s.raw_json?.source_url || s.raw_json?.url || "").toLowerCase();
  if (/netflix|webinar|documentary|book launch|podcast/i.test(text)) return true;
  if (/netflix|spotify|youtube\.com\/watch/i.test(sourceUrl)) return true;
  if (s.normalized_text && s.normalized_text.length < 60) return true;
  return false;
}

function isWithin90Days(s: any): boolean {
  const date = new Date(s.event_date || s.created_at);
  return Date.now() - date.getTime() <= 90 * 24 * 60 * 60 * 1000;
}

/**
 * True when the signal belongs in the mobile Recent feed.
 * Mirrors classifySignal === 'recent' on Fortress webapp.
 * Exported so SignalFeed's realtime INSERT handler can apply the same
 * predicate.
 */
export function isRecentSignal(s: any): boolean {
  if (s.deleted_at) return false;
  // QA agent emits synthetic signals with is_test=true during test runs
  // (Wet'suwet'en land defender blockade variants, example.com sources,
  //  etc.). Fortress webapp filters these out at the query layer; mirror
  // that here so mobile doesn't show test data the operator never sees
  // on the Fortress signals page.
  if (s.is_test === true) return false;
  // Mobile is the "untouched signal" surface — once an analyst has
  // triaged / investigated / resolved / archived / false-positive'd a
  // signal in Fortress, drop it from the mobile feed automatically.
  // Treat null/missing status as 'new' so freshly-ingested signals
  // still appear before they've been classified.
  if (s.status && s.status !== "new") return false;
  // Mobile is for actionable signals, not informational reading.
  // Severity 'low' is reserved on Fortress for community outreach,
  // routine politics, distant geopolitical content — none of it
  // demands an operator open the app. Same applies to weak-signal
  // rows where quality_score didn't clear the actionability bar.
  const sev = (s.severity || "").toLowerCase();
  if (sev === "low") return false;
  if (typeof s.quality_score === "number" && s.quality_score < 0.7) return false;
  if (isAutoHidden(s)) return false;
  if (isCyberAdvisory(s)) return false;

  // Manual override takes precedence over auto-classification
  if (s.triage_override === "historical") return false;
  if (s.triage_override === "review") return false;
  if (s.triage_override === "international") return false;
  if (s.triage_override === "recent") return true;

  if (s.signal_type === "historical") return false;
  if (isInternationalSignal(s)) return false;
  if (isQuestionableSignal(s)) return false;
  if (!isWithin90Days(s)) return false;
  return true;
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

      // Fetch a generous window then apply the full Fortress-equivalent
      // Recent classifier client-side (see isRecentSignal). Doing this in
      // JS instead of PostgREST keeps every rule in one place and avoids
      // the chained-.or() bugs we hit before.
      for (const table of SIGNAL_TABLES) {
        const { data, error } = await fortressClient
          .from(table)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(300);

        if (!error && data) {
          const recent = data.filter(isRecentSignal);
          return mapSignals(recent).slice(0, 100);
        }

        const code = (error as any)?.code;
        if (code === "PGRST205" || code === "42P01") continue;

        console.warn(`Error fetching signals from ${table}:`, error);
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
      // Fortress stores agents in ai_agents (not "agents") with rich
      // persona / specialty / call_sign fields. Map them onto the
      // mobile Agent shape so the directory cards can show real
      // persona + specialty straight from Fortress.
      const { data, error } = await fortressClient
        .from("ai_agents")
        .select("id, codename, call_sign, persona, specialty, mission_scope, avatar_color, is_active")
        .eq("is_active", true)
        .order("call_sign", { ascending: true });

      if (error) {
        const code = (error as any)?.code;
        // Older deployments may not have ai_agents — silently fall back
        // to whatever defaults are merged in by AgentDirectory.
        if (code === "PGRST205" || code === "42P01") return [];
        console.error("Error fetching ai_agents:", error);
        return [];
      }

      return (data ?? []).map((row: any): Agent => ({
        id: row.id,
        name: row.call_sign || row.codename || "Agent",
        type: "ai",
        role: row.codename || "AI Agent",
        description: row.persona || "",
        specialty: row.specialty || row.mission_scope || undefined,
        status: "online",
        capabilities: [],
      }));
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
