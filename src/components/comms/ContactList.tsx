import { CommsContact } from "@/hooks/useCommsData";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface ContactListProps {
  contacts: CommsContact[];
  selectedContact: string | null;
  onSelectContact: (identifier: string) => void;
  isLoading: boolean;
}

export function ContactList({
  contacts,
  selectedContact,
  onSelectContact,
  isLoading,
}: ContactListProps) {
  if (isLoading && contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mb-3" />
        <p className="text-sm text-muted-foreground">Loading contacts…</p>
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
          <MessageCircle className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No communications yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Start a new thread using the + button
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="divide-y divide-border">
        {contacts.map((contact) => {
          const isActive = selectedContact === contact.contact_identifier;
          const displayName = contact.contact_name || contact.contact_identifier;
          const timeAgo = contact.last_timestamp
            ? formatDistanceToNow(new Date(contact.last_timestamp), { addSuffix: true })
            : "";

          return (
            <button
              key={contact.contact_identifier}
              onClick={() => onSelectContact(contact.contact_identifier)}
              className={cn(
                "w-full text-left px-4 py-3 transition-colors hover:bg-secondary/50",
                isActive && "bg-secondary/80"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium truncate">{displayName}</h4>
                    {contact.investigators.length > 1 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 shrink-0">
                        <Users className="h-2.5 w-2.5" />
                        {contact.investigators.length}
                      </Badge>
                    )}
                  </div>
                  {contact.contact_name && (
                    <p className="text-xs text-muted-foreground truncate">
                      {contact.contact_identifier}
                    </p>
                  )}
                  {contact.last_message && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      {contact.last_message}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {timeAgo && (
                    <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
                  )}
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {contact.message_count}
                  </Badge>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
