import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SignalFeed } from "@/components/signal/SignalFeed";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";

export default function SignalPage() {
  const [unreadCount] = useState(3);

  return (
    <div className="flex flex-col">
      <PageHeader 
        title="Signal Feed" 
        subtitle="Real-time security intelligence"
        action={
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-critical text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </Button>
        }
      />
      <SignalFeed />
    </div>
  );
}
