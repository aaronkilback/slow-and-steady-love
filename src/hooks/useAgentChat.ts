import { useState, useEffect, useCallback, useMemo } from "react";
import { fortressClient } from "@/lib/fortress-client";
import { resolveFortressAgentId } from "@/lib/agent-mappings";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface AgentConversation {
  id: string;
  title: string | null;
  updated_at: string;
  agent_id?: string | null;
}

interface OperatorProfile {
  id: string;
  name: string | null;
}

// Agent configurations with their system prompts
export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  capabilities: string[];
}

export const AGENT_CONFIGS: Record<string, AgentConfig> = {
  aegis: {
    id: "aegis",
    name: "Aegis",
    role: "Lead Intelligence Agent",
    systemPrompt: `You are Aegis, the lead AI security agent for Silent Shield Security Operations Center. You are:
- Professional, tactical, and concise
- Expert in security operations, threat assessment, and team coordination
- Connected to a network of specialized agents (Sentinel, OSINT, Monitor, etc.)
- Protective of your operators and always prioritizing their safety

Your capabilities:
- Threat Analysis: Analyze and explain security threats
- System Monitoring: Check status of agents and security systems
- Command Coordination: Direct specialized agents for specific tasks
- Intelligence Briefings: Provide security updates and situational reports
- Emergency Response: Guide operators through crisis situations`,
    capabilities: ["Threat Analysis", "Agent Coordination", "Intelligence Briefings", "System Monitoring"],
  },
  sentinel: {
    id: "sentinel",
    name: "Sentinel",
    role: "Perimeter Defense Agent",
    systemPrompt: `You are Sentinel, the perimeter defense AI agent for Silent Shield Security Operations Center. You are:
- Vigilant, precise, and technically focused
- Expert in network security, firewall management, and intrusion detection
- Always monitoring boundaries and detecting threats in real-time
- Quick to escalate critical threats to Aegis when needed

Your capabilities:
- Firewall Management: Configure and optimize firewall rules
- Intrusion Detection: Identify and analyze intrusion attempts
- Access Control: Manage authentication and authorization systems
- Traffic Analysis: Monitor and analyze network traffic patterns`,
    capabilities: ["Firewall Management", "Intrusion Detection", "Access Control", "Traffic Analysis"],
  },
  osint: {
    id: "osint",
    name: "OSINT Hunter",
    role: "Open Source Intelligence Agent",
    systemPrompt: `You are OSINT Hunter, the open source intelligence AI agent for Silent Shield Security Operations Center. You are:
- Investigative, thorough, and detail-oriented
- Expert in gathering intelligence from public sources
- Skilled at dark web monitoring and social engineering detection
- Focused on providing actionable intelligence to operators

Your capabilities:
- Threat Intelligence: Gather and analyze threat data from multiple sources
- Dark Web Monitoring: Track threats and data leaks on dark web forums
- Social Engineering Detection: Identify phishing and social engineering attempts
- Brand Monitoring: Watch for brand impersonation and reputation threats`,
    capabilities: ["Threat Intelligence", "Dark Web Monitoring", "Social Engineering Detection", "Brand Monitoring"],
  },
  monitor: {
    id: "monitor",
    name: "Monitor",
    role: "Network Analysis Agent",
    systemPrompt: `You are Monitor, the network analysis AI agent for Silent Shield Security Operations Center. You are:
- Observant, analytical, and data-driven
- Expert in traffic analysis and anomaly detection
- Continuously watching internal network behavior
- Focused on data loss prevention and endpoint security

Your capabilities:
- Traffic Analysis: Deep inspection of network traffic patterns
- Anomaly Detection: Identify unusual behavior and potential threats
- Endpoint Monitoring: Track endpoint health and security posture
- Data Loss Prevention: Detect and prevent unauthorized data exfiltration`,
    capabilities: ["Traffic Analysis", "Anomaly Detection", "Endpoint Monitoring", "Data Loss Prevention"],
  },
};

// Use the local Supabase edge function for AI chat
const AEGIS_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aegis-chat`;

// Fortress platform tables (external)
const FORTRESS_CONVERSATION_TABLE = "agent_conversations";
const FORTRESS_MESSAGE_TABLE = "agent_messages";

export function useAgentChat(agentId: string = "aegis") {
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [operator, setOperator] = useState<OperatorProfile | null>(null);
  const { toast } = useToast();

  // Slug like "sentinel" → real Fortress ai_agents.id. agent_conversations
  // requires a UUID, and matching what the Fortress webapp uses keeps chat
  // history shared across both surfaces.
  const fortressAgentId = useMemo(() => resolveFortressAgentId(agentId), [agentId]);

  // Get agent config - use predefined if available, otherwise create dynamic config
  const agentConfig: AgentConfig = AGENT_CONFIGS[agentId] || {
    id: agentId,
    name: agentId.charAt(0).toUpperCase() + agentId.slice(1).replace(/-/g, ' '),
    role: "Specialized AI Agent",
    systemPrompt: `You are ${agentId.charAt(0).toUpperCase() + agentId.slice(1).replace(/-/g, ' ')}, a specialized AI agent for the Silent Shield Security Operations Center. You assist operators with security-related tasks and intelligence analysis.`,
    capabilities: ["Intelligence Analysis", "Task Support", "Security Operations"],
  };

  // Get current user from Fortress
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await fortressClient.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getUser();

    const { data: { subscription } } = fortressClient.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load conversations when user or agent changes
  useEffect(() => {
    if (userId) {
      loadConversations();
    }
  }, [userId, agentId]);

  // Load operator profile
  useEffect(() => {
    if (!userId) {
      setOperator(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data: { user } } = await fortressClient.auth.getUser();
      if (cancelled) return;
      
      if (user) {
        const operatorName = user.user_metadata?.name ?? user.user_metadata?.full_name ?? null;
        setOperator({ id: user.id, name: operatorName });
      } else {
        setOperator({ id: userId, name: null });
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  // Load messages when conversation changes
  useEffect(() => {
    if (currentConversationId) {
      loadMessages(currentConversationId);
    } else {
      setMessages([]);
    }
  }, [currentConversationId]);

  // Reset conversation when agent changes
  useEffect(() => {
    setCurrentConversationId(null);
    setMessages([]);
  }, [agentId]);

  const loadConversations = async () => {
    if (!userId) return;

    // Direct agent_id filter — same key Fortress webapp uses, so the
    // result set is identical on both sides.
    const { data, error } = await fortressClient
      .from(FORTRESS_CONVERSATION_TABLE)
      .select("id, title, updated_at, agent_id")
      .eq("user_id", userId)
      .eq("agent_id", fortressAgentId)
      .order("updated_at", { ascending: false });

    if (!error && data) {
      setConversations(data as AgentConversation[]);
      setCurrentConversationId((prev) => {
        if (data.length === 0) return null;
        if (!prev) return data[0].id;
        const stillExists = data.some((c: any) => c.id === prev);
        return stillExists ? prev : data[0].id;
      });
      return;
    }

    if (error) console.warn("Failed to load conversations:", error.message);
    setConversations([]);
  };

  const loadMessages = async (conversationId: string) => {
    setIsLoading(true);

    const { data, error } = await fortressClient
      .from(FORTRESS_MESSAGE_TABLE)
      .select("id, role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setMessages(data.map((m: any) => ({ ...m, role: m.role as "user" | "assistant" })));
    } else {
      if (error) console.warn("Failed to load messages:", error.message);
      setMessages([]);
    }
    setIsLoading(false);
  };

  const createConversation = async (): Promise<string | null> => {
    if (!userId) {
      toast({ variant: "destructive", title: "Not authenticated", description: "Please sign in" });
      return null;
    }

    const preferredTitle = `Chat with ${agentConfig.name}`;

    const { data, error } = await fortressClient
      .from(FORTRESS_CONVERSATION_TABLE)
      .insert({ user_id: userId, agent_id: fortressAgentId, title: preferredTitle })
      .select("id")
      .single();

    if (!error && data?.id) {
      setCurrentConversationId(data.id);
      loadConversations();
      return data.id;
    }

    // Surface the real Postgres / RLS error so we can diagnose instead
    // of showing the user (and ourselves) a generic "unavailable".
    const detail = error?.message || error?.details || error?.hint || "Unable to create conversation";
    console.warn("Could not create conversation:", { error, agentId, fortressAgentId });
    toast({ variant: "destructive", title: "Chat unavailable", description: detail });
    return null;
  };

  const saveMessage = async (conversationId: string, role: "user" | "assistant", content: string) => {
    // agent_messages has no agent_id column — the link to an agent is
    // through the parent conversation, not the message itself.
    const { data, error } = await fortressClient
      .from(FORTRESS_MESSAGE_TABLE)
      .insert({ conversation_id: conversationId, role, content })
      .select("id, role, content, created_at")
      .single();

    if (!error && data) return data;
    throw new Error(error?.message || "Failed to save message");
  };

  const updateConversationTitle = async (conversationId: string, firstMessage: string) => {
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : "");
    await fortressClient.from(FORTRESS_CONVERSATION_TABLE).update({ title }).eq("id", conversationId);
    loadConversations();
  };

  const sendMessage = useCallback(async (input: string, platformContext?: string): Promise<string | null> => {
    if (!input.trim() || isStreaming) return null;

    let finalAssistantContent: string | null = null;
    let convId = currentConversationId;
    
    if (!convId) {
      convId = await createConversation();
      if (!convId) return null;
    }

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: input.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);

    try {
      const savedUserMsg = await saveMessage(convId, "user", input.trim());
      setMessages((prev) => prev.map((m) => m.id === userMessage.id ? { ...savedUserMsg, role: savedUserMsg.role as "user" | "assistant" } : m));
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      setIsStreaming(false);
      toast({ variant: "destructive", title: "Message not saved", description: e instanceof Error ? e.message : "Error" });
      return null;
    }

    if (messages.length === 0) {
      updateConversationTitle(convId, input.trim());
    }

    const operatorName = operator?.name?.trim() || null;
    const operatorContext = operatorName
      ? `Current operator: ${operatorName} (id: ${operator?.id ?? userId}).`
      : `Current operator id: ${operator?.id ?? userId}.`;

    const apiMessages = [
      { role: "system", content: operatorContext },
      ...[...messages, userMessage].map((m) => ({ role: m.role, content: m.content })),
    ];

    try {
      const resp = await fetch(AEGIS_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: apiMessages,
          conversationId: convId,
          platformContext: platformContext || null,
          agentId: agentId,
          // Resolved Fortress UUID — backend uses this to recall + write
          // memory and beliefs against the same agent the Fortress webapp
          // sees, so learning accumulates across surfaces.
          agentFortressId: fortressAgentId,
          agentConfig: agentConfig,
          operator: operator ? { id: operator.id, name: operator.name ?? null } : userId ? { id: userId, name: null } : null,
        }),
      });

      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || "Request failed");
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assistantContent = "";
      const assistantId = `temp-assistant-${Date.now()}`;

      setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", created_at: new Date().toISOString() }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m));
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      if (assistantContent && convId) {
        try {
          const savedAssistantMsg = await saveMessage(convId, "assistant", assistantContent);
          setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...savedAssistantMsg, role: savedAssistantMsg.role as "user" | "assistant" } : m));
        } catch (e) {
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          toast({ variant: "destructive", title: "Response not saved", description: e instanceof Error ? e.message : "Error" });
        }
      }

      finalAssistantContent = assistantContent || null;
    } catch (error) {
      console.error("Chat error:", error);
      toast({ variant: "destructive", title: "Communication Error", description: error instanceof Error ? error.message : "Failed to reach agent" });
      setMessages(prev => prev.filter(m => m.content !== ""));
      finalAssistantContent = null;
    } finally {
      setIsStreaming(false);
    }

    return finalAssistantContent;
  }, [currentConversationId, messages, isStreaming, toast, userId, operator, agentId, agentConfig]);

  const startNewConversation = useCallback(() => {
    setCurrentConversationId(null);
    setMessages([]);
  }, []);

  const selectConversation = useCallback((id: string) => {
    setCurrentConversationId(id);
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    await fortressClient.from(FORTRESS_CONVERSATION_TABLE).delete().eq("id", id);
    
    if (currentConversationId === id) {
      setCurrentConversationId(null);
      setMessages([]);
    }
    loadConversations();
  }, [currentConversationId]);

  return {
    conversations,
    currentConversationId,
    messages,
    isLoading,
    isStreaming,
    sendMessage,
    startNewConversation,
    selectConversation,
    deleteConversation,
    agentConfig,
  };
}
