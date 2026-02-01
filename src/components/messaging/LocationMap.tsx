import { useState, useEffect, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Navigation, Users, Clock, RefreshCw, X, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default marker icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Custom marker icons
const createCustomIcon = (color: string, isUser: boolean = false) => {
  return L.divIcon({
    className: "custom-marker",
    html: `
      <div style="
        position: relative;
        width: 36px;
        height: 36px;
      ">
        <div style="
          position: absolute;
          width: 36px;
          height: 36px;
          background: ${color};
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 4px 12px ${color}66;
          border: 3px solid white;
        "></div>
        ${isUser ? `
          <div style="
            position: absolute;
            width: 12px;
            height: 12px;
            background: white;
            border-radius: 50%;
            top: 12px;
            left: 12px;
            animation: pulse 2s infinite;
          "></div>
        ` : ''}
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
};

interface TeamLocation {
  id: string;
  user_id: string;
  name: string;
  avatar_url?: string;
  lat: number;
  lng: number;
  updated_at: string;
  status?: "active" | "idle" | "offline";
}

interface LocationMapProps {
  conversationId: string;
  onClose: () => void;
  isOpen: boolean;
}

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

export function LocationMap({ conversationId, onClose, isOpen }: LocationMapProps) {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [teamLocations, setTeamLocations] = useState<TeamLocation[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([40.7128, -74.006]);
  const [mapZoom, setMapZoom] = useState(13);

  // Mock team locations for demo
  useEffect(() => {
    if (isOpen) {
      // Simulate team member locations
      const mockLocations: TeamLocation[] = [
        {
          id: "1",
          user_id: "user-1",
          name: "Alex Chen",
          lat: 40.7148,
          lng: -74.008,
          updated_at: new Date(Date.now() - 5 * 60000).toISOString(),
          status: "active",
        },
        {
          id: "2",
          user_id: "user-2",
          name: "Jordan Rivera",
          lat: 40.7108,
          lng: -74.002,
          updated_at: new Date(Date.now() - 15 * 60000).toISOString(),
          status: "idle",
        },
        {
          id: "3",
          user_id: "user-3",
          name: "Sam Taylor",
          lat: 40.7168,
          lng: -74.012,
          updated_at: new Date(Date.now() - 60 * 60000).toISOString(),
          status: "offline",
        },
      ];
      setTeamLocations(mockLocations);
    }
  }, [isOpen]);

  const getCurrentLocation = useCallback(() => {
    setIsLoading(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setUserLocation(newLocation);
          setMapCenter([newLocation.lat, newLocation.lng]);
          setMapZoom(15);
          setIsLoading(false);
        },
        (error) => {
          console.error("Error getting location:", error);
          setIsLoading(false);
        },
        { enableHighAccuracy: true }
      );
    }
  }, []);

  const toggleSharing = () => {
    if (!isSharing) {
      getCurrentLocation();
    }
    setIsSharing(!isSharing);
  };

  const focusOnMember = (location: TeamLocation) => {
    setSelectedMember(location.id);
    setMapCenter([location.lat, location.lng]);
    setMapZoom(16);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "active":
        return "hsl(var(--low))";
      case "idle":
        return "hsl(var(--medium))";
      default:
        return "hsl(var(--muted-foreground))";
    }
  };

  const getTimeAgo = (dateString: string) => {
    const diff = Date.now() - new Date(dateString).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background"
      >
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-[1000] bg-card/95 backdrop-blur-lg border-b border-border safe-area-top">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
              <div>
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Team Locations
                </h2>
                <p className="text-xs text-muted-foreground">
                  {teamLocations.length} team members
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={getCurrentLocation}
                disabled={isLoading}
              >
                <Crosshair className={cn("h-5 w-5", isLoading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </div>

        {/* Map Container */}
        <div className="absolute inset-0 pt-[60px] pb-[180px]">
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            className="h-full w-full"
            zoomControl={false}
          >
            <MapController center={mapCenter} zoom={mapZoom} />
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            
            {/* Team member markers */}
            {teamLocations.map((location) => (
              <Marker
                key={location.id}
                position={[location.lat, location.lng]}
                icon={createCustomIcon(getStatusColor(location.status))}
                eventHandlers={{
                  click: () => focusOnMember(location),
                }}
              >
                <Popup className="custom-popup">
                  <div className="flex items-center gap-2 p-1">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={location.avatar_url} />
                      <AvatarFallback className="text-xs bg-secondary">
                        {location.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{location.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {getTimeAgo(location.updated_at)}
                      </p>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* User's own location */}
            {userLocation && (
              <Marker
                position={[userLocation.lat, userLocation.lng]}
                icon={createCustomIcon("hsl(var(--primary))", true)}
              >
                <Popup>
                  <div className="p-1">
                    <p className="font-medium text-sm">Your Location</p>
                    <p className="text-xs text-muted-foreground">Sharing active</p>
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>
        </div>

        {/* Bottom Panel */}
        <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-card/95 backdrop-blur-lg border-t border-border rounded-t-3xl safe-area-bottom">
          <div className="p-4">
            {/* Share Location Button */}
            <Button
              onClick={toggleSharing}
              className={cn(
                "w-full mb-4 h-12 text-base font-medium transition-all",
                isSharing
                  ? "bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30"
                  : "bg-primary hover:bg-primary/90"
              )}
              disabled={isLoading}
            >
              {isLoading ? (
                <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                <Navigation className={cn("h-5 w-5 mr-2", isSharing && "text-primary")} />
              )}
              {isSharing ? "Sharing Your Location" : "Share My Location"}
            </Button>

            {/* Team Members List */}
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Team Members</span>
            </div>
            
            <ScrollArea className="max-h-[100px]">
              <div className="flex gap-2 pb-2">
                {teamLocations.map((location) => (
                  <motion.div
                    key={location.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => focusOnMember(location)}
                  >
                    <Card
                      className={cn(
                        "p-3 cursor-pointer transition-all min-w-[140px]",
                        selectedMember === location.id
                          ? "border-primary bg-primary/10"
                          : "hover:bg-card/80"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={location.avatar_url} />
                            <AvatarFallback className="text-xs bg-secondary">
                              {location.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div
                            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card"
                            style={{ backgroundColor: getStatusColor(location.status) }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{location.name}</p>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {getTimeAgo(location.updated_at)}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Custom CSS for map */}
        <style>{`
          .leaflet-container {
            background: hsl(var(--background));
          }
          .custom-marker {
            background: transparent !important;
            border: none !important;
          }
          .leaflet-popup-content-wrapper {
            background: hsl(var(--card));
            color: hsl(var(--card-foreground));
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          }
          .leaflet-popup-tip {
            background: hsl(var(--card));
          }
          .leaflet-popup-close-button {
            color: hsl(var(--muted-foreground)) !important;
          }
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
              transform: scale(1);
            }
            50% {
              opacity: 0.5;
              transform: scale(0.8);
            }
          }
        `}</style>
      </motion.div>
    </AnimatePresence>
  );
}
