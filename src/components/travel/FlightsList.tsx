import { useState } from "react";
import { useTravelFlights, TravelFlight } from "@/hooks/useTravelData";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Clock, 
  Loader2, 
  Plane, 
  Plus, 
  RefreshCw, 
  Trash2 
} from "lucide-react";
import { AddFlightDialog } from "./AddFlightDialog";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  delayed: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  cancelled: "bg-destructive/20 text-destructive border-destructive/30",
  departed: "bg-green-500/20 text-green-400 border-green-500/30",
  arrived: "bg-muted text-muted-foreground",
};

export function FlightsList() {
  const { flights, isLoading, deleteFlight, checkFlightStatus, updateFlight } = useTravelFlights();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [checkingFlight, setCheckingFlight] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2].map((i) => (
          <Card key={i} className="bg-card/50">
            <CardContent className="p-4">
              <Skeleton className="h-5 w-1/2 mb-2" />
              <Skeleton className="h-4 w-3/4 mb-3" />
              <Skeleton className="h-6 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const handleDelete = async () => {
    if (deleteConfirm) {
      await deleteFlight(deleteConfirm);
      setDeleteConfirm(null);
    }
  };

  const handleCheckStatus = async (flight: TravelFlight) => {
    setCheckingFlight(flight.id);
    try {
      const result = await checkFlightStatus(flight.flight_number);
      
      // Update flight with any new info from the lookup
      if (result?.summary) {
        toast.success(`${flight.flight_number}: ${result.summary.slice(0, 100)}`);
        
        // Update last_checked timestamp
        await updateFlight({
          id: flight.id,
          updates: { last_checked_at: new Date().toISOString() },
        });
      }
    } catch (error) {
      toast.error("Could not check flight status");
    } finally {
      setCheckingFlight(null);
    }
  };

  return (
    <>
      <ScrollArea className="h-full">
        <div className="p-4 space-y-3">
          <Button 
            onClick={() => setShowAddDialog(true)} 
            className="w-full gap-2"
            variant="outline"
          >
            <Plus className="h-4 w-4" />
            Add Flight
          </Button>

          {flights.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Plane className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No Flights Tracked</h3>
              <p className="text-muted-foreground text-sm max-w-xs">
                Add your flights to track status, delays, and gate changes.
              </p>
            </div>
          ) : (
            flights.map((flight) => (
              <Card 
                key={flight.id} 
                className="bg-card/50 group"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-mono font-bold text-lg">{flight.flight_number}</h3>
                        {flight.airline && (
                          <span className="text-sm text-muted-foreground">({flight.airline})</span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm mb-3">
                        <span className="font-medium">{flight.departure_airport}</span>
                        <Plane className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{flight.arrival_airport}</span>
                      </div>
                      
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={statusColors[flight.status]}>
                          {flight.status}
                        </Badge>
                        
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(flight.departure_time), "MMM d, h:mm a")}
                        </span>

                        {flight.gate && (
                          <Badge variant="secondary">Gate {flight.gate}</Badge>
                        )}
                        {flight.terminal && (
                          <Badge variant="secondary">T{flight.terminal}</Badge>
                        )}
                      </div>

                      {flight.last_checked_at && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Last checked: {format(new Date(flight.last_checked_at), "h:mm a")}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleCheckStatus(flight)}
                        disabled={checkingFlight === flight.id}
                      >
                        {checkingFlight === flight.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setDeleteConfirm(flight.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>

      <AddFlightDialog 
        open={showAddDialog} 
        onOpenChange={setShowAddDialog} 
      />

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Flight</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this flight from tracking?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
