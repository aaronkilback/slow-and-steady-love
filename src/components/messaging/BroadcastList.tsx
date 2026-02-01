import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Megaphone, AlertTriangle, Info, Bell, Plus, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { fortressClient } from "@/lib/fortress-client";
import { NewBroadcastDialog } from "./NewBroadcastDialog";

interface Broadcast {
  id: string;
  title: string;
  content: string;
  priority: "low" | "normal" | "high" | "critical";
  created_at: string;
  sender?: {
    full_name: string;
  };
}

const priorityConfig = {
  critical: { color: "text-critical", bgColor: "bg-critical/10", icon: AlertTriangle },
  high: { color: "text-high", bgColor: "bg-high/10", icon: AlertTriangle },
  normal: { color: "text-primary", bgColor: "bg-primary/10", icon: Bell },
  low: { color: "text-low", bgColor: "bg-low/10", icon: Info },
};

export function BroadcastList() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showNewBroadcast, setShowNewBroadcast] = useState(false);

  useEffect(() => {
    loadBroadcasts();
    checkAdminStatus();

    // Subscribe to new broadcasts
    const channel = supabase
      .channel('broadcasts-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'broadcasts',
      }, () => {
        loadBroadcasts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkAdminStatus = async () => {
    // Get user from Fortress auth
    const { data: { user } } = await fortressClient.auth.getUser();
    if (user) {
      // Check admin status in Fortress
      const { data } = await fortressClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .single();
      
      setIsAdmin(!!data);
    }
  };

  const loadBroadcasts = async () => {
    setIsLoading(true);
    
    // First get broadcasts
    const { data, error } = await supabase
      .from('broadcasts')
      .select(`
        id,
        title,
        content,
        priority,
        created_at,
        sender_id
      `)
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Get unique sender IDs
      const senderIds = [...new Set(data.map((b: any) => b.sender_id))];
      
      // Fetch profiles from Fortress
      let profilesMap: Record<string, { full_name: string }> = {};
      if (senderIds.length > 0) {
        const { data: profilesData } = await fortressClient
          .from('profiles')
          .select('id, full_name')
          .in('id', senderIds);
        
        if (profilesData) {
          profilesMap = Object.fromEntries(
            profilesData.map(p => [p.id, { full_name: p.full_name }])
          );
        }
      }
      
      const broadcastsWithSender = data.map((b: any) => ({
        ...b,
        sender: profilesMap[b.sender_id] || { full_name: 'System' },
      }));
      setBroadcasts(broadcastsWithSender);
    }
    
    setIsLoading(false);
  };

  const formatTimeAgo = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <ScrollArea className="flex-1 px-4">
      <div className="space-y-3 pb-4">
        {isAdmin && (
          <Card 
            className="p-3 cursor-pointer border-dashed border-primary/50 hover:bg-primary/5 transition-colors"
            onClick={() => setShowNewBroadcast(true)}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-primary">New Broadcast</p>
                <p className="text-xs text-muted-foreground">Send a message to all operators</p>
              </div>
            </div>
          </Card>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <AnimatePresence>
            {broadcasts.map((broadcast) => {
              const config = priorityConfig[broadcast.priority];
              const Icon = config.icon;

              return (
                <motion.div
                  key={broadcast.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Card className={cn("p-4 border-l-4", config.bgColor)}
                    style={{ borderLeftColor: `hsl(var(--${broadcast.priority === 'normal' ? 'primary' : broadcast.priority}))` }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("mt-0.5 rounded-lg p-2", config.bgColor)}>
                        <Icon className={cn("h-4 w-4", config.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={cn("text-xs", config.color)}>
                            {broadcast.priority.toUpperCase()}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatTimeAgo(broadcast.created_at)}
                          </span>
                        </div>
                        <h3 className="font-medium text-sm text-foreground">
                          {broadcast.title}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {broadcast.content}
                        </p>
                        <p className="text-xs text-primary mt-2">
                          From: {broadcast.sender?.full_name || "System"}
                        </p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}

        {broadcasts.length === 0 && !isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            <Megaphone className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No broadcasts yet</p>
            <p className="text-sm">Team-wide announcements will appear here</p>
          </div>
        )}
      </div>

      <NewBroadcastDialog 
        open={showNewBroadcast} 
        onOpenChange={setShowNewBroadcast}
        onBroadcastCreated={loadBroadcasts}
      />
    </ScrollArea>
  );
}
