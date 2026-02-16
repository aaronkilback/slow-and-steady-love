import { useState, useRef } from "react";
import { Camera, Loader2, Plane, MapPin, Ticket, CheckCircle, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { fortressClient } from "@/lib/fortress-client";
import { useTravelFlights, useTravelItineraries } from "@/hooks/useTravelData";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ExtractedFlight {
  flight_number: string;
  reservation_code?: string;
  airline?: string;
  departure_airport: string;
  arrival_airport: string;
  departure_time: string;
  arrival_time?: string;
  terminal?: string;
  gate?: string;
}

interface ExtractedItinerary {
  trip_name?: string;
  destination: string;
  departure_date: string;
  return_date?: string;
  notes?: string;
  flights?: ExtractedFlight[];
}

interface UploadItineraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadItineraryDialog({ open, onOpenChange }: UploadItineraryDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedItinerary | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [scanPhase, setScanPhase] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addFlight, checkFlightStatus, updateFlight } = useTravelFlights();
  const { createItinerary } = useTravelItineraries();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
      return;
    }

    setIsProcessing(true);
    setExtracted(null);

    try {
      // Convert to base64
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      const { data, error } = await supabase.functions.invoke("parse-itinerary", {
        body: { image_base64: base64, mime_type: file.type },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      if (data?.extracted) {
        setExtracted(data.extracted);
        toast.success("Itinerary details extracted");
      } else {
        toast.error("Could not extract details from image");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process image");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!extracted) return;
    setIsSaving(true);

    try {
      const { data: { user } } = await fortressClient.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      setScanPhase("Creating trip...");

      // Create itinerary
      let itineraryId: string | undefined;
      const tripName = extracted.trip_name || `Trip to ${extracted.destination}`;

      const itinerary = await createItinerary({
        trip_name: tripName,
        destination: extracted.destination,
        departure_date: extracted.departure_date,
        return_date: extracted.return_date,
        notes: extracted.notes,
      });

      itineraryId = itinerary?.id;

      // Create flights and collect their IDs
      const savedFlights: { id: string; flight_number: string }[] = [];
      if (extracted.flights?.length) {
        for (const flight of extracted.flights) {
          setScanPhase(`Adding ${flight.flight_number}...`);
          const saved = await addFlight({
            flight_number: flight.flight_number.toUpperCase(),
            reservation_code: flight.reservation_code?.toUpperCase(),
            airline: flight.airline,
            departure_airport: flight.departure_airport.toUpperCase(),
            arrival_airport: flight.arrival_airport.toUpperCase(),
            departure_time: new Date(flight.departure_time).toISOString(),
            arrival_time: flight.arrival_time ? new Date(flight.arrival_time).toISOString() : undefined,
            itinerary_id: itineraryId,
          });
          if (saved?.id) {
            savedFlights.push({ id: saved.id, flight_number: flight.flight_number.toUpperCase() });
          }
        }
      }

      // Auto-scan each flight for delays/alerts
      let alertsCreated = 0;
      for (const sf of savedFlights) {
        setScanPhase(`Scanning ${sf.flight_number} for delays...`);
        try {
          const result = await checkFlightStatus(sf.flight_number);
          if (result?.parsed) {
            const parsed = result.parsed;
            const updates: Record<string, unknown> = {
              last_checked_at: new Date().toISOString(),
            };
            if (parsed.status) updates.status = parsed.status;
            if (parsed.gate) updates.gate = parsed.gate;
            if (parsed.terminal) updates.terminal = parsed.terminal;
            if (parsed.delay_minutes !== undefined) updates.delay_minutes = parsed.delay_minutes;
            if (parsed.delay_reason) updates.delay_reason = parsed.delay_reason;

            await updateFlight({ id: sf.id, updates });

            // Create alert for delays or cancellations
            if (parsed.status === "delayed" || parsed.status === "cancelled") {
              const severity = parsed.status === "cancelled" ? "critical" : "warning";
              const title = parsed.status === "cancelled"
                ? `${sf.flight_number} Cancelled`
                : `${sf.flight_number} Delayed${parsed.delay_minutes ? ` ${parsed.delay_minutes}min` : ""}`;

              await supabase.from("travel_alerts").insert({
                user_id: user.id,
                itinerary_id: itineraryId || null,
                title,
                description: parsed.delay_reason || `Flight ${sf.flight_number} is ${parsed.status}`,
                severity,
                category: "aviation",
                location: extracted.destination,
              });
              alertsCreated++;
            }
          }
        } catch {
          // Non-critical — flight saved, status check failed
        }
      }

      setScanPhase(null);
      const alertMsg = alertsCreated > 0 ? ` · ${alertsCreated} alert(s)` : "";
      toast.success(`Created "${tripName}" with ${savedFlights.length} flight(s)${alertMsg}`);
      setExtracted(null);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save itinerary");
    } finally {
      setIsSaving(false);
      setScanPhase(null);
    }
  };

  const handleClose = () => {
    setExtracted(null);
    setIsProcessing(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Itinerary</DialogTitle>
        </DialogHeader>

        {!extracted ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Take a photo or upload a screenshot of your itinerary. AI will extract trip details, flights, and reservation codes.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />

            <Button
              onClick={() => fileInputRef.current?.click()}
              className="w-full gap-2"
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing itinerary...
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4" />
                  Take Photo or Upload
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Extracted trip info */}
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">
                    {extracted.trip_name || `Trip to ${extracted.destination}`}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>📍 {extracted.destination}</p>
                  <p>📅 {extracted.departure_date}{extracted.return_date ? ` → ${extracted.return_date}` : ""}</p>
                  {extracted.notes && <p className="mt-1">{extracted.notes}</p>}
                </div>
              </CardContent>
            </Card>

            {/* Extracted flights */}
            {extracted.flights && extracted.flights.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Flights Found ({extracted.flights.length})
                </h4>
                {extracted.flights.map((flight, i) => (
                  <Card key={i} className="bg-card/50">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-sm">{flight.flight_number}</span>
                        {flight.airline && (
                          <span className="text-xs text-muted-foreground">({flight.airline})</span>
                        )}
                      </div>
                      {flight.reservation_code && (
                        <div className="flex items-center gap-1 mb-1">
                          <Ticket className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs font-mono text-muted-foreground">
                            PNR: {flight.reservation_code}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="secondary" className="text-xs">
                          {flight.departure_airport}
                        </Badge>
                        <Plane className="h-3 w-3 text-muted-foreground" />
                        <Badge variant="secondary" className="text-xs">
                          {flight.arrival_airport}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {scanPhase && (
              <div className="flex items-center gap-2 text-xs text-primary">
                <Radar className="h-3.5 w-3.5 animate-pulse" />
                <span>{scanPhase}</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button className="flex-1 gap-2" onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                {isSaving ? "Scanning..." : "Save & Scan"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
