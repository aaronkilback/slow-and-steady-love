import { useState } from "react";
import { Loader2, Megaphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface NewBroadcastDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBroadcastCreated: () => void;
}

export function NewBroadcastDialog({ open, onOpenChange, onBroadcastCreated }: NewBroadcastDialogProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<string>("normal");
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) return;
    
    setIsCreating(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('broadcasts')
      .insert({
        sender_id: user?.id,
        title: title.trim(),
        content: content.trim(),
        priority,
      });

    if (error) {
      toast({
        variant: "destructive",
        title: "Failed to send broadcast",
        description: error.message,
      });
    } else {
      toast({
        title: "Broadcast sent",
        description: "All operators will receive your message",
      });
      setTitle("");
      setContent("");
      setPriority("normal");
      onBroadcastCreated();
      onOpenChange(false);
    }
    
    setIsCreating(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            New Broadcast
          </DialogTitle>
          <DialogDescription>
            Send a message to all operators. Use for important announcements only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Broadcast title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Message</Label>
            <Textarea
              id="content"
              placeholder="Write your broadcast message..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low - General info</SelectItem>
                <SelectItem value="normal">Normal - Standard update</SelectItem>
                <SelectItem value="high">High - Important</SelectItem>
                <SelectItem value="critical">Critical - Urgent action required</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreate} 
            disabled={!title.trim() || !content.trim() || isCreating}
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Megaphone className="h-4 w-4 mr-2" />
            )}
            Send Broadcast
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
