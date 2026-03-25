import { useEffect, useRef, useCallback } from "react";
import { fortressClient } from "@/lib/fortress-client";
import { useAuth } from "@/components/auth/AuthProvider";

const TRACKING_INTERVAL = 60_000; // Update every 60 seconds

export function useLocationTracking() {
  const { user } = useAuth();
  const watchId = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSent = useRef<{ lat: number; lng: number; ts: number } | null>(null);

  const sendLocation = useCallback(
    async (lat: number, lng: number) => {
      if (!user) return;

      // Skip if position hasn't meaningfully changed (< ~50 m) and was sent recently
      if (lastSent.current) {
        const dist = Math.hypot(lat - lastSent.current.lat, lng - lastSent.current.lng);
        const elapsed = Date.now() - lastSent.current.ts;
        if (dist < 0.0005 && elapsed < TRACKING_INTERVAL) return;
      }

      try {
        const { error } = await fortressClient
          .from("user_locations")
          .upsert(
            {
              user_id: user.id,
              latitude: lat,
              longitude: lng,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );

        if (!error) {
          lastSent.current = { lat, lng, ts: Date.now() };
        } else {
          const code = (error as any)?.code;
          // Silently skip if table doesn't exist on this platform
          if (code !== "42P01" && code !== "PGRST205") {
            console.error("[location-tracking] upsert error:", error.message);
          }
        }
      } catch (err) {
        console.error("[location-tracking] send failed:", err);
      }
    },
    [user]
  );

  useEffect(() => {
    if (!user || !("geolocation" in navigator)) return;

    // Send initial position
    navigator.geolocation.getCurrentPosition(
      (pos) => sendLocation(pos.coords.latitude, pos.coords.longitude),
      (err) => console.warn("[location-tracking] initial position error:", err.message),
      { enableHighAccuracy: true }
    );

    // Watch for significant movement
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => sendLocation(pos.coords.latitude, pos.coords.longitude),
      (err) => console.warn("[location-tracking] watch error:", err.message),
      { enableHighAccuracy: true, maximumAge: 30_000 }
    );

    // Fallback interval ping
    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => sendLocation(pos.coords.latitude, pos.coords.longitude),
        () => {}
      );
    }, TRACKING_INTERVAL);

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, sendLocation]);
}
