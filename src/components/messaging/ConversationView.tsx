import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, Loader2, MapPin, Shield, UserPlus, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { fortressClient } from "@/lib/fortress-client";
import { useToast } from "@/hooks/use-toast";
import { useEncryption } from "@/hooks/useEncryption";
import { LocationMap } from "./LocationMap";
import { AttachmentPicker, AttachmentPreviewBar, type Attachment } from "./AttachmentPicker";
import { MessageAttachments, type MessageAttachment } from "./MessageAttachments";
import { AegisAlert, AegisMonitoringBadge } from "./AegisAlert";
import { SOSButton } from "./SOSButton";
import { EncryptionStatus } from "@/components/encryption/EncryptionStatus";
import { EncryptionSetup } from "@/components/encryption/EncryptionSetup";
import { EncryptionUnlock } from "@/components/encryption/EncryptionUnlock";
import { AddOperatorsDialog } from "./AddOperatorsDialog";
import {
  AgentMentionTypeahead,
  shortenSpecialty,
  type MentionableAgent,
  type AgentMentionTypeaheadHandle,
} from "./AgentMentionTypeahead";
import { useAgents } from "@/hooks/useFortressData";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  content: string;
  sender_id: string | null;
  agent_id?: string | null;
  agent_call_sign?: string | null;
  is_agent_query?: boolean;
  mentioned_agent_id?: string | null;
  created_at: string;
  attachments?: MessageAttachment[];
  encrypted?: boolean;
  nonce?: string | null;
  decryptedContent?: string;
  sender?: {
    full_name: string;
    avatar_url: string | null;
    public_key?: string | null;
  };
}

interface AegisAnalysis {
  severity: "critical" | "high" | "medium" | "low" | "none";
  shouldIntervene: boolean;
  suggestion?: string;
  emergencyType?: string | null;
}

interface ConversationViewProps {
  conversationId: string;
  onBack: () => void;
}

export function ConversationView({ conversationId, onBack }: ConversationViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversationName, setConversationName] = useState("");
  const [showLocationMap, setShowLocationMap] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [aegisAlert, setAegisAlert] = useState<AegisAnalysis | null>(null);
  const [isAegisActive, setIsAegisActive] = useState(true);
  const [participants, setParticipants] = useState<Array<{ user_id: string; public_key: string | null }>>([]);
  const [showEncryptionSetup, setShowEncryptionSetup] = useState(false);
  const [showEncryptionUnlock, setShowEncryptionUnlock] = useState(false);
  const [showAddOperators, setShowAddOperators] = useState(false);

  // ── Agent mention typeahead state ──
  // mentionStart = index of the `@` that opened the popover (-1 = closed).
  // mentionedAgent = the agent the operator selected from the list, the
  // one we'll route the message to.
  const [mentionStart, setMentionStart] = useState<number>(-1);
  // Multiple agents can be addressed in a single message. The send
  // handler fires respond-as-agent once per agent in this list.
  const [mentionedAgents, setMentionedAgents] = useState<MentionableAgent[]>([]);
  const [pendingAgentResponses, setPendingAgentResponses] = useState(0);
  const mentionRef = useRef<AgentMentionTypeaheadHandle>(null);
  const { data: fortressAgents = [] } = useAgents();
  const mentionableAgents: MentionableAgent[] = fortressAgents.map((a: any) => ({
    id: a.id,
    call_sign: a.name, // useAgents maps call_sign → name
    short_specialty: shortenSpecialty(a.specialty),
  }));
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  const { 
    isInitialized, 
    isUnlocked, 
    needsSetup, 
    publicKey,
    encrypt, 
    decrypt, 
    setupEncryption, 
    unlockEncryption,
    getPublicKey 
  } = useEncryption();

  // Determine if encryption is possible (all participants have public keys)
  const canEncrypt = isUnlocked && participants.every(p => p.public_key);

  useEffect(() => {
    loadMessages();
    loadConversationDetails();
    getCurrentUser();

    // Subscribe to new messages
    const channel = supabase
      .channel(`conversation-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        loadMessages();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    if (!scrollRef.current) return;
    const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
    const target = scrollContainer || scrollRef.current;
    target.scrollTop = target.scrollHeight;
  }, []);

  // Scroll to bottom when messages finish loading
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      // Multiple attempts to ensure content is rendered
      requestAnimationFrame(() => {
        scrollToBottom();
        // Fallback with delay for slower renders
        setTimeout(scrollToBottom, 100);
        setTimeout(scrollToBottom, 300);
      });
    }
  }, [messages, isLoading, scrollToBottom]);

  // Also scroll when switching conversations
  useEffect(() => {
    if (conversationId) {
      setTimeout(scrollToBottom, 400);
    }
  }, [conversationId, scrollToBottom]);

  const getCurrentUser = async () => {
    // Get user from Fortress auth
    const { data: { user } } = await fortressClient.auth.getUser();
    if (user) setCurrentUserId(user.id);
  };

  const loadConversationDetails = async () => {
    // First get conversation with participants
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        name,
        conversation_participants (
          user_id
        )
      `)
      .eq('id', conversationId)
      .single();

    if (data) {
      const participantIds = (data.conversation_participants as any)?.map((p: any) => p.user_id) || [];
      
      // Fetch profiles for participants from Fortress (try 'name' first, fallback to 'full_name')
      let profilesMap: Record<string, { full_name: string; public_key: string | null }> = {};
      if (participantIds.length > 0) {
        // Try 'name' column first (Fortress schema)
        let profilesData = null;
        const { data: nameData, error: nameError } = await fortressClient
          .from('profiles')
          .select('id, name, public_key')
          .in('id', participantIds);
        
        if (!nameError && nameData) {
          profilesData = nameData.map((p: any) => ({ ...p, full_name: p.name }));
        } else {
          // Fallback to 'full_name' column
          const { data: fullNameData } = await fortressClient
            .from('profiles')
            .select('id, full_name, public_key')
            .in('id', participantIds);
          profilesData = fullNameData;
        }
        
        if (profilesData) {
          profilesMap = Object.fromEntries(
            profilesData.map((p: any) => [p.id, { full_name: p.full_name || p.name, public_key: p.public_key }])
          );
        }
      }
      
      const name = data.name || 
        participantIds.map((id: string) => profilesMap[id]?.full_name).filter(Boolean).join(", ") || 
        "Conversation";
      setConversationName(name);
      
      // Extract participants with their public keys
      const parts = participantIds.map((id: string) => ({
        user_id: id,
        public_key: profilesMap[id]?.public_key || null
      }));
      setParticipants(parts);
    }
  };

  const loadMessages = async () => {
    setIsLoading(true);
    
    // First get messages
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id,
        content,
        sender_id,
        agent_id,
        is_agent_query,
        mentioned_agent_id,
        created_at,
        attachments,
        encrypted,
        nonce
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      // Resolve human senders (profiles) and agent senders (ai_agents)
      // in parallel.
      const senderIds = [...new Set(data.map((m: any) => m.sender_id).filter(Boolean))] as string[];
      const agentIds = [
        ...new Set(
          data.flatMap((m: any) => [m.agent_id, m.mentioned_agent_id]).filter(Boolean)
        ),
      ] as string[];

      let profilesMap: Record<string, { full_name: string; avatar_url: string | null; public_key: string | null }> = {};
      if (senderIds.length > 0) {
        let profilesData = null;
        const { data: nameData, error: nameError } = await fortressClient
          .from('profiles')
          .select('id, name, avatar_url, public_key')
          .in('id', senderIds);

        if (!nameError && nameData) {
          profilesData = nameData.map((p: any) => ({ ...p, full_name: p.name }));
        } else {
          const { data: fullNameData } = await fortressClient
            .from('profiles')
            .select('id, full_name, avatar_url, public_key')
            .in('id', senderIds);
          profilesData = fullNameData;
        }

        if (profilesData) {
          profilesMap = Object.fromEntries(
            profilesData.map((p: any) => [p.id, { full_name: p.full_name || p.name, avatar_url: p.avatar_url, public_key: p.public_key }])
          );
        }
      }

      let agentCallSignMap: Record<string, string> = {};
      if (agentIds.length > 0) {
        const { data: agentRows } = await fortressClient
          .from('ai_agents')
          .select('id, call_sign')
          .in('id', agentIds);
        if (agentRows) {
          agentCallSignMap = Object.fromEntries(agentRows.map((a: any) => [a.id, a.call_sign]));
        }
      }
      
      const messagesWithSender = await Promise.all(data.map(async (msg: any) => {
        let decryptedContent = msg.content;

        // Decrypt only when the user is unlocked. Two formats:
        //   1:1   — content is base64 ciphertext, nonce in msg.nonce.
        //   group — content is JSON envelope with per-recipient blobs;
        //           pull the entry keyed by currentUserId.
        if (msg.encrypted && isUnlocked && currentUserId) {
          try {
            let ciphertext: string | null = null;
            let nonce: string | null = null;

            if (typeof msg.content === "string" && msg.content.startsWith('{"v":')) {
              const env = JSON.parse(msg.content);
              const slot = env?.e?.[currentUserId];
              if (slot?.c && slot?.n) {
                ciphertext = slot.c;
                nonce = slot.n;
              }
            } else if (msg.nonce) {
              ciphertext = msg.content;
              nonce = msg.nonce;
            }

            if (ciphertext && nonce) {
              const decrypted = await decrypt(ciphertext, nonce, msg.sender_id);
              if (decrypted) decryptedContent = decrypted;
              else decryptedContent = "🔒 [Unable to decrypt]";
            } else {
              // Group message we're not a recipient of (shouldn't happen
              // if the sender included us, but flag it loudly).
              decryptedContent = "🔒 [Not a recipient — cannot decrypt]";
            }
          } catch (e) {
            console.error("Decryption failed:", e);
            decryptedContent = "🔒 [Unable to decrypt]";
          }
        }

        return {
          ...msg,
          sender: msg.sender_id
            ? (profilesMap[msg.sender_id] || { full_name: 'Unknown', avatar_url: null, public_key: null })
            : { full_name: agentCallSignMap[msg.agent_id] || 'AI Agent', avatar_url: null, public_key: null },
          agent_call_sign: msg.agent_id ? agentCallSignMap[msg.agent_id] || null : null,
          attachments: msg.attachments || [],
          decryptedContent,
        };
      }));
      
      setMessages(messagesWithSender);
      
      // Trigger Aegis analysis on new messages (use decrypted content)
      if (isAegisActive && messagesWithSender.length > 0) {
        analyzeWithAegis(messagesWithSender);
      }
    }
    
    setIsLoading(false);
  };

  // Re-decrypt messages when encryption is unlocked
  useEffect(() => {
    if (isUnlocked && messages.some(m => m.encrypted && m.decryptedContent?.includes('[Unable to decrypt]'))) {
      loadMessages();
    }
  }, [isUnlocked]);

  // Aegis AI monitoring
  const analyzeWithAegis = useCallback(async (recentMessages: Message[]) => {
    if (!isAegisActive || recentMessages.length === 0) return;

    try {
      const messagesToAnalyze = recentMessages.slice(-5).map(m => ({
        role: m.sender_id === currentUserId ? "user" : "assistant",
        content: m.content
      }));

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aegis-monitor`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ 
            messages: messagesToAnalyze,
            conversationId 
          }),
        }
      );

      if (response.ok) {
        const analysis: AegisAnalysis = await response.json();
        if (analysis.shouldIntervene && analysis.suggestion) {
          setAegisAlert(analysis);
        }
      }
    } catch (error) {
      console.error("Aegis analysis error:", error);
    }
  }, [isAegisActive, currentUserId, conversationId]);

  const uploadAttachments = async (): Promise<MessageAttachment[]> => {
    if (!currentUserId || attachments.length === 0) return [];

    const uploadedAttachments: MessageAttachment[] = [];
    
    for (let i = 0; i < attachments.length; i++) {
      const attachment = attachments[i];
      const fileExt = attachment.name.split('.').pop();
      const fileName = `${currentUserId}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('message-attachments')
        .upload(fileName, attachment.file);

      if (error) {
        console.error('Upload error:', error);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from('message-attachments')
        .getPublicUrl(fileName);

      uploadedAttachments.push({
        url: urlData.publicUrl,
        type: attachment.type,
        name: attachment.name,
        size: attachment.size,
      });

      setUploadProgress(((i + 1) / attachments.length) * 100);
    }

    return uploadedAttachments;
  };

  const handleSend = async () => {
    if ((!newMessage.trim() && attachments.length === 0) || isSending || !currentUserId) return;

    setIsSending(true);
    setUploadProgress(0);

    try {
      // Upload attachments first
      const uploadedAttachments = await uploadAttachments();

      let messageContent = newMessage.trim();
      let messageNonce: string | null = null;
      let isEncrypted = false;
      const isAgentQuery = mentionedAgents.length > 0;

      // Agent-targeted messages skip encryption: the agent runs server-
      // side and needs plaintext to read. UI flags them so operators
      // know the server can read these specific messages.
      if (canEncrypt && messageContent && !isAgentQuery) {
        const recipients = participants.filter(p => p.public_key); // includes self
        const otherRecipients = recipients.filter(p => p.user_id !== currentUserId);

        if (otherRecipients.length === 1) {
          // 1:1 fast path — preserve the legacy single-ciphertext format
          // so older clients (and the existing decrypt path) keep working.
          const enc = await encrypt(messageContent, otherRecipients[0].user_id);
          if (enc) {
            messageContent = enc.ciphertext;
            messageNonce = enc.nonce;
            isEncrypted = true;
          }
        } else if (otherRecipients.length > 1) {
          // Group path — encrypt once per recipient (sender included so
          // the sender can read history). Per-recipient envelopes
          // packed into content as JSON.
          const envelope: Record<string, { c: string; n: string }> = {};
          for (const recipient of recipients) {
            const enc = await encrypt(messageContent, recipient.user_id);
            if (enc) envelope[recipient.user_id] = { c: enc.ciphertext, n: enc.nonce };
          }
          if (Object.keys(envelope).length > 0) {
            messageContent = JSON.stringify({ v: 1, e: envelope });
            messageNonce = null; // envelope carries per-recipient nonces
            isEncrypted = true;
          }
        }
      }

      const messageData: any = {
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: messageContent,
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : [],
        encrypted: isEncrypted,
        nonce: messageNonce,
        is_agent_query: isAgentQuery,
        // The schema column is single-valued — store the first mentioned
        // agent here for audit. The dispatch loop below fans out to every
        // agent in mentionedAgents.
        mentioned_agent_id: mentionedAgents[0]?.id ?? null,
      };

      const { data: insertedMsg, error } = await supabase
        .from('messages')
        .insert(messageData)
        .select('id')
        .single();

      if (error) {
        toast({
          variant: "destructive",
          title: "Failed to send message",
          description: error.message,
        });
      } else {
        setNewMessage("");
        setAttachments([]);
        // Agent context is STICKY — once an operator mentions an agent,
        // every subsequent message routes to the same agent(s) until
        // they explicitly clear via the × on a chip or "clear" link.
        // This matches the way operators talk to a specialist in a
        // working session: they don't re-tag for every follow-up.
        const targets = mentionedAgents;
        setMentionStart(-1);

        // Fan out one respond-as-agent call per addressed agent. Each
        // gets its own fresh request so they respond in parallel and
        // can land in any order. Realtime subscription picks each up.
        if (targets.length > 0 && insertedMsg?.id) {
          setPendingAgentResponses(targets.length);
          const { data: { session } } = await fortressClient.auth.getSession();
          const token = session?.access_token;
          targets.forEach((agent) => {
            (async () => {
              try {
                if (!token) return;
                await fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/respond-as-agent`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      conversation_id: conversationId,
                      message_id: insertedMsg.id,
                      agent_id_override: agent.id,
                    }),
                  }
                );
              } catch (e) {
                console.warn(`[ConversationView] ${agent.call_sign} response failed:`, e);
              } finally {
                setPendingAgentResponses((n) => Math.max(0, n - 1));
              }
            })();
          });
        }
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to send message",
        description: "An error occurred while sending your message.",
      });
    }
    
    setIsSending(false);
    setUploadProgress(0);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // When the agent mention popover is open, let it consume arrow /
    // Enter / Tab / Escape first.
    if (mentionStart >= 0 && mentionRef.current) {
      if (mentionRef.current.handleKey(e)) return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAddAttachments = (newAttachments: Attachment[]) => {
    setAttachments((prev) => [...prev, ...newAttachments]);
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((a) => a.id === id);
      if (attachment?.preview) {
        URL.revokeObjectURL(attachment.preview);
      }
      return prev.filter((a) => a.id !== id);
    });
  };

  const handleSOS = async () => {
    if (!currentUserId) return;
    
    // Send SOS message
    const sosMessage = "🚨 SOS EMERGENCY ALERT 🚨";
    
    const { error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: sosMessage,
      } as any);

    if (!error) {
      // Force immediate Aegis alert
      setAegisAlert({
        severity: "critical",
        shouldIntervene: true,
        suggestion: "Emergency SOS triggered! Aegis is alerting all available team members and dispatching assistance to your location. Stay calm and await backup.",
        emergencyType: "sos_triggered"
      });
      
      toast({
        title: "🚨 SOS Sent",
        description: "Emergency alert broadcasted to all team members.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="flex flex-col h-full min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-card/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-foreground">{conversationName}</h2>
                <AegisMonitoringBadge isActive={isAegisActive} />
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">Direct message</p>
                <EncryptionStatus isEncrypted={canEncrypt} isUnlocked={isUnlocked} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowAddOperators(true)}
              title="Add operators"
            >
              <UserPlus className="h-5 w-5" />
            </Button>
            {!isUnlocked && publicKey && (
              <Button variant="ghost" size="icon" onClick={() => setShowEncryptionUnlock(true)}>
                <Shield className="h-5 w-5 text-amber-500" />
              </Button>
            )}
            {needsSetup && (
              <Button variant="ghost" size="icon" onClick={() => setShowEncryptionSetup(true)}>
                <Shield className="h-5 w-5 text-muted-foreground" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => setShowLocationMap(true)}>
              <MapPin className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Aegis Alert */}
        <AnimatePresence>
          {aegisAlert && aegisAlert.shouldIntervene && (
            <AegisAlert
              severity={aegisAlert.severity}
              suggestion={aegisAlert.suggestion || ""}
              onDismiss={() => setAegisAlert(null)}
              onAcceptHelp={() => {
                toast({
                  title: "Aegis Assistance Activated",
                  description: "Help is on the way. Stay calm and follow protocols.",
                });
                setAegisAlert(null);
              }}
            />
          )}
        </AnimatePresence>

        {/* Messages */}
        <ScrollArea ref={scrollRef} className="flex-1 min-h-0 px-4 py-4">
          <div className="space-y-4 pb-4">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((message) => {
                  const isAgent = !!message.agent_id;
                  const isOwn = !isAgent && message.sender_id === currentUserId;
                  const hasContent = message.content.trim().length > 0;
                  const hasAttachments = message.attachments && message.attachments.length > 0;

                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={cn("flex", isOwn ? "justify-end" : "justify-start")}
                    >
                      <div className={cn("flex gap-2 max-w-[85%]", isOwn && "flex-row-reverse")}>
                        {!isOwn && (
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            {isAgent ? (
                              <AvatarFallback className="text-xs bg-primary/15 text-primary">
                                <Bot className="h-4 w-4" />
                              </AvatarFallback>
                            ) : (
                              <>
                                <AvatarImage src={message.sender?.avatar_url || undefined} />
                                <AvatarFallback className="text-xs">
                                  {message.sender?.full_name?.charAt(0) || "?"}
                                </AvatarFallback>
                              </>
                            )}
                          </Avatar>
                        )}
                        <div
                          className={cn(
                            "rounded-2xl overflow-hidden",
                            isOwn
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : isAgent
                                ? "bg-primary/5 border border-primary/40 rounded-bl-md"
                                : "bg-card border border-border rounded-bl-md",
                            hasContent ? "px-4 py-2" : hasAttachments ? "p-1" : "px-4 py-2"
                          )}
                        >
                          {!isOwn && hasContent && (
                            <p className={cn(
                              "text-xs font-medium mb-1 flex items-center gap-1.5",
                              isAgent ? "text-primary" : "text-primary"
                            )}>
                              {isAgent && <Bot className="h-3 w-3" />}
                              {isAgent ? message.agent_call_sign || message.sender?.full_name : message.sender?.full_name}
                              {isAgent && (
                                <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold ml-1">
                                  agent
                                </span>
                              )}
                            </p>
                          )}
                          
                          {hasContent && (
                            <div className="flex items-start gap-1">
                              {isAgent ? (
                                // Agent responses use markdown — they emit
                                // bullets, bold call-outs, and the occasional
                                // link. Keep prose tight for chat density.
                                <div className="text-sm flex-1 prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:mt-2 prose-headings:mb-1">
                                  <ReactMarkdown>
                                    {message.decryptedContent || message.content}
                                  </ReactMarkdown>
                                </div>
                              ) : (
                                <p className="text-sm whitespace-pre-wrap flex-1">
                                  {message.encrypted ? (message.decryptedContent || message.content) : message.content}
                                </p>
                              )}
                              {message.encrypted && (
                                <Shield className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                              )}
                            </div>
                          )}
                          
                          {hasAttachments && (
                            <MessageAttachments 
                              attachments={message.attachments!} 
                              isOwn={isOwn} 
                            />
                          )}
                          
                          <p className={cn(
                            "text-[10px] mt-1",
                            isOwn ? "text-primary-foreground/70" : "text-muted-foreground",
                            !hasContent && hasAttachments && "px-3 pb-1"
                          )}>
                            {new Date(message.created_at).toLocaleTimeString([], { 
                              hour: "2-digit", 
                              minute: "2-digit" 
                            })}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}

            {messages.length === 0 && !isLoading && (
              <div className="text-center py-8 text-muted-foreground">
                <p>No messages yet</p>
                <p className="text-sm">Send a message to start the conversation</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Attachment Preview */}
        <AnimatePresence>
          {attachments.length > 0 && (
            <AttachmentPreviewBar
              attachments={attachments}
              onRemove={handleRemoveAttachment}
            />
          )}
        </AnimatePresence>

        {/* Upload Progress */}
        {isSending && uploadProgress > 0 && uploadProgress < 100 && (
          <div className="px-4 pb-2">
            <div className="h-1 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Input */}
        <div className="relative border-t border-border bg-card/50 p-4">
          {mentionStart >= 0 && (
            <AgentMentionTypeahead
              ref={mentionRef}
              query={newMessage.slice(mentionStart + 1)}
              agents={mentionableAgents.filter(
                (a) => !mentionedAgents.some((m) => m.id === a.id)
              )}
              onSelect={(agent) => {
                // Replace `@<typedQuery>` with `@CALL-SIGN ` and append the
                // agent to the targeted list (multiple allowed).
                const before = newMessage.slice(0, mentionStart);
                const after = newMessage.slice(mentionStart + 1).replace(/^\S*/, "");
                const next = `${before}@${agent.call_sign} ${after.trimStart()}`;
                setNewMessage(next);
                setMentionedAgents((prev) =>
                  prev.some((p) => p.id === agent.id) ? prev : [...prev, agent]
                );
                setMentionStart(-1);
              }}
              onClose={() => setMentionStart(-1)}
            />
          )}
          {mentionedAgents.length > 0 && mentionStart < 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
              <Bot className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-primary mr-1">
                In dialogue with {mentionedAgents.length === 1 ? "" : `${mentionedAgents.length} agents:`}
              </span>
              {mentionedAgents.map((agent) => (
                <span
                  key={agent.id}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary"
                >
                  {agent.call_sign}
                  <button
                    type="button"
                    onClick={() => {
                      setMentionedAgents((prev) => prev.filter((p) => p.id !== agent.id));
                      setNewMessage((prev) =>
                        prev
                          .replace(new RegExp(`@${agent.call_sign}\\s*`, "g"), "")
                          .replace(/\s{2,}/g, " ")
                      );
                    }}
                    className="text-primary/70 hover:text-primary"
                    aria-label={`Remove ${agent.call_sign}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                onClick={() => {
                  setMentionedAgents([]);
                  setNewMessage((prev) => prev.replace(/@\S+\s*/g, "").trim());
                }}
                className="ml-auto text-muted-foreground hover:text-foreground"
              >
                clear
              </button>
            </div>
          )}
          {pendingAgentResponses > 0 && (
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {pendingAgentResponses === 1
                ? "Agent is composing a response..."
                : `${pendingAgentResponses} agents are composing responses...`}
            </div>
          )}
          <div className="flex items-center gap-2">
            <SOSButton onTrigger={handleSOS} disabled={isSending} />
            <AttachmentPicker
              onAdd={handleAddAttachments}
              disabled={isSending}
            />
            <Input
              value={newMessage}
              onChange={(e) => {
                const v = e.target.value;
                setNewMessage(v);
                // Detect a freshly-typed `@` (or the operator continuing
                // to type after one). Close the popup when whitespace
                // appears after the trigger.
                const cursor = v.length;
                const lastAt = v.lastIndexOf("@", cursor - 1);
                if (lastAt >= 0) {
                  const between = v.slice(lastAt + 1, cursor);
                  if (!/\s/.test(between)) {
                    setMentionStart(lastAt);
                  } else {
                    setMentionStart(-1);
                  }
                } else {
                  setMentionStart(-1);
                }
                // Sticky agent context — once an agent is mentioned in a
                // conversation, the operator stays "in dialogue" with
                // them across follow-up messages without re-typing the
                // @-tag. The chip's × button (or the global 'clear') is
                // the only way to drop an agent. Don't auto-clear when
                // the @<call_sign> token isn't in the current draft.
              }}
              onKeyDown={handleKeyPress}
              placeholder="Type a message... (@ to mention an agent)"
              className="flex-1 bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary"
              disabled={isSending}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={(!newMessage.trim() && attachments.length === 0) || isSending}
            >
              {isSending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <LocationMap
        conversationId={conversationId}
        isOpen={showLocationMap}
        onClose={() => setShowLocationMap(false)}
      />

      <AddOperatorsDialog
        open={showAddOperators}
        onOpenChange={setShowAddOperators}
        conversationId={conversationId}
        existingParticipantIds={participants.map((p) => p.user_id)}
        onAdded={() => {
          // Refresh participant list + messages so the new members show
          // up immediately and the encryption status banner re-evaluates.
          loadConversationDetails();
          loadMessages();
        }}
      />

      <EncryptionSetup
        open={showEncryptionSetup}
        onSetup={async (passphrase) => {
          const success = await setupEncryption(passphrase);
          if (success) {
            setShowEncryptionSetup(false);
            loadConversationDetails();
          }
          return success;
        }}
        onSkip={() => setShowEncryptionSetup(false)}
      />

      <EncryptionUnlock
        open={showEncryptionUnlock}
        onUnlock={async (passphrase) => {
          const success = await unlockEncryption(passphrase);
          if (success) {
            setShowEncryptionUnlock(false);
            loadMessages();
          }
          return success;
        }}
        onCancel={() => setShowEncryptionUnlock(false)}
      />
    </>
  );
}
