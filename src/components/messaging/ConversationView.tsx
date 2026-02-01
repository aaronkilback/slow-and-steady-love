import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, Loader2, MapPin, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
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

interface Message {
  id: string;
  content: string;
  sender_id: string;
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);
  };

  const loadConversationDetails = async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        name,
        conversation_participants (
          user_id,
          profiles:user_id (
            full_name,
            public_key
          )
        )
      `)
      .eq('id', conversationId)
      .single();

    if (data) {
      const name = data.name || 
        (data.conversation_participants as any)?.map((p: any) => p.profiles?.full_name).join(", ") || 
        "Conversation";
      setConversationName(name);
      
      // Extract participants with their public keys
      const parts = (data.conversation_participants as any)?.map((p: any) => ({
        user_id: p.user_id,
        public_key: p.profiles?.public_key || null
      })) || [];
      setParticipants(parts);
    }
  };

  const loadMessages = async () => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id,
        content,
        sender_id,
        created_at,
        attachments,
        encrypted,
        nonce,
        profiles:sender_id (
          full_name,
          avatar_url,
          public_key
        )
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      const messagesWithSender = await Promise.all(data.map(async (msg: any) => {
        let decryptedContent = msg.content;
        
        // Try to decrypt if message is encrypted and we're unlocked
        if (msg.encrypted && msg.nonce && isUnlocked && currentUserId) {
          try {
            const decrypted = await decrypt(msg.content, msg.nonce, msg.sender_id);
            if (decrypted) {
              decryptedContent = decrypted;
            }
          } catch (e) {
            console.error("Decryption failed:", e);
            decryptedContent = "🔒 [Unable to decrypt]";
          }
        }
        
        return {
          ...msg,
          sender: msg.profiles,
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

      // Encrypt message if possible
      if (canEncrypt && messageContent) {
        // For group chats, we'd need to encrypt for each recipient
        // For now, encrypt for the first non-self participant
        const otherParticipant = participants.find(p => p.user_id !== currentUserId && p.public_key);
        
        if (otherParticipant) {
          const encrypted = await encrypt(messageContent, otherParticipant.user_id);
          if (encrypted) {
            messageContent = encrypted.ciphertext;
            messageNonce = encrypted.nonce;
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
      };

      const { error } = await supabase
        .from('messages')
        .insert(messageData);

      if (error) {
        toast({
          variant: "destructive",
          title: "Failed to send message",
          description: error.message,
        });
      } else {
        setNewMessage("");
        setAttachments([]);
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
      <div className="flex flex-col h-full">
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
        <ScrollArea ref={scrollRef} className="flex-1 px-4 py-4">
          <div className="space-y-4 pb-4">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((message) => {
                  const isOwn = message.sender_id === currentUserId;
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
                            <AvatarImage src={message.sender?.avatar_url || undefined} />
                            <AvatarFallback className="text-xs">
                              {message.sender?.full_name?.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div
                          className={cn(
                            "rounded-2xl overflow-hidden",
                            isOwn
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-card border border-border rounded-bl-md",
                            hasContent ? "px-4 py-2" : hasAttachments ? "p-1" : "px-4 py-2"
                          )}
                        >
                          {!isOwn && hasContent && (
                            <p className="text-xs font-medium text-primary mb-1">
                              {message.sender?.full_name}
                            </p>
                          )}
                          
                          {hasContent && (
                            <div className="flex items-start gap-1">
                              <p className="text-sm whitespace-pre-wrap flex-1">
                                {message.encrypted ? (message.decryptedContent || message.content) : message.content}
                              </p>
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
        <div className="border-t border-border bg-card/50 p-4 safe-area-bottom">
          <div className="flex items-center gap-2">
            <SOSButton onTrigger={handleSOS} disabled={isSending} />
            <AttachmentPicker
              onAdd={handleAddAttachments}
              disabled={isSending}
            />
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Type a message..."
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
