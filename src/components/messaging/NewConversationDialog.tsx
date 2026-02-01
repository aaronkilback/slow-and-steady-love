import { useState, useEffect } from "react";
import { Loader2, Search, User, Users, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { fortressClient } from "@/lib/fortress-client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [selectedUsers, setSelectedUsers] = useState<Profile[]>([]);
  const [groupName, setGroupName] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadProfiles();
      getCurrentUser();
      setSelectedUsers([]);
      setGroupName("");
      setMode("direct");
    }
  }, [open]);

  const getCurrentUser = async () => {
    // Get user from Fortress auth
    const { data: { user } } = await fortressClient.auth.getUser();
    if (user) setCurrentUserId(user.id);
  };

  const loadProfiles = async () => {
    setIsLoading(true);
    // Get current user from Fortress
    const { data: { user } } = await fortressClient.auth.getUser();
    
    // Load profiles from Fortress platform
    const { data, error } = await fortressClient
      .from('profiles')
      .select('id, full_name, avatar_url')
      .neq('id', user?.id || '');

    if (!error && data) {
      setProfiles(data);
    } else {
      console.log("Could not load profiles from Fortress:", error?.message);
      setProfiles([]);
    }
    setIsLoading(false);
  };

  const toggleUserSelection = (profile: Profile) => {
    if (mode === "direct") {
      // Direct message - immediately create conversation
      createConversation([profile.id], false);
    } else {
      // Group mode - toggle selection
      setSelectedUsers(prev => 
        prev.find(u => u.id === profile.id)
          ? prev.filter(u => u.id !== profile.id)
          : [...prev, profile]
      );
    }
  };

  const createConversation = async (userIds: string[], isGroup: boolean) => {
    if (!currentUserId || isCreating) return;
    setIsCreating(true);

    // For direct messages, check if conversation already exists
    if (!isGroup && userIds.length === 1) {
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
            .eq('user_id', userIds[0])
            .single();

          if (otherParticipant) {
            onConversationCreated(conv.conversation_id);
            onOpenChange(false);
            setIsCreating(false);
            return;
          }
        }
      }
    }

    // Create new conversation
    const { data: newConvId, error: convError } = await supabase
      .rpc('create_conversation_with_participant', {
        _name: isGroup ? (groupName || `Group (${userIds.length + 1})`) : null,
        _is_group: isGroup
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

    // Add all selected users to the conversation
    const { error: participantError } = await supabase
      .from('conversation_participants')
      .insert(userIds.map(userId => ({
        conversation_id: newConvId,
        user_id: userId,
      })));

    if (participantError) {
      toast({
        variant: "destructive",
        title: "Failed to add participants",
        description: participantError.message,
      });
    } else {
      onConversationCreated(newConvId);
      onOpenChange(false);
    }
    setIsCreating(false);
  };

  const handleCreateGroup = () => {
    if (selectedUsers.length < 2) {
      toast({
        variant: "destructive",
        title: "Select at least 2 members",
        description: "Groups need at least 2 other members.",
      });
      return;
    }
    createConversation(selectedUsers.map(u => u.id), true);
  };

  const filteredProfiles = profiles.filter((profile) =>
    profile.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isSelected = (id: string) => selectedUsers.some(u => u.id === id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
          <DialogDescription>
            Start a direct message or create a group
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => { setMode(v as "direct" | "group"); setSelectedUsers([]); }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="direct" className="gap-2">
              <User className="h-4 w-4" />
              Direct
            </TabsTrigger>
            <TabsTrigger value="group" className="gap-2">
              <Users className="h-4 w-4" />
              Group
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "group" && (
          <Input
            placeholder="Group name (optional)"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
        )}

        {mode === "group" && selectedUsers.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selectedUsers.map(user => (
              <Badge 
                key={user.id} 
                variant="secondary" 
                className="cursor-pointer"
                onClick={() => toggleUserSelection(user)}
              >
                {user.full_name} ×
              </Badge>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search operators..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <ScrollArea className="h-[250px]">
          <div className="space-y-2">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              filteredProfiles.map((profile) => (
                <Card
                  key={profile.id}
                  className={cn(
                    "p-3 cursor-pointer transition-colors",
                    isSelected(profile.id) ? "bg-primary/10 border-primary" : "hover:bg-card/80"
                  )}
                  onClick={() => toggleUserSelection(profile)}
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
                    {mode === "group" && isSelected(profile.id) && (
                      <Check className="h-5 w-5 text-primary" />
                    )}
                    {isCreating && mode === "direct" && (
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

        {mode === "group" && (
          <DialogFooter>
            <Button 
              onClick={handleCreateGroup} 
              disabled={selectedUsers.length < 2 || isCreating}
              className="w-full"
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Users className="h-4 w-4 mr-2" />
              )}
              Create Group ({selectedUsers.length} members)
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
