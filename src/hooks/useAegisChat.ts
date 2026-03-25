import { useState, useEffect, useCallback, useMemo } from "react";
import { fortressClient } from "@/lib/fortress-client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/AuthProvider";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface AegisConversation {
  id: string;
  title: string | null;
  updated_at: string;
}

interface OperatorProfile {
  id: string;
  name: string | null;
  avatar_url?: string | null;
}

// Use Fortress edge function for AI chat (deployed to kpuqukppbmwebiptqmog)
const AEGIS_CHAT_URL = `https://kpuqukppbmwebiptqmog.supabase.co/functions/v1/aegis-chat`;

// Fortress platform table names — try in order until one works
const CONVERSATION_TABLES = [
  "agent_conversations",
  "aegis_conversations",
  "conversations",
  "chat_sessions",
  "chats",
] as const;
const MESSAGE_TABLES = [
  "agent_messages",
  "aegis_messages",
  "messages",
  "chat_messages",
] as const;
const CONVERSATION_TABLE = CONVERSATION_TABLES[0];
const MESSAGE_TABLE = MESSAGE_TABLES[0];

export function useAegisChat() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [conversations, setConversations] = useState<AegisConversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const { toast } = useToast();

  // Derive operator directly from the already-resolved auth user
  const operator: OperatorProfile | null = useMemo(() =>
    user
      ? {
          id: user.id,
          name: user.user_metadata?.name ?? user.user_metadata?.full_name ?? null,
        }
      : null,
    [user]
  );

  // Load conversations when auth resolves
  useEffect(() => {
    if (userId) {
      loadConversations();
    }
  }, [userId]);

  // Load messages when conversation changes
  useEffect(() => {
    if (currentConversationId) {
      loadMessages(currentConversationId);
    } else {
      setMessages([]);
    }
  }, [currentConversationId]);

  const loadConversations = async () => {
    if (!userId) return;

    for (const table of CONVERSATION_TABLES) {
      const { data, error } = await fortressClient
        .from(table)
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(50);


      if (!error && data) {
        console.log(`[Aegis] found conversations in table: ${table}, count: ${data.length}`);
        setConversations(
          data.map((c: any) => ({ id: c.id, title: c.title ?? null, updated_at: c.updated_at }))
        );
        if (data.length > 0 && !currentConversationId) {
          setCurrentConversationId(data[0].id);
        }
        return;
      }

      const code = (error as any)?.code;
      if (code === "PGRST205" || code === "42P01" || code === "PGRST116") continue;

      console.warn("Failed to load conversations:", error?.message);
      toast({
        variant: "destructive",
        title: "Could not load chat history",
        description: error?.message,
      });
      break;
    }
    setConversations([]);
  };

  const loadMessages = async (conversationId: string) => {
    setIsLoading(true);

    let data: any[] | null = null;
    for (const table of MESSAGE_TABLES) {
      const result = await fortressClient
        .from(table)
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });


      if (!result.error && result.data) { data = result.data; break; }
      const code = (result.error as any)?.code;
      if (code !== "PGRST205" && code !== "42P01" && code !== "PGRST116") break;
    }

    if (data) {
      setMessages(
        data.map((m: any) => ({
          ...m,
          role: m.role as "user" | "assistant",
        }))
      );
    } else {
      setMessages([]);
    }
    setIsLoading(false);
  };

  const createConversation = async (): Promise<string | null> => {
    if (!userId) {
      toast({
        variant: "destructive",
        title: "Not authenticated",
        description: "Please sign in to chat with Aegis",
      });
      return null;
    }

    // Fortress sets user_id automatically via RLS/trigger — no need to pass it
    const { data, error } = await fortressClient
      .from(CONVERSATION_TABLE)
      .insert({})
      .select("id")
      .single();

    if (!error && data?.id) {
      setCurrentConversationId(data.id);
      loadConversations();
      return data.id;
    }

    if (error) console.warn("Could not create conversation:", error.message);
    toast({
      variant: "destructive",
      title: "Chat unavailable",
      description: "Unable to create a conversation. Please try again later.",
    });
    return null;
  };

  const saveMessage = async (conversationId: string, role: "user" | "assistant", content: string) => {
    const { data, error } = await fortressClient
      .from(MESSAGE_TABLE)
      .insert({
        conversation_id: conversationId,
        role,
        content,
      })
      .select("id, role, content, created_at")
      .single();

    if (!error && data) return data;
    throw new Error(error?.message || "Failed to save message");
  };

  const updateConversationTitle = async (conversationId: string, firstMessage: string) => {
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : "");
    await fortressClient.from(CONVERSATION_TABLE).update({ title }).eq("id", conversationId);
    loadConversations();
  };

  const sendMessage = useCallback(async (input: string, platformContext?: string): Promise<string | null> => {
    if (!input.trim() || isStreaming) return null;

    let finalAssistantContent: string | null = null;

    let convId = currentConversationId;

    // Create new conversation if none exists
    if (!convId) {
      convId = await createConversation();
      if (!convId) return null;
    }

    // Optimistically add user message
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: input.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);

    // Save user message (no local fallback — platform is source of truth)
    try {
      const savedUserMsg = await saveMessage(convId, "user", input.trim());
      setMessages((prev) =>
        prev.map((m) =>
          m.id === userMessage.id
            ? { ...savedUserMsg, role: savedUserMsg.role as "user" | "assistant" }
            : m
        )
      );
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      setIsStreaming(false);
      toast({
        variant: "destructive",
        title: "Message not saved",
        description: e instanceof Error ? e.message : "Unable to save message to the platform",
      });
      return null;
    }

    // Update title if first message
    if (messages.length === 0) {
      updateConversationTitle(convId, input.trim());
    }

    // Prepare messages for API (ALWAYS include operator identity + full chat history)
    const operatorName = operator?.name?.trim() || null;
    const operatorContext = operatorName
      ? `Current operator: ${operatorName} (id: ${operator?.id ?? userId}).`
      : `Current operator id: ${operator?.id ?? userId}. (Name not available from profile.)`;

    const apiMessages = [
      { role: "system", content: operatorContext },
      ...[...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    try {
      const { data: { session } } = await fortressClient.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const resp = await fetch(AEGIS_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: apiMessages,
          conversationId: convId,
          platformContext: platformContext || null,
          operator: operator
            ? { id: operator.id, name: operator.name ?? null }
            : userId
              ? { id: userId, name: null }
              : null,
        }),
      });

      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || "Request failed");
      }

      if (!resp.body) throw new Error("No response body");

      // Stream the response
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assistantContent = "";
      const assistantId = `temp-assistant-${Date.now()}`;

      // Add placeholder assistant message
      setMessages(prev => [...prev, {
        id: assistantId,
        role: "assistant",
        content: "",
        created_at: new Date().toISOString(),
      }]);

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
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: assistantContent } : m
              ));
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Save complete assistant message (platform source of truth)
      if (assistantContent && convId) {
        try {
          const savedAssistantMsg = await saveMessage(convId, "assistant", assistantContent);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...savedAssistantMsg, role: savedAssistantMsg.role as "user" | "assistant" }
                : m
            )
          );
        } catch (e) {
          // Remove unsaved assistant output to avoid showing non-platform data
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          toast({
            variant: "destructive",
            title: "Response not saved",
            description: e instanceof Error ? e.message : "Unable to save response to the platform",
          });
        }
      }

      finalAssistantContent = assistantContent || null;

    } catch (error) {
      console.error("Chat error:", error);
      toast({
        variant: "destructive",
        title: "Communication Error",
        description: error instanceof Error ? error.message : "Failed to reach Aegis",
      });
      // Remove the empty assistant message on error
      setMessages(prev => prev.filter(m => m.content !== ""));
      finalAssistantContent = null;
    } finally {
      setIsStreaming(false);
    }

    return finalAssistantContent;
  }, [currentConversationId, messages, isStreaming, toast, userId, operator]);

  const startNewConversation = useCallback(() => {
    setCurrentConversationId(null);
    setMessages([]);
  }, []);

  const selectConversation = useCallback((id: string) => {
    setCurrentConversationId(id);
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    await fortressClient.from(CONVERSATION_TABLE).delete().eq("id", id);

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
  };
}
