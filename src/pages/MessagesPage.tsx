import { PageHeader } from "@/components/layout/PageHeader";
import { MessagingHub } from "@/components/messaging/MessagingHub";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function MessagesPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      <PageHeader 
        title="Messages"
        subtitle="Team messaging & broadcasts"
        action={
          <Button variant="ghost" size="icon">
            <Plus className="h-5 w-5" />
          </Button>
        }
      />
      <MessagingHub />
    </div>
  );
}
