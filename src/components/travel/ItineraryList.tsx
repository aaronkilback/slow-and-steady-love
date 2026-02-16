import { useState } from "react";
import { useTravelItineraries, TravelItinerary } from "@/hooks/useTravelData";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Calendar, 
  Camera,
  ChevronRight, 
  MapPin, 
  Plus, 
  Trash2 
} from "lucide-react";
import { AddItineraryDialog } from "./AddItineraryDialog";
import { UploadItineraryDialog } from "./UploadItineraryDialog";
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
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  upcoming: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/20 text-destructive border-destructive/30",
};

export function ItineraryList() {
  const { itineraries, isLoading, deleteItinerary } = useTravelItineraries();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-card/50">
            <CardContent className="p-4">
              <Skeleton className="h-5 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2 mb-3" />
              <Skeleton className="h-6 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const handleDelete = async () => {
    if (deleteConfirm) {
      await deleteItinerary(deleteConfirm);
      setDeleteConfirm(null);
    }
  };

  return (
    <>
      <ScrollArea className="h-full">
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button 
              onClick={() => setShowAddDialog(true)} 
              className="gap-2"
              variant="outline"
            >
              <Plus className="h-4 w-4" />
              Add Trip
            </Button>
            <Button
              onClick={() => setShowUploadDialog(true)}
              className="gap-2"
              variant="outline"
            >
              <Camera className="h-4 w-4" />
              Scan Itinerary
            </Button>
          </div>

          {itineraries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <MapPin className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No Trips Yet</h3>
              <p className="text-muted-foreground text-sm max-w-xs">
                Add your upcoming travel to track flights and receive destination alerts.
              </p>
            </div>
          ) : (
            itineraries.map((trip) => (
              <Card 
                key={trip.id} 
                className="bg-card/50 hover:bg-card/80 transition-colors group"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate mb-1">{trip.trip_name}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{trip.destination}</span>
                      </div>
                      
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={statusColors[trip.status]}>
                          {trip.status}
                        </Badge>
                        
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(trip.departure_date), "MMM d")}
                          {trip.return_date && ` - ${format(new Date(trip.return_date), "MMM d")}`}
                        </span>
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setDeleteConfirm(trip.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>

      <AddItineraryDialog 
        open={showAddDialog} 
        onOpenChange={setShowAddDialog} 
      />

      <UploadItineraryDialog
        open={showUploadDialog}
        onOpenChange={setShowUploadDialog}
      />

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trip</AlertDialogTitle>
            <AlertDialogDescription>
              This will also delete all associated flights. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
