import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface NewThreadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (toNumber: string, message: string, contactName?: string) => Promise<void>;
}

export function NewThreadDialog({ open, onOpenChange, onSend }: NewThreadDialogProps) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedPhone = phone.trim();
    const trimmedMessage = message.trim();

    if (!trimmedPhone || !trimmedMessage) return;

    setIsSending(true);
    try {
      await onSend(trimmedPhone, trimmedMessage, name.trim() || undefined);
      toast({ title: "Message sent", description: `SMS sent to ${name.trim() || trimmedPhone}` });
      setPhone("");
      setName("");
      setMessage("");
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Failed to send",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
          <DialogDescription>Start a conversation with a new contact</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number *</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-name">Contact Name</Label>
            <Input
              id="contact-name"
              placeholder="Optional"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="first-message">Message *</Label>
            <Textarea
              id="first-message"
              placeholder="Type your message…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={3}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isSending || !phone.trim() || !message.trim()}>
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Sending…
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send SMS
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
