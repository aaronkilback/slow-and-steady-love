import { useState, useEffect } from "react";
import { Loader2, Search, Users, Check, Lock, QrCode, Mail, Copy, Sparkles } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fortressClient } from "@/lib/fortress-client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface OperatorRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  has_encryption_key: boolean;
}

interface AddOperatorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  /** UUIDs already in the conversation — filtered out of the picker. */
  existingParticipantIds: string[];
  onAdded: () => void;
}

type InviteRole = "analyst" | "viewer" | "admin";

interface IssuedInvite {
  token: string;
  pin: string;
  expires_at: string;
  invite_url: string;
  emailed?: boolean;
}

/** create-operator-invite endpoint on Fortress */
const CREATE_INVITE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-operator-invite`;

export function AddOperatorsDialog({
  open,
  onOpenChange,
  conversationId,
  existingParticipantIds,
  onAdded,
}: AddOperatorsDialogProps) {
  const [tab, setTab] = useState<"existing" | "new">("existing");

  // ── existing-operator picker state ──
  const [operators, setOperators] = useState<OperatorRow[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoadingOps, setIsLoadingOps] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  // ── invite (new-to-Fortress) state ──
  const [inviteRole, setInviteRole] = useState<InviteRole>("analyst");
  const [inviteEmail, setInviteEmail] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [issuedInvite, setIssuedInvite] = useState<IssuedInvite | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelected(new Set());
    setIssuedInvite(null);
    setInviteEmail("");
    setTab("existing");
    void loadOperators();
  }, [open, existingParticipantIds.join(",")]);

  const loadOperators = async () => {
    setIsLoadingOps(true);
    let rows: OperatorRow[] = [];
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
    setOperators(rows.filter((r) => !exclude.has(r.id)));
    setIsLoadingOps(false);
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddExisting = async () => {
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
          ? "One or more new members have not set up encryption — messages to them fall back to plaintext until they do."
          : undefined,
    });
    setIsAdding(false);
    onAdded();
    onOpenChange(false);
  };

  const handleGenerateInvite = async (alsoEmail: boolean) => {
    if (isGenerating) return;
    if (alsoEmail && !inviteEmail.trim()) {
      toast({
        variant: "destructive",
        title: "Email required",
        description: "Enter the operator's email to send a magic link.",
      });
      return;
    }
    setIsGenerating(true);
    try {
      const { data: { session } } = await fortressClient.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error("not signed in");
      }
      const resp = await fetch(CREATE_INVITE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          role: inviteRole,
          email: alsoEmail ? inviteEmail.trim().toLowerCase() : undefined,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as IssuedInvite;
      setIssuedInvite(data);
      if (alsoEmail) {
        toast({
          title: data.emailed ? "Invite sent" : "Invite created",
          description: data.emailed
            ? `Magic link emailed to ${inviteEmail.trim()}.`
            : "Email send failed — share the QR or PIN below instead.",
        });
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not generate invite",
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied` });
    } catch {
      toast({ variant: "destructive", title: "Could not copy" });
    }
  };

  const filtered = operators.filter((o) =>
    o.display_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add operators</DialogTitle>
          <DialogDescription>
            Bring an existing operator into this conversation, or invite someone
            who doesn't have a Fortress account yet.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "existing" | "new")} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="existing" className="gap-2">
              <Users className="h-4 w-4" />
              Existing
            </TabsTrigger>
            <TabsTrigger value="new" className="gap-2">
              <Sparkles className="h-4 w-4" />
              New to Fortress
            </TabsTrigger>
          </TabsList>

          {/* ── EXISTING ────────────────────────────────────── */}
          <TabsContent value="existing" className="flex-1 flex flex-col min-h-0 mt-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search operators..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-2">
                {isLoadingOps ? (
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
          </TabsContent>

          {/* ── NEW TO FORTRESS ────────────────────────────── */}
          <TabsContent value="new" className="flex-1 flex flex-col min-h-0 mt-3 space-y-3 overflow-auto">
            {!issuedInvite ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Role for new operator</label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as InviteRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="analyst">Analyst</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Determines what the new operator can see and do across Fortress.
                  </p>
                </div>

                <div className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <QrCode className="h-4 w-4" />
                    In-person invite
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Generates a one-time QR + 6-digit code. Single-use, expires in 15 minutes.
                  </p>
                  <Button
                    onClick={() => handleGenerateInvite(false)}
                    disabled={isGenerating}
                    className="w-full gap-2"
                  >
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                    Generate invite QR
                  </Button>
                </div>

                <div className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Mail className="h-4 w-4" />
                    Send by email
                  </div>
                  <Input
                    type="email"
                    placeholder="operator@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    onClick={() => handleGenerateInvite(true)}
                    disabled={isGenerating || !inviteEmail.trim()}
                    className="w-full gap-2"
                  >
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    Email magic link
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-card/40 p-4 flex flex-col items-center gap-3">
                  <div className="bg-white p-3 rounded-md">
                    <QRCodeSVG value={issuedInvite.invite_url} size={196} level="M" />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Have the new operator point their phone camera at this QR.
                  </p>
                </div>

                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Or have them enter this 6-digit code on the invite screen:</p>
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-2xl font-mono font-bold tracking-[0.4em] text-primary flex-1 text-center bg-muted/40 py-2 rounded">
                      {issuedInvite.pin}
                    </code>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => copyToClipboard(issuedInvite.pin, "PIN")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="text-[11px] text-muted-foreground text-center space-y-1">
                  <p>
                    Single-use. Expires{" "}
                    {new Date(issuedInvite.expires_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    .
                  </p>
                  <button
                    onClick={() => copyToClipboard(issuedInvite.invite_url, "Invite link")}
                    className="text-primary hover:underline"
                  >
                    Copy invite link
                  </button>
                </div>

                <Button
                  variant="outline"
                  onClick={() => setIssuedInvite(null)}
                  className="w-full"
                >
                  Generate another
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {tab === "existing" && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isAdding}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddExisting}
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
        )}
      </DialogContent>
    </Dialog>
  );
}
