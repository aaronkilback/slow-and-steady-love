import { useState } from "react";
import { useTravelFlights, useTravelItineraries } from "@/hooks/useTravelData";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface AddFlightDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddFlightDialog({ open, onOpenChange }: AddFlightDialogProps) {
  const { addFlight, isAdding } = useTravelFlights();
  const { itineraries } = useTravelItineraries();
  
  const [flightNumber, setFlightNumber] = useState("");
  const [reservationCode, setReservationCode] = useState("");
  const [airline, setAirline] = useState("");
  const [departureAirport, setDepartureAirport] = useState("");
  const [arrivalAirport, setArrivalAirport] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [itineraryId, setItineraryId] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flightNumber || !departureAirport || !arrivalAirport || !departureTime) return;

    await addFlight({
      flight_number: flightNumber.toUpperCase(),
      reservation_code: reservationCode.toUpperCase() || undefined,
      airline: airline || undefined,
      departure_airport: departureAirport.toUpperCase(),
      arrival_airport: arrivalAirport.toUpperCase(),
      departure_time: new Date(departureTime).toISOString(),
      arrival_time: arrivalTime ? new Date(arrivalTime).toISOString() : undefined,
      itinerary_id: itineraryId || undefined,
    });

    // Reset form
    setFlightNumber("");
    setReservationCode("");
    setAirline("");
    setDepartureAirport("");
    setArrivalAirport("");
    setDepartureTime("");
    setArrivalTime("");
    setItineraryId("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Flight</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="flight-number">Flight Number *</Label>
              <Input
                id="flight-number"
                placeholder="e.g., UA123"
                value={flightNumber}
                onChange={(e) => setFlightNumber(e.target.value)}
                className="font-mono uppercase"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reservation-code">Reservation / PNR</Label>
              <Input
                id="reservation-code"
                placeholder="e.g., ABC123"
                value={reservationCode}
                onChange={(e) => setReservationCode(e.target.value)}
                className="font-mono uppercase"
                maxLength={10}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="airline">Airline</Label>
            <Input
              id="airline"
              placeholder="e.g., United Airlines"
              value={airline}
              onChange={(e) => setAirline(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="departure">From (Airport) *</Label>
              <Input
                id="departure"
                placeholder="e.g., LAX"
                value={departureAirport}
                onChange={(e) => setDepartureAirport(e.target.value)}
                className="font-mono uppercase"
                maxLength={4}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="arrival">To (Airport) *</Label>
              <Input
                id="arrival"
                placeholder="e.g., NRT"
                value={arrivalAirport}
                onChange={(e) => setArrivalAirport(e.target.value)}
                className="font-mono uppercase"
                maxLength={4}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="departure-time">Departure *</Label>
              <Input
                id="departure-time"
                type="datetime-local"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="arrival-time">Arrival</Label>
              <Input
                id="arrival-time"
                type="datetime-local"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
              />
            </div>
          </div>

          {itineraries.length > 0 && (
            <div className="space-y-2">
              <Label>Link to Trip (optional)</Label>
              <Select value={itineraryId} onValueChange={setItineraryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a trip" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {itineraries.map((trip) => (
                    <SelectItem key={trip.id} value={trip.id}>
                      {trip.trip_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isAdding}>
            {isAdding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Flight
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
