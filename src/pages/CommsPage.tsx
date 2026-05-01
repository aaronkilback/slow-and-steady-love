import { useState, useCallback } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, MessageSquareText } from "lucide-react";
import { useCommsData } from "@/hooks/useCommsData";
import { ContactList } from "@/components/comms/ContactList";
import { ThreadView } from "@/components/comms/ThreadView";
import { NewThreadDialog } from "@/components/comms/NewThreadDialog";
import { toast } from "@/hooks/use-toast";

export default function CommsPage() {
  // For now, allow user to enter investigation ID — this can be wired to a case selector later
  const [investigationId, setInvestigationId] = useState<string>("");
  const [activeInvestigation, setActiveInvestigation] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [showNewThread, setShowNewThread] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const {
    contacts,
    communications,
    isLoading,
    error,
    sendSms,
    refresh,
    startPolling,
    stopPolling,
  } = useCommsData(activeInvestigation);

  const handleLoadCase = () => {
    const trimmed = investigationId.trim();
    if (!trimmed) return;
    setActiveInvestigation(trimmed);
    setSelectedContact(null);
  };

  const handleSendInThread = useCallback(
    async (message: string) => {
      if (!selectedContact) return;
      setIsSending(true);
      try {
        const contact = contacts.find(
          (c) => c.contact_identifier === selectedContact
        );
        await sendSms(selectedContact, message, contact?.contact_name || undefined);
      } catch (err) {
        toast({
          title: "Send failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setIsSending(false);
      }
    },
    [selectedContact, contacts, sendSms]
  );

  const handleNewThreadSend = useCallback(
    async (toNumber: string, message: string, contactName?: string) => {
      await sendSms(toNumber, message, contactName);
      // Select the new contact after sending
      setSelectedContact(toNumber);
    },
    [sendSms]
  );

  // If no investigation loaded yet, show the case selector
  if (!activeInvestigation) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <PageHeader title="Comms" subtitle="Investigation SMS communications" />
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
            <MessageSquareText className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold mb-1">Load Case File</h2>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Enter an investigation ID to view its communications
          </p>
          <div className="flex gap-2 w-full max-w-sm">
            <Input
              placeholder="Investigation ID"
              value={investigationId}
              onChange={(e) => setInvestigationId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLoadCase()}
            />
            <Button onClick={handleLoadCase} disabled={!investigationId.trim()}>
              <Search className="h-4 w-4 mr-2" />
              Load
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Thread view
  if (selectedContact) {
    const contact = contacts.find(
      (c) => c.contact_identifier === selectedContact
    );
    return (
      <div className="flex flex-col h-full min-h-0">
        <ThreadView
          contactIdentifier={selectedContact}
          contactName={contact?.contact_name || null}
          communications={communications}
          onBack={() => {
            setSelectedContact(null);
            stopPolling();
          }}
          onSend={handleSendInThread}
          isSending={isSending}
          startPolling={startPolling}
          stopPolling={stopPolling}
        />
      </div>
    );
  }

  // Contact list view
  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title="Comms"
        subtitle={`Case: ${activeInvestigation}`}
        action={
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setActiveInvestigation(null);
                setInvestigationId("");
              }}
            >
              <Search className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowNewThread(true)}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mx-4 mt-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
          <p className="text-xs text-destructive">{error}</p>
          <Button variant="ghost" size="sm" onClick={refresh} className="mt-1 text-xs">
            Retry
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <ContactList
          contacts={contacts}
          selectedContact={selectedContact}
          onSelectContact={setSelectedContact}
          isLoading={isLoading}
        />
      </div>

      <NewThreadDialog
        open={showNewThread}
        onOpenChange={setShowNewThread}
        onSend={handleNewThreadSend}
      />
    </div>
  );
}
