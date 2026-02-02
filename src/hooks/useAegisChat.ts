import { useState, useEffect, useCallback } from "react";
import { fortressClient } from "@/lib/fortress-client";
import { useToast } from "@/hooks/use-toast";

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

// Use the local Supabase edge function for AI chat
const AEGIS_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aegis-chat`;

// Fortress platform table names can vary between deployments.
// We try the known variants in order to ensure we always use REAL platform data.
const FORTRESS_CONVERSATION_TABLES = ["agent_conversations", "aegis_conversations"] as const;
const FORTRESS_MESSAGE_TABLES = ["agent_messages", "aegis_messages"] as const;

export function useAegisChat() {
  const [conversations, setConversations] = useState<AegisConversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [operator, setOperator] = useState<OperatorProfile | null>(null);
  const { toast } = useToast();

  // Get current user from Fortress
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await fortressClient.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getUser();

    // Listen for auth changes
    const { data: { subscription } } = fortressClient.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load user's conversations from Fortress when user is available
  useEffect(() => {
    if (userId) {
      loadConversations();
    }
  }, [userId]);

  // Load operator profile from auth user_metadata (most reliable source on Fortress)
  useEffect(() => {
    if (!userId) {
      setOperator(null);
      return;
    }

    let cancelled = false;
    (async () => {
      // Get the name from user_metadata which is always available from auth
      const { data: { user } } = await fortressClient.auth.getUser();
      
      if (cancelled) return;
      
      if (user) {
        // user_metadata.name is the most reliable source on Fortress
        const operatorName = user.user_metadata?.name ?? user.user_metadata?.full_name ?? null;
        setOperator({ 
          id: user.id, 
          name: operatorName,
        });
      } else {
        setOperator({ id: userId, name: null });
      }
    })();

    return () => {
      cancelled = true;
    };
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

    for (const table of FORTRESS_CONVERSATION_TABLES) {
      const { data, error } = await fortressClient
        .from(table)
        .select("id, title, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (!error && data) {
        setConversations(data);
        if (data.length > 0 && !currentConversationId) {
          setCurrentConversationId(data[0].id);
        }
        return;
      }

      // If table missing, try next name; otherwise stop.
      const code = (error as any)?.code;
      if (code && code !== "PGRST205") {
        console.warn("Failed to load conversations:", error.message);
        break;
      }
    }

    setConversations([]);
  };

  const loadMessages = async (conversationId: string) => {
    setIsLoading(true);

    for (const table of FORTRESS_MESSAGE_TABLES) {
      const { data, error } = await fortressClient
        .from(table)
        .select("id, role, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setMessages(
          data.map((m: any) => ({
            ...m,
            role: m.role as "user" | "assistant",
          }))
        );
        setIsLoading(false);
        return;
      }

      const code = (error as any)?.code;
      if (code && code !== "PGRST205") {
        console.warn("Failed to load messages:", error.message);
        break;
      }
    }

    setMessages([]);
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

    for (const table of FORTRESS_CONVERSATION_TABLES) {
      const { data, error } = await fortressClient
        .from(table)
        .insert({ user_id: userId })
        .select("id")
        .single();

      if (!error && data?.id) {
        setCurrentConversationId(data.id);
        loadConversations();
        return data.id;
      }

      const code = (error as any)?.code;
      if (code && code !== "PGRST205") {
        console.warn("Could not create conversation:", error.message);
        break;
      }
    }

    toast({
      variant: "destructive",
      title: "Chat unavailable",
      description: "Unable to create a conversation on the platform. Please try again later.",
    });
    return null;
  };

  const saveMessage = async (conversationId: string, role: "user" | "assistant", content: string) => {
    for (const table of FORTRESS_MESSAGE_TABLES) {
      const { data, error } = await fortressClient
        .from(table)
        .insert({
          conversation_id: conversationId,
          role,
          content,
        })
        .select("id, role, content, created_at")
        .single();

      if (!error && data) return data;

      const code = (error as any)?.code;
      if (code && code !== "PGRST205") {
        throw new Error(error.message);
      }
    }

    throw new Error("Platform messages table not available");
  };

  const updateConversationTitle = async (conversationId: string, firstMessage: string) => {
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : "");

    for (const table of FORTRESS_CONVERSATION_TABLES) {
      const { error } = await fortressClient
        .from(table)
        .update({ title })
        .eq("id", conversationId);

      if (!error) break;
      const code = (error as any)?.code;
      if (code && code !== "PGRST205") break;
    }

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
    for (const table of FORTRESS_CONVERSATION_TABLES) {
      const { error } = await fortressClient
        .from(table)
        .delete()
        .eq("id", id);
      if (!error) break;
      const code = (error as any)?.code;
      if (code && code !== "PGRST205") break;
    }
    
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
