import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Ghost, Wifi, Bluetooth, ShieldAlert, Cpu, Clock, ChevronDown, ChevronUp, RefreshCw, Loader2, Zap, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWraithFindings, WraithFinding } from "@/hooks/useFortressData";

type Severity = "critical" | "high" | "medium" | "low";

const severityConfig: Record<Severity, { color: string; bgColor: string; glowClass: string }> = {
  critical: { color: "text-critical", bgColor: "bg-critical/10", glowClass: "glow-critical" },
  high: { color: "text-high", bgColor: "bg-high/10", glowClass: "glow-high" },
  medium: { color: "text-medium", bgColor: "bg-medium/10", glowClass: "glow-medium" },
  low: { color: "text-low", bgColor: "bg-low/10", glowClass: "glow-low" },
};

const vectorIcons: Record<string, React.ElementType> = {
  wifi: Wifi,
  bluetooth: Bluetooth,
  network: ShieldAlert,
  device: Cpu,
};

function getVectorIcon(vector: string): React.ElementType {
  const lower = vector.toLowerCase();
  for (const [key, icon] of Object.entries(vectorIcons)) {
    if (lower.includes(key)) return icon;
  }
  return ShieldAlert;
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function WraithCard({ finding }: { finding: WraithFinding }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const severity = (finding.severity || "medium") as Severity;
  const config = severityConfig[severity];
  const VectorIcon = getVectorIcon(finding.vector);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <Card
        className={cn(
          "cursor-pointer border-l-4 transition-all duration-200",
          config.bgColor,
          isExpanded && config.glowClass
        )}
        style={{ borderLeftColor: `hsl(var(--${severity}))` }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className={cn("mt-0.5 rounded-lg p-2", config.bgColor)}>
              <VectorIcon className={cn("h-4 w-4", config.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className={cn("text-xs", config.color)}>
                  {severity.toUpperCase()}
                </Badge>
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  {finding.threat_type}
                </Badge>
              </div>
              <h3 className="font-medium text-sm text-foreground leading-tight">
                {finding.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {finding.description}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTimeAgo(new Date(finding.created_at))}
                </span>
                <span className="flex items-center gap-1">
                  <Ghost className="h-3 w-3" />
                  Wraith
                </span>
                {finding.status && (
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    {finding.status}
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-muted-foreground">
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-border space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                      {finding.description}
                    </p>
                  </div>

                  {finding.recommendation && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Recommendation</p>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                        {finding.recommendation}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Attack Vector</p>
                      <p className="text-foreground font-medium capitalize">{finding.vector}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Threat Type</p>
                      <p className="text-foreground font-medium capitalize">{finding.threat_type}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Detected</p>
                      <p className="text-foreground font-medium">
                        {new Date(finding.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {finding.raw && (
                    <details className="text-xs">
                      <summary className="text-muted-foreground cursor-pointer hover:text-primary transition-colors">
                        View raw threat data
                      </summary>
                      <div className="mt-2 bg-secondary/50 rounded-lg p-2 font-mono overflow-x-auto max-h-48 overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-foreground text-[10px]">
                          {JSON.stringify(finding.raw, null, 2)}
                        </pre>
                      </div>
                    </details>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </motion.div>
  );
}

const SIMULATED_THREATS: WraithFinding[] = [
  {
    id: "sim-1",
    title: "Rogue WiFi Access Point Detected",
    description: "An unsecured WiFi network \"Free_Airport_WiFi\" is broadcasting near your device. This network signature matches known evil twin attack patterns. Your device attempted auto-connection which was blocked.",
    severity: "critical",
    threat_type: "Evil Twin Attack",
    vector: "wifi",
    created_at: new Date().toISOString(),
    status: "active",
    recommendation: "Disable WiFi auto-connect. Only connect to networks you trust. Use VPN on all public networks. Go to Settings > WiFi > Auto-Join and disable for unknown networks.",
  },
  {
    id: "sim-2",
    title: "Credential Exposure — Email Found in Data Breach",
    description: "Your email address was found in a recent data breach affecting 2.3M accounts from a compromised service. Exposed data includes email, hashed password, and IP address. Breach date: January 2026.",
    severity: "critical",
    threat_type: "Credential Leak",
    vector: "network",
    created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    status: "action_required",
    recommendation: "Immediately change your password on the affected service and any other accounts using the same password. Enable two-factor authentication (2FA) on all critical accounts. Consider using a password manager to generate unique passwords.",
  },
  {
    id: "sim-3",
    title: "Bluetooth Probe Request Anomaly",
    description: "An unknown device is sending repeated Bluetooth probe requests targeting your device MAC address. This pattern is consistent with Bluetooth tracking or BlueBorne exploit reconnaissance.",
    severity: "high",
    threat_type: "Bluetooth Exploit",
    vector: "bluetooth",
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    status: "monitoring",
    recommendation: "Disable Bluetooth when not in use. Set Bluetooth visibility to hidden. Check paired devices list and remove any you don't recognize.",
  },
  {
    id: "sim-4",
    title: "Suspicious DNS Redirect Detected",
    description: "DNS queries from your device are being redirected through an unauthorized resolver (185.xx.xx.42). This could indicate DNS spoofing or a compromised network router attempting to intercept your traffic.",
    severity: "high",
    threat_type: "DNS Spoofing",
    vector: "network",
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    status: "detected",
    recommendation: "Switch to a trusted DNS provider (1.1.1.1 or 8.8.8.8). Enable DNS-over-HTTPS in your browser settings. Activate your VPN to encrypt all DNS traffic.",
  },
  {
    id: "sim-5",
    title: "Unencrypted HTTP Traffic on Sensitive Domain",
    description: "Your device sent login credentials over an unencrypted HTTP connection to a banking-related domain. This data could be intercepted by any device on the same network.",
    severity: "medium",
    threat_type: "Data Exposure",
    vector: "network",
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    status: "resolved",
    recommendation: "Always verify HTTPS (lock icon) before entering credentials. Install a browser extension that forces HTTPS connections. Report the site to the domain owner.",
  },
];

export function WraithFeed() {
  const { data: findings = [], isLoading, refetch, isRefetching } = useWraithFindings();
  const [simulated, setSimulated] = useState<WraithFinding[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);

  const allFindings = [...simulated, ...findings];

  const runSimulation = useCallback(() => {
    setIsSimulating(true);
    setSimulated([]);
    
    // Drip-feed threats one by one for realism
    SIMULATED_THREATS.forEach((threat, i) => {
      setTimeout(() => {
        setSimulated(prev => [{ ...threat, id: `sim-${Date.now()}-${i}`, created_at: new Date().toISOString() }, ...prev]);
        if (i === SIMULATED_THREATS.length - 1) setIsSimulating(false);
      }, (i + 1) * 1200);
    });
  }, []);

  const clearSimulation = useCallback(() => {
    setSimulated([]);
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Wraith scanning...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 py-2 flex items-center justify-between border-b border-border">
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Ghost className="h-3.5 w-3.5 text-primary" />
          {allFindings.length} threats detected
        </span>
        <div className="flex items-center gap-1">
          {simulated.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSimulation}
              className="h-8 px-2 text-xs text-muted-foreground"
            >
              Clear Sim
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={runSimulation}
            disabled={isSimulating}
            className="h-8 px-2"
          >
            {isSimulating ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-1" />
            )}
            Simulate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-8 px-2"
          >
            <RefreshCw className={cn("h-4 w-4 mr-1", isRefetching && "animate-spin")} />
            Scan
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 py-4">
        <div className="space-y-3 pb-4">
          {allFindings.length === 0 ? (
            <div className="text-center py-12">
              <Ghost className="h-12 w-12 mx-auto mb-3 text-primary opacity-50" />
              <p className="text-muted-foreground">No threats detected</p>
              <p className="text-xs text-muted-foreground mt-1">
                Wraith is monitoring your device perimeter
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={runSimulation}
                className="mt-4"
              >
                <Zap className="h-4 w-4 mr-1.5" />
                Run Threat Simulation
              </Button>
            </div>
          ) : (
            <AnimatePresence>
              {allFindings.map((finding) => (
                <WraithCard key={finding.id} finding={finding} />
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
