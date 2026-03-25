import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SignalFeed } from "@/components/signal/SignalFeed";
import { WraithFeed } from "@/components/signal/WraithFeed";
import { Button } from "@/components/ui/button";
import { Bell, Check, Ghost, Radio } from "lucide-react";
import { useSignals } from "@/hooks/useFortressData";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function SignalPage() {
  const { data: signals = [] } = useSignals();
  const [readSignalIds, setReadSignalIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("readSignalIds");
      return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });
  const [isOpen, setIsOpen] = useState(false);

  // Critical and high signals that haven't been marked as read
  const criticalSignals = signals.filter(
    (s) => (s.severity === "critical" || s.severity === "high") && !readSignalIds.has(s.id)
  );
  const unreadCount = criticalSignals.length;

  const markAsRead = (id: string) => {
    setReadSignalIds((prev) => {
      const next = new Set([...prev, id]);
      localStorage.setItem("readSignalIds", JSON.stringify([...next]));
      return next;
    });
  };

  const markAllAsRead = () => {
    const allIds = criticalSignals.map((s) => s.id);
    setReadSignalIds((prev) => {
      const next = new Set([...prev, ...allIds]);
      localStorage.setItem("readSignalIds", JSON.stringify([...next]));
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader 
        title="Signal Feed" 
        subtitle="Real-time security intelligence"
        action={
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-critical text-[10px] font-bold text-white animate-pulse">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md">
              <SheetHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <SheetTitle>Notifications</SheetTitle>
                  {unreadCount > 0 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={markAllAsRead}
                      className="text-xs"
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Mark all read
                    </Button>
                  )}
                </div>
              </SheetHeader>
              
              <ScrollArea className="h-[calc(100vh-8rem)]">
                {criticalSignals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                      <Bell className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No new alerts</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Critical and high priority signals will appear here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 pr-2">
                    {criticalSignals.map((signal) => (
                      <div
                        key={signal.id}
                        className={cn(
                          "p-3 rounded-lg border transition-colors cursor-pointer",
                          signal.severity === "critical" 
                            ? "bg-critical/10 border-critical/30 hover:bg-critical/20" 
                            : "bg-high/10 border-high/30 hover:bg-high/20"
                        )}
                        onClick={() => markAsRead(signal.id)}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-xs",
                              signal.severity === "critical" ? "text-critical" : "text-high"
                            )}
                          >
                            {signal.severity?.toUpperCase()}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(signal.created_at).toLocaleTimeString([], { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </span>
                        </div>
                        <h4 className="font-medium text-sm mb-1">{signal.title}</h4>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {signal.description}
                        </p>
                        {signal.location && (
                          <p className="text-xs text-primary mt-1">{signal.location}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </SheetContent>
          </Sheet>
        }
      />

      <Tabs defaultValue="signals" className="flex-1 flex flex-col">
        <div className="px-4 border-b border-border">
          <TabsList className="w-full bg-transparent h-10 p-0 gap-0">
            <TabsTrigger 
              value="signals" 
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <Radio className="h-4 w-4 mr-1.5" />
              Signals
            </TabsTrigger>
            <TabsTrigger 
              value="cyber" 
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <Ghost className="h-4 w-4 mr-1.5" />
              Cyber Threats
            </TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="signals" className="flex-1 mt-0">
          <SignalFeed />
        </TabsContent>
        <TabsContent value="cyber" className="flex-1 mt-0">
          <WraithFeed />
        </TabsContent>
      </Tabs>
    </div>
  );
}
