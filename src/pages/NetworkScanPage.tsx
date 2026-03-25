import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wifi, Bluetooth, ShieldCheck, ShieldAlert, ShieldX,
  Loader2, ArrowLeft, RefreshCw, AlertTriangle, CheckCircle, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface ScanFinding {
  id: string;
  severity: "critical" | "high" | "medium" | "info";
  category: "wifi" | "bluetooth" | "network";
  title: string;
  description: string;
  recommendation: string;
}

type ScanStatus = "idle" | "scanning" | "done";

const SEVERITY_COLORS = {
  critical: "text-critical border-critical/40 bg-critical/10",
  high: "text-high border-high/40 bg-high/10",
  medium: "text-amber-400 border-amber-400/40 bg-amber-400/10",
  info: "text-primary border-primary/40 bg-primary/10",
};

const CAPTIVE_PORTAL_URLS = [
  "https://www.gstatic.com/generate_204",
  "https://connectivitycheck.gstatic.com/generate_204",
];

async function testCaptivePortal(): Promise<boolean> {
  for (const url of CAPTIVE_PORTAL_URLS) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch(url, { signal: ctrl.signal, mode: "no-cors" });
      clearTimeout(timeout);
      // no-cors always returns opaque response — if we get here it's a real network
      return false;
    } catch {
      // Abort or network error
    }
  }
  return true; // All checks failed — possible captive portal
}

async function measureLatency(): Promise<number> {
  const start = performance.now();
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    await fetch("https://www.gstatic.com/generate_204", { mode: "no-cors", signal: ctrl.signal });
    clearTimeout(timeout);
    return Math.round(performance.now() - start);
  } catch {
    return 9999;
  }
}

function getConnectionInfo(): { type: string; downlink: string; rtt: number | null } {
  const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (!conn) return { type: "unknown", downlink: "unknown", rtt: null };
  return {
    type: conn.effectiveType || conn.type || "unknown",
    downlink: conn.downlink ? `${conn.downlink} Mbps` : "unknown",
    rtt: conn.rtt ?? null,
  };
}

export default function NetworkScanPage() {
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [findings, setFindings] = useState<ScanFinding[]>([]);
  const [btDevices, setBtDevices] = useState<BluetoothDevice[]>([]);
  const [overallRisk, setOverallRisk] = useState<"safe" | "caution" | "danger" | null>(null);
  const [scanStep, setScanStep] = useState("");
  const navigate = useNavigate();

  const runScan = useCallback(async () => {
    setScanStatus("scanning");
    setFindings([]);
    setBtDevices([]);
    setOverallRisk(null);
    const results: ScanFinding[] = [];

    // ── Step 1: Connection info
    setScanStep("Reading connection info...");
    const connInfo = getConnectionInfo();

    if (connInfo.type === "2g" || connInfo.type === "slow-2g") {
      results.push({
        id: "slow-conn",
        severity: "medium",
        category: "network",
        title: "Slow Connection Detected",
        description: `Connection type: ${connInfo.type}. This could indicate network throttling or an evil twin attack degrading bandwidth.`,
        recommendation: "Verify you are connected to your trusted network. Avoid transmitting sensitive data.",
      });
    }

    // ── Step 2: Latency check
    setScanStep("Measuring network latency...");
    const latency = await measureLatency();

    if (latency > 2000) {
      results.push({
        id: "high-latency",
        severity: "high",
        category: "wifi",
        title: "Abnormally High Latency",
        description: `Round-trip latency: ${latency}ms. Extremely high latency can indicate a Man-in-the-Middle proxy or an evil twin access point intercepting traffic.`,
        recommendation: "Disconnect from this network. Use mobile data (LTE/5G) until you can verify your network.",
      });
    } else if (latency > 800) {
      results.push({
        id: "elevated-latency",
        severity: "medium",
        category: "wifi",
        title: "Elevated Latency",
        description: `Round-trip latency: ${latency}ms. Moderately high — could indicate a proxy or congested network.`,
        recommendation: "Monitor this network. Avoid transmitting sensitive credentials.",
      });
    } else if (latency < 9999) {
      results.push({
        id: "latency-ok",
        severity: "info",
        category: "wifi",
        title: "Network Latency Normal",
        description: `Round-trip latency: ${latency}ms. No anomalies detected.`,
        recommendation: "Continue normal operations.",
      });
    }

    // ── Step 3: Captive portal check
    setScanStep("Checking for captive portal...");
    const hasCaptive = await testCaptivePortal();
    if (hasCaptive) {
      results.push({
        id: "captive-portal",
        severity: "critical",
        category: "wifi",
        title: "Captive Portal Detected",
        description: "All HTTPS connectivity checks failed. This network may be intercepting traffic via a captive portal or a MITM attack. Your data is not safe on this network.",
        recommendation: "Do not authenticate or enter any credentials. Disconnect immediately and use mobile data.",
      });
    }

    // ── Step 4: Protocol security check
    setScanStep("Checking protocol security...");
    if (location.protocol === "http:") {
      results.push({
        id: "insecure-protocol",
        severity: "critical",
        category: "network",
        title: "Insecure Connection (HTTP)",
        description: "This app is running over HTTP. All traffic is unencrypted and visible to anyone on the network.",
        recommendation: "Access this app via HTTPS only. Contact your administrator.",
      });
    }

    // ── Step 5: Bluetooth scan
    setScanStep("Scanning for Bluetooth devices...");
    if ("bluetooth" in navigator) {
      try {
        // Request BT device with no filters — scans visible devices
        const device = await (navigator as any).bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [],
        });
        if (device) {
          setBtDevices([device]);
          // Flag any device without a name as potentially suspicious
          if (!device.name) {
            results.push({
              id: `bt-unnamed-${device.id}`,
              severity: "medium",
              category: "bluetooth",
              title: "Unnamed Bluetooth Device Detected",
              description: `A Bluetooth device with no name (ID: ${device.id?.slice(0, 8)}…) is visible. Unnamed devices are common in Bluetooth skimmers and tracking devices.`,
              recommendation: "Do not pair with unknown devices. Move away from this area if the device persists.",
            });
          } else {
            results.push({
              id: `bt-${device.id}`,
              severity: "info",
              category: "bluetooth",
              title: `Bluetooth Device: ${device.name}`,
              description: `Visible device: "${device.name}". No threats identified from this device name.`,
              recommendation: "Only pair with devices you recognise.",
            });
          }
        }
      } catch (e: any) {
        if (e?.name !== "NotFoundError" && e?.name !== "SecurityError") {
          // User cancelled — that's fine
        }
        results.push({
          id: "bt-not-scanned",
          severity: "info",
          category: "bluetooth",
          title: "Bluetooth Scan Skipped",
          description: "Bluetooth scan was not completed (permission denied or no device selected).",
          recommendation: "Manually check for unknown paired devices in your phone settings.",
        });
      }
    } else {
      results.push({
        id: "bt-unavailable",
        severity: "info",
        category: "bluetooth",
        title: "Bluetooth API Unavailable",
        description: "Web Bluetooth API is not supported on this browser or device.",
        recommendation: "Use your device's native Bluetooth settings to review paired devices.",
      });
    }

    // ── Determine overall risk
    const hasCritical = results.some((r) => r.severity === "critical");
    const hasHigh = results.some((r) => r.severity === "high");
    const risk = hasCritical ? "danger" : hasHigh ? "caution" : "safe";

    setFindings(results);
    setOverallRisk(risk);
    setScanStatus("done");
    setScanStep("");
  }, []);

  const RiskBadge = () => {
    if (!overallRisk) return null;
    const map = {
      safe: { icon: ShieldCheck, label: "NETWORK SAFE", cls: "text-low border-low/40 bg-low/10" },
      caution: { icon: ShieldAlert, label: "USE CAUTION", cls: "text-amber-400 border-amber-400/40 bg-amber-400/10" },
      danger: { icon: ShieldX, label: "THREAT DETECTED", cls: "text-critical border-critical/40 bg-critical/10" },
    };
    const { icon: Icon, label, cls } = map[overallRisk];
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn("flex items-center gap-3 rounded-xl border px-4 py-3 w-full", cls)}
      >
        <Icon className="h-6 w-6 shrink-0" />
        <span className="font-bold tracking-wider text-sm">{label}</span>
      </motion.div>
    );
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
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-foreground">Network Security Scan</h1>
          <p className="text-xs text-muted-foreground">Wi-Fi & Bluetooth threat detection</p>
        </div>
        {scanStatus === "done" && (
          <Button variant="ghost" size="icon" onClick={runScan}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="px-4 py-6 space-y-5 pb-24">

          {/* Scan trigger */}
          {scanStatus === "idle" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-6 py-8"
            >
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 border border-primary/30">
                <Wifi className="h-10 w-10 text-primary" />
              </div>
              <div className="text-center space-y-1">
                <h2 className="font-semibold text-foreground">Ready to Scan</h2>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Checks for MITM attacks, captive portals, high-latency spoofing, and suspicious Bluetooth devices
                </p>
              </div>
              <Button size="lg" className="w-full" onClick={runScan}>
                Start Security Scan
              </Button>
            </motion.div>
          )}

          {/* Scanning state */}
          {scanStatus === "scanning" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-5 py-10"
            >
              <div className="relative flex h-20 w-20 items-center justify-center">
                <motion.div
                  animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0.1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="absolute inset-0 rounded-full bg-primary/20"
                />
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">Scanning...</p>
              <p className="text-xs text-muted-foreground">{scanStep}</p>
            </motion.div>
          )}

          {/* Results */}
          {scanStatus === "done" && (
            <AnimatePresence>
              <motion.div
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <RiskBadge />

                <div className="space-y-3">
                  {findings.map((finding, i) => (
                    <motion.div
                      key={finding.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                    >
                      <Card className={cn("p-4 border", SEVERITY_COLORS[finding.severity])}>
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 shrink-0">
                            {finding.severity === "critical" || finding.severity === "high" ? (
                              <AlertTriangle className="h-4 w-4" />
                            ) : finding.severity === "info" ? (
                              <CheckCircle className="h-4 w-4" />
                            ) : (
                              <Info className="h-4 w-4" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold">{finding.title}</p>
                              <Badge variant="outline" className={cn("text-[10px] px-1.5", SEVERITY_COLORS[finding.severity])}>
                                {finding.severity.toUpperCase()}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5 text-muted-foreground border-muted">
                                {finding.category === "wifi" ? "WI-FI" : finding.category === "bluetooth" ? "BT" : "NET"}
                              </Badge>
                            </div>
                            <p className="text-xs opacity-80">{finding.description}</p>
                            <p className="text-xs font-medium opacity-90">
                              → {finding.recommendation}
                            </p>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                <Button variant="outline" className="w-full" onClick={runScan}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Scan Again
                </Button>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
