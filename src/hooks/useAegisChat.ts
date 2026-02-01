import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
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

const AEGIS_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aegis-chat`;

export function useAegisChat() {
  const [conversations, setConversations] = useState<AegisConversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const { toast } = useToast();

  // Load user's conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Load messages when conversation changes
  useEffect(() => {
    if (currentConversationId) {
      loadMessages(currentConversationId);
    } else {
      setMessages([]);
    }
  }, [currentConversationId]);

  const loadConversations = async () => {
    const { data, error } = await supabase
      .from('aegis_conversations')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setConversations(data);
      // Auto-select most recent if none selected
      if (data.length > 0 && !currentConversationId) {
        setCurrentConversationId(data[0].id);
      }
    }
  };

  const loadMessages = async (conversationId: string) => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('aegis_messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data.map(m => ({
        ...m,
        role: m.role as "user" | "assistant"
      })));
    }
    setIsLoading(false);
  };

  const createConversation = async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('aegis_conversations')
      .insert({ user_id: user.id })
      .select('id')
      .single();

    if (error) {
      toast({
        variant: "destructive",
        title: "Failed to create conversation",
        description: error.message,
      });
      return null;
    }

    setCurrentConversationId(data.id);
    loadConversations();
    return data.id;
  };

  const saveMessage = async (conversationId: string, role: "user" | "assistant", content: string) => {
    const { data, error } = await supabase
      .from('aegis_messages')
      .insert({
        conversation_id: conversationId,
        role,
        content,
      })
      .select('id, role, content, created_at')
      .single();

    if (error) {
      console.error("Failed to save message:", error);
      return null;
    }

    return data;
  };

  const updateConversationTitle = async (conversationId: string, firstMessage: string) => {
    // Generate a title from the first message
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : "");
    await supabase
      .from('aegis_conversations')
      .update({ title })
      .eq('id', conversationId);
    loadConversations();
  };

  const sendMessage = useCallback(async (input: string) => {
    if (!input.trim() || isStreaming) return;

    let convId = currentConversationId;
    
    // Create new conversation if none exists
    if (!convId) {
      convId = await createConversation();
      if (!convId) return;
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

    // Save user message
    const savedUserMsg = await saveMessage(convId, "user", input.trim());
    if (savedUserMsg) {
      setMessages(prev => prev.map(m => m.id === userMessage.id ? { ...savedUserMsg, role: savedUserMsg.role as "user" | "assistant" } : m));
    }

    // Update title if first message
    if (messages.length === 0) {
      updateConversationTitle(convId, input.trim());
    }

    // Prepare messages for API
    const apiMessages = [...messages, userMessage].map(m => ({
      role: m.role,
      content: m.content
    }));

    try {
      const resp = await fetch(AEGIS_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: apiMessages }),
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

      // Save complete assistant message
      if (assistantContent && convId) {
        const savedAssistantMsg = await saveMessage(convId, "assistant", assistantContent);
        if (savedAssistantMsg) {
          setMessages(prev => prev.map(m => 
            m.id === assistantId ? { ...savedAssistantMsg, role: savedAssistantMsg.role as "user" | "assistant" } : m
          ));
        }
      }

    } catch (error) {
      console.error("Chat error:", error);
      toast({
        variant: "destructive",
        title: "Communication Error",
        description: error instanceof Error ? error.message : "Failed to reach Aegis",
      });
      // Remove the empty assistant message on error
      setMessages(prev => prev.filter(m => m.content !== ""));
    } finally {
      setIsStreaming(false);
    }
  }, [currentConversationId, messages, isStreaming, toast]);

  const startNewConversation = useCallback(() => {
    setCurrentConversationId(null);
    setMessages([]);
  }, []);

  const selectConversation = useCallback((id: string) => {
    setCurrentConversationId(id);
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    await supabase
      .from('aegis_conversations')
      .delete()
      .eq('id', id);
    
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
