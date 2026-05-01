import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Megaphone, Search, User, Users, Bot, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { fortressClient } from "@/lib/fortress-client";
import { ConversationView } from "./ConversationView";
import { BroadcastList } from "./BroadcastList";
import { NewConversationDialog } from "./NewConversationDialog";

interface Conversation {
  id: string;
  name: string | null;
  is_group: boolean;
  updated_at: string;
  last_message?: string;
  unread_count?: number;
  participants?: Array<{
    user_id: string;
    profile: {
      full_name: string;
      avatar_url: string | null;
    };
  }>;
}

export function MessagingHub() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [creatingSoloDesk, setCreatingSoloDesk] = useState(false);

  // "Solo intel desk" — a conversation with just the current operator,
  // intended as a private workspace where they can @-mention agents
  // and consult them without needing other humans on the team yet.
  const startSoloDesk = async () => {
    if (creatingSoloDesk) return;
    setCreatingSoloDesk(true);
    try {
      const { data: newConvId, error } = await supabase.rpc(
        "create_conversation_with_participant",
        { _name: "Personal Intel Desk", _is_group: false }
      );
      if (error || !newConvId) {
        console.error("[MessagingHub] solo desk create failed:", error);
        return;
      }
      setSelectedConversation(newConvId as unknown as string);
      loadConversations();
    } finally {
      setCreatingSoloDesk(false);
    }
  };

  useEffect(() => {
    loadConversations();
    
    // Subscribe to new messages
    const channel = supabase
      .channel('messages-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, () => {
        loadConversations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadConversations = async () => {
    setIsLoading(true);
    
    // First, get conversations with participants
    const { data: convData, error } = await supabase
      .from('conversations')
      .select(`
        id,
        name,
        is_group,
        updated_at,
        conversation_participants (
          user_id
        )
      `)
      .order('updated_at', { ascending: false });

    if (!error && convData) {
      // Get unique user IDs from all participants
      const userIds = [...new Set(
        convData.flatMap((conv: any) => 
          conv.conversation_participants?.map((p: any) => p.user_id) || []
        )
      )];
      
      // Fetch profiles from Fortress platform
      let profilesMap: Record<string, { full_name: string; avatar_url: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profilesData } = await fortressClient
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', userIds);
        
        if (profilesData) {
          profilesMap = Object.fromEntries(
            profilesData.map(p => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }])
          );
        }
      }

      // Merge profiles into conversations
      const conversationsWithParticipants = convData.map((conv: any) => ({
        ...conv,
        participants: conv.conversation_participants?.map((p: any) => ({
          user_id: p.user_id,
          profile: profilesMap[p.user_id] || { full_name: 'Unknown', avatar_url: null },
        })),
      }));
      setConversations(conversationsWithParticipants);
    }
    
    setIsLoading(false);
  };

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true;
    const name = conv.name || conv.participants?.map(p => p.profile?.full_name).join(", ");
    return name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (selectedConversation) {
    return (
      <ConversationView 
        conversationId={selectedConversation} 
        onBack={() => setSelectedConversation(null)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <Tabs defaultValue="direct" className="flex-1 flex flex-col">
        <div className="px-4 pt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="direct" className="gap-2">
              <MessageCircle className="h-4 w-4" />
              Direct
            </TabsTrigger>
            <TabsTrigger value="broadcasts" className="gap-2">
              <Megaphone className="h-4 w-4" />
              Broadcasts
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <TabsContent value="direct" className="flex-1 mt-0 px-4">
          <ScrollArea className="h-[calc(100vh-16rem)]">
            <div className="space-y-2 pb-4">
              {/* New conversation button */}
              <Card
                className="p-3 cursor-pointer border-dashed border-primary/50 hover:bg-primary/5 transition-colors"
                onClick={() => setShowNewConversation(true)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-primary">New Conversation</p>
                    <p className="text-xs text-muted-foreground">Start a chat with another operator</p>
                  </div>
                </div>
              </Card>

              {/* Solo intel desk — agents only, no other humans needed */}
              <Card
                className="p-3 cursor-pointer border-dashed border-primary/30 hover:bg-primary/5 transition-colors"
                onClick={startSoloDesk}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    {creatingSoloDesk ? (
                      <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    ) : (
                      <Bot className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-primary">Solo intel desk</p>
                    <p className="text-xs text-muted-foreground">
                      Private workspace — @-mention agents to consult them
                    </p>
                  </div>
                </div>
              </Card>

              <AnimatePresence>
                {filteredConversations.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    onClick={() => setSelectedConversation(conv.id)}
                  />
                ))}
              </AnimatePresence>

              {filteredConversations.length === 0 && !isLoading && (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No conversations yet</p>
                  <p className="text-sm">Start a new conversation with a team member</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="broadcasts" className="flex-1 mt-0">
          <BroadcastList />
        </TabsContent>
      </Tabs>

      <NewConversationDialog 
        open={showNewConversation} 
        onOpenChange={setShowNewConversation}
        onConversationCreated={(id) => {
          setSelectedConversation(id);
          loadConversations();
        }}
      />
    </div>
  );
}

function ConversationItem({ conversation, onClick }: { conversation: Conversation; onClick: () => void }) {
  const displayName = conversation.name || 
    conversation.participants?.map(p => p.profile?.full_name).join(", ") || 
    "Unknown";
  
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <Card 
        className="p-3 cursor-pointer hover:bg-card/80 transition-colors"
        onClick={onClick}
      >
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={conversation.participants?.[0]?.profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-secondary text-muted-foreground">
              {conversation.is_group ? <Users className="h-5 w-5" /> : initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="font-medium truncate">{displayName}</p>
              <span className="text-xs text-muted-foreground">
                {new Date(conversation.updated_at).toLocaleDateString()}
              </span>
            </div>
            {conversation.last_message && (
              <p className="text-sm text-muted-foreground truncate">
                {conversation.last_message}
              </p>
            )}
          </div>
          {conversation.unread_count && conversation.unread_count > 0 && (
            <Badge variant="default" className="ml-2">
              {conversation.unread_count}
            </Badge>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
