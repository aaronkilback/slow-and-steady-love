import { useState, useEffect } from "react";
import { Loader2, Search, Users, Check, Lock } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { fortressClient } from "@/lib/fortress-client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface OperatorRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  has_encryption_key: boolean; // public_key present
}

interface AddOperatorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  /** UUIDs already in the conversation — these get filtered out of the picker. */
  existingParticipantIds: string[];
  onAdded: () => void;
}

/**
 * Pick one or more operators (Fortress profiles) and add them as participants
 * to an existing conversation. Shows whether each candidate has set up E2E
 * encryption keys so the inviter knows whether their messages will encrypt
 * to the new member or fall back to plaintext.
 */
export function AddOperatorsDialog({
  open,
  onOpenChange,
  conversationId,
  existingParticipantIds,
  onAdded,
}: AddOperatorsDialogProps) {
  const [operators, setOperators] = useState<OperatorRow[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelected(new Set());
    void loadOperators();
  }, [open, existingParticipantIds.join(",")]);

  const loadOperators = async () => {
    setIsLoading(true);
    // Fortress profiles use `name` (not `full_name`); fall back if the
    // schema is older.
    let rows: any[] | null = null;
    const a = await fortressClient
      .from("profiles")
      .select("id, name, avatar_url, public_key")
      .order("name", { ascending: true });
    if (!a.error && a.data) {
      rows = a.data.map((p: any) => ({
        id: p.id,
        display_name: p.name || "Unknown",
        avatar_url: p.avatar_url,
        has_encryption_key: !!p.public_key,
      }));
    } else {
      const b = await fortressClient
        .from("profiles")
        .select("id, full_name, avatar_url, public_key")
        .order("full_name", { ascending: true });
      if (!b.error && b.data) {
        rows = b.data.map((p: any) => ({
          id: p.id,
          display_name: p.full_name || "Unknown",
          avatar_url: p.avatar_url,
          has_encryption_key: !!p.public_key,
        }));
      }
    }
    const exclude = new Set(existingParticipantIds);
    setOperators((rows ?? []).filter((r) => !exclude.has(r.id)));
    setIsLoading(false);
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selected.size === 0 || isAdding) return;
    setIsAdding(true);

    const ids = Array.from(selected);
    const { error } = await supabase
      .from("conversation_participants")
      .insert(ids.map((user_id) => ({ conversation_id: conversationId, user_id })));

    if (error) {
      toast({
        variant: "destructive",
        title: "Could not add operators",
        description: error.message,
      });
      setIsAdding(false);
      return;
    }

    toast({
      title: ids.length === 1 ? "Operator added" : `${ids.length} operators added`,
      description:
        operators.filter((o) => ids.includes(o.id) && !o.has_encryption_key).length > 0
          ? "One or more new members have not set up encryption — messages to them will fall back to plaintext until they do."
          : undefined,
    });

    setIsAdding(false);
    onAdded();
    onOpenChange(false);
  };

  const filtered = operators.filter((o) =>
    o.display_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add operators</DialogTitle>
          <DialogDescription>
            Pick one or more operators to invite into this conversation. New
            members can read messages from the moment they're added.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search operators..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <ScrollArea className="h-[300px]">
          <div className="space-y-2">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {operators.length === 0
                  ? "All known operators are already in this conversation."
                  : "No operators match that search."}
              </div>
            ) : (
              filtered.map((op) => {
                const isSel = selected.has(op.id);
                return (
                  <Card
                    key={op.id}
                    className={cn(
                      "p-3 cursor-pointer transition-colors",
                      isSel ? "bg-primary/10 border-primary" : "hover:bg-card/80"
                    )}
                    onClick={() => toggle(op.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={op.avatar_url || undefined} />
                        <AvatarFallback>
                          {op.display_name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{op.display_name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          {op.has_encryption_key ? (
                            <>
                              <Lock className="h-3 w-3" />
                              Encryption ready
                            </>
                          ) : (
                            <span className="text-amber-500">No encryption keys yet</span>
                          )}
                        </p>
                      </div>
                      {isSel && <Check className="h-5 w-5 text-primary shrink-0" />}
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isAdding}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={selected.size === 0 || isAdding}
            className="gap-2"
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Users className="h-4 w-4" />
            )}
            Add {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
