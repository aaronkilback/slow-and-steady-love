import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ItineraryList } from "./ItineraryList";
import { FlightsList } from "./FlightsList";
import { AlertsList } from "./AlertsList";
import { MapPin, Plane, AlertTriangle } from "lucide-react";
import { useTravelAlerts } from "@/hooks/useTravelData";
import { Badge } from "@/components/ui/badge";

export function TravelReportsHub() {
  const [activeTab, setActiveTab] = useState("itineraries");
  const { unreadCount } = useTravelAlerts();

  return (
    <div className="flex flex-col h-full bg-background">
      <PageHeader title="Travel" />
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="px-4 border-b border-border">
          <TabsList className="w-full grid grid-cols-3 h-12 bg-transparent">
            <TabsTrigger 
              value="itineraries" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-2"
            >
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">Trips</span>
            </TabsTrigger>
            <TabsTrigger 
              value="flights" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-2"
            >
              <Plane className="h-4 w-4" />
              <span className="hidden sm:inline">Flights</span>
            </TabsTrigger>
            <TabsTrigger 
              value="alerts" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-2 relative"
            >
              <AlertTriangle className="h-4 w-4" />
              <span className="hidden sm:inline">Alerts</span>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 p-0 text-xs flex items-center justify-center">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="itineraries" className="h-full m-0">
            <ItineraryList />
          </TabsContent>
          
          <TabsContent value="flights" className="h-full m-0">
            <FlightsList />
          </TabsContent>
          
          <TabsContent value="alerts" className="h-full m-0">
            <AlertsList />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
