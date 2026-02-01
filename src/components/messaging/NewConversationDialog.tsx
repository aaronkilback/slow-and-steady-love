import { useState, useEffect } from "react";
import { Loader2, Search, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationCreated: (conversationId: string) => void;
}

export function NewConversationDialog({ open, onOpenChange, onConversationCreated }: NewConversationDialogProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadProfiles();
      getCurrentUser();
    }
  }, [open]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);
  };

  const loadProfiles = async () => {
    setIsLoading(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .neq('id', user?.id || '');

    if (!error && data) {
      setProfiles(data);
    }
    
    setIsLoading(false);
  };

  const createConversation = async (userId: string) => {
    if (!currentUserId || isCreating) return;
    
    setIsCreating(true);

    // Check if conversation already exists
    const { data: existingConvs } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', currentUserId);

    if (existingConvs) {
      for (const conv of existingConvs) {
        const { data: otherParticipant } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', conv.conversation_id)
          .eq('user_id', userId)
          .single();

        if (otherParticipant) {
          // Conversation already exists
          onConversationCreated(conv.conversation_id);
          onOpenChange(false);
          setIsCreating(false);
          return;
        }
      }
    }

    // Create new conversation using the security definer function
    const { data: newConvId, error: convError } = await supabase
      .rpc('create_conversation_with_participant', {
        _name: null,
        _is_group: false
      });

    if (convError || !newConvId) {
      toast({
        variant: "destructive",
        title: "Failed to create conversation",
        description: convError?.message || "Unknown error",
      });
      setIsCreating(false);
      return;
    }

    // Add the other user to the conversation
    const { error: participantError } = await supabase
      .from('conversation_participants')
      .insert({
        conversation_id: newConvId,
        user_id: userId,
      });

    if (participantError) {
      toast({
        variant: "destructive",
        title: "Failed to add participant",
        description: participantError.message,
      });
    } else {
      onConversationCreated(newConvId);
      onOpenChange(false);
    }
    
    setIsCreating(false);
  };

  const filteredProfiles = profiles.filter((profile) =>
    profile.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
          <DialogDescription>
            Select an operator to start a conversation
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search operators..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <ScrollArea className="h-[300px]">
          <div className="space-y-2">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              filteredProfiles.map((profile) => (
                <Card
                  key={profile.id}
                  className="p-3 cursor-pointer hover:bg-card/80 transition-colors"
                  onClick={() => createConversation(profile.id)}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={profile.avatar_url || undefined} />
                      <AvatarFallback>
                        {profile.full_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium">{profile.full_name}</p>
                      <p className="text-xs text-muted-foreground">Operator</p>
                    </div>
                    {isCreating && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                  </div>
                </Card>
              ))
            )}

            {filteredProfiles.length === 0 && !isLoading && (
              <div className="text-center py-8 text-muted-foreground">
                <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No operators found</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
