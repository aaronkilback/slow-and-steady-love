import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CheckCircle, MapPin, Loader2, ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fortressClient } from "@/lib/fortress-client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/AuthProvider";

const HOLD_DURATION = 3000; // 3 seconds hold to activate

type SOSState = "idle" | "holding" | "locating" | "sending" | "active" | "clearing";

export default function SOSPage() {
  const [sosState, setSosState] = useState<SOSState>("idle");
  const [holdProgress, setHoldProgress] = useState(0);
  const [activatedAt, setActivatedAt] = useState<Date | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef<number>(0);

  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  // Tick elapsed seconds while SOS is active
  useEffect(() => {
    if (sosState === "active") {
      elapsedIntervalRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
      setElapsedSeconds(0);
    }
    return () => {
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    };
  }, [sosState]);

  const stopHold = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    if (sosState === "holding") {
      setSosState("idle");
      setHoldProgress(0);
    }
  }, [sosState]);

  const startHold = useCallback(() => {
    if (sosState !== "idle") return;
    setSosState("holding");
    holdStartRef.current = Date.now();

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current;
      setHoldProgress(Math.min(elapsed / HOLD_DURATION, 1));
    }, 30);

    holdTimerRef.current = setTimeout(async () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      setHoldProgress(1);
      setSosState("locating");

      // Get GPS location
      let coords: { lat: number; lng: number } | null = null;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 8000,
            enableHighAccuracy: true,
          })
        );
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(coords);
      } catch {
        // Continue without location
      }

      setSosState("sending");

      try {
        const operatorName =
          user?.user_metadata?.full_name ||
          user?.user_metadata?.name ||
          user?.email?.split("@")[0] ||
          "Unknown Operator";

        const locationStr = coords
          ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
          : "Location unavailable";

        // Create critical signal in Fortress
        await fortressClient.from("signals").insert({
          type: "sos",
          severity: "critical",
          priority: "critical",
          title: `🆘 SOS ACTIVATED — ${operatorName}`,
          description: `Emergency SOS activated by operator ${operatorName} (${user?.email}). Location: ${locationStr}. Immediate response required.`,
          status: "active",
          source: "fortress-mobile",
          location: locationStr,
          metadata: {
            operator_id: user?.id,
            operator_name: operatorName,
            operator_email: user?.email,
            coordinates: coords,
            activated_at: new Date().toISOString(),
          },
        });

        setActivatedAt(new Date());
        setSosState("active");
      } catch (err) {
        console.error("SOS send failed:", err);
        toast({
          variant: "destructive",
          title: "SOS Failed",
          description: "Could not send SOS alert. Try again or call emergency services directly.",
        });
        setSosState("idle");
        setHoldProgress(0);
      }
    }, HOLD_DURATION);
  }, [sosState, user, toast]);

  const sendAllClear = useCallback(async () => {
    setSosState("clearing");
    try {
      const operatorName =
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.email?.split("@")[0] ||
        "Unknown Operator";

      await fortressClient.from("signals").insert({
        type: "sos_clear",
        severity: "info",
        priority: "low",
        title: `✅ SOS CLEARED — ${operatorName}`,
        description: `All clear from operator ${operatorName} (${user?.email}). SOS alert has been cancelled.`,
        status: "resolved",
        source: "fortress-mobile",
        metadata: {
          operator_id: user?.id,
          operator_email: user?.email,
          cleared_at: new Date().toISOString(),
        },
      });

      toast({ title: "All Clear Sent", description: "Your team has been notified." });
    } catch (err) {
      toast({ variant: "destructive", title: "Could not send all-clear", description: "Please contact your team directly." });
    } finally {
      setSosState("idle");
      setLocation(null);
      setActivatedAt(null);
      setHoldProgress(0);
    }
  }, [user, toast]);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-lg px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary"
        >
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Emergency SOS</h1>
          <p className="text-xs text-muted-foreground">Hold button 3 seconds to activate</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 gap-10">

        <AnimatePresence mode="wait">
          {sosState === "active" ? (
            /* ── ACTIVE STATE ─────────────────────────────── */
            <motion.div
              key="active"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center gap-6 text-center w-full"
            >
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="flex h-32 w-32 items-center justify-center rounded-full bg-critical/20 border-4 border-critical"
              >
                <AlertTriangle className="h-14 w-14 text-critical" />
              </motion.div>

              <div>
                <h2 className="text-2xl font-bold text-critical tracking-widest">SOS ACTIVE</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Activated at {activatedAt?.toLocaleTimeString()}
                </p>
                <p className="text-3xl font-mono font-bold text-foreground mt-2">
                  {formatElapsed(elapsedSeconds)}
                </p>
              </div>

              {location && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary rounded-lg px-4 py-2">
                  <MapPin className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-mono text-xs">
                    {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                  </span>
                </div>
              )}

              <p className="text-sm text-muted-foreground max-w-xs">
                Your team has been alerted. Stay calm. When you are safe, send an all-clear.
              </p>

              <Button
                variant="outline"
                size="lg"
                className="w-full border-low text-low hover:bg-low/10"
                onClick={sendAllClear}
              >
                <CheckCircle className="h-5 w-5 mr-2" />
                Send All Clear — I'm Safe
              </Button>
            </motion.div>

          ) : sosState === "clearing" ? (
            <motion.div
              key="clearing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-4"
            >
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Sending all-clear to your team...</p>
            </motion.div>

          ) : sosState === "locating" || sosState === "sending" ? (
            <motion.div
              key="locating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-4"
            >
              <Loader2 className="h-12 w-12 animate-spin text-critical" />
              <p className="text-sm text-muted-foreground">
                {sosState === "locating" ? "Getting your location..." : "Alerting your team..."}
              </p>
            </motion.div>

          ) : (
            /* ── IDLE / HOLD STATE ────────────────────────── */
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-8 w-full"
            >
              {/* Hold button */}
              <div className="relative flex items-center justify-center">
                {/* Progress ring */}
                <svg
                  className="absolute"
                  width={200}
                  height={200}
                  style={{ transform: "rotate(-90deg)" }}
                >
                  <circle
                    cx={100}
                    cy={100}
                    r={88}
                    fill="none"
                    stroke="rgba(239,68,68,0.15)"
                    strokeWidth={6}
                  />
                  <circle
                    cx={100}
                    cy={100}
                    r={88}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={6}
                    strokeDasharray={553}
                    strokeDashoffset={553 * (1 - holdProgress)}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 30ms linear" }}
                  />
                </svg>

                <motion.button
                  className="relative flex h-40 w-40 select-none flex-col items-center justify-center rounded-full border-4 border-critical bg-critical/20 focus:outline-none active:bg-critical/30"
                  animate={
                    sosState === "holding"
                      ? { scale: [1, 0.97, 1], transition: { repeat: Infinity, duration: 0.5 } }
                      : {}
                  }
                  onPointerDown={startHold}
                  onPointerUp={stopHold}
                  onPointerLeave={stopHold}
                  onPointerCancel={stopHold}
                >
                  <AlertTriangle className="h-12 w-12 text-critical mb-1" />
                  <span className="text-sm font-bold text-critical tracking-widest">SOS</span>
                  {sosState === "holding" && (
                    <span className="text-xs text-critical/70 mt-1">
                      {Math.ceil((1 - holdProgress) * 3)}s
                    </span>
                  )}
                </motion.button>
              </div>

              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {sosState === "holding" ? "Keep holding..." : "Hold for 3 seconds to activate"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Sends your location and a critical alert to your entire team
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Info card */}
        {sosState === "idle" && (
          <div className="w-full rounded-xl border border-border bg-card p-4 space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">What happens when you activate</h3>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">→</span> Your GPS location is shared with the team</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">→</span> A CRITICAL signal is created in Fortress</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">→</span> All operators receive an immediate alert</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">→</span> Send "All Clear" when you are safe</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
