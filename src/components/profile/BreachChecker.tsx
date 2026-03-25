import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ShieldAlert, ShieldCheck, Loader2, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fortressClient } from "@/lib/fortress-client";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";

interface WraithFinding {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  threat_type: string;
  recommendation: string;
  created_at: string;
}

const SEVERITY_COLORS = {
  critical: "text-critical border-critical/40 bg-critical/10",
  high: "text-high border-high/40 bg-high/10",
  medium: "text-amber-400 border-amber-400/40 bg-amber-400/10",
  low: "text-primary border-primary/40 bg-primary/10",
  info: "text-muted-foreground border-border bg-secondary",
};

function FindingCard({ finding }: { finding: WraithFinding }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card
      className={cn("p-3 border cursor-pointer transition-colors", SEVERITY_COLORS[finding.severity])}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium">{finding.title}</p>
            <Badge variant="outline" className={cn("text-[10px] px-1.5", SEVERITY_COLORS[finding.severity])}>
              {finding.severity.toUpperCase()}
            </Badge>
          </div>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <p className="text-xs opacity-80 mt-2">{finding.description}</p>
                <p className="text-xs font-semibold mt-2 opacity-90">
                  → {finding.recommendation}
                </p>
                <p className="text-[10px] text-muted-foreground mt-2">
                  {new Date(finding.created_at).toLocaleDateString()}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 opacity-60" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        )}
      </div>
    </Card>
  );
}

export function BreachChecker() {
  const [isScanning, setIsScanning] = useState(false);
  const [findings, setFindings] = useState<WraithFinding[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const runBreachCheck = async () => {
    setIsScanning(true);
    setError(null);
    setFindings([]);

    try {
      // Use local Supabase session to call wraith-breach-check
      const { data: { session } } = await supabase.auth.getSession();
      // Fall back to fortress session if local session not available
      const { data: { session: fortressSession } } = await fortressClient.auth.getSession();
      const token = session?.access_token || fortressSession?.access_token;

      if (!token) {
        setError("Not authenticated. Please sign in.");
        return;
      }

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wraith-breach-check`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${resp.status})`);
      }

      const data = await resp.json();
      setFindings(data.findings || []);
      setCheckedAt(data.checked_at || new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed. Please try again.");
    } finally {
      setIsScanning(false);
    }
  };

  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;
  const hasThreats = criticalCount > 0 || highCount > 0;

  return (
    <div className="space-y-3">
      <Card className="p-4 border-border bg-card">
        <div className="flex items-start gap-3">
          <div className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            hasThreats ? "bg-critical/10" : checkedAt ? "bg-low/10" : "bg-secondary"
          )}>
            {hasThreats ? (
              <ShieldAlert className="h-5 w-5 text-critical" />
            ) : checkedAt ? (
              <ShieldCheck className="h-5 w-5 text-low" />
            ) : (
              <Shield className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Breach & Exposure Check</p>
            <p className="text-xs text-muted-foreground">
              {checkedAt
                ? `Last checked ${new Date(checkedAt).toLocaleDateString()} — ${
                    findings.length === 0
                      ? "No exposures found"
                      : `${findings.length} finding${findings.length !== 1 ? "s" : ""}`
                  }`
                : `Checks ${user?.email} against breach databases`}
            </p>
          </div>
          <Button
            size="sm"
            variant={hasThreats ? "destructive" : "outline"}
            onClick={runBreachCheck}
            disabled={isScanning}
            className="shrink-0"
          >
            {isScanning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : checkedAt ? (
              "Re-scan"
            ) : (
              "Scan"
            )}
          </Button>
        </div>

        {/* Summary badges */}
        {checkedAt && findings.length > 0 && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {criticalCount > 0 && (
              <Badge variant="outline" className="text-critical border-critical/40 bg-critical/10 text-xs">
                {criticalCount} Critical
              </Badge>
            )}
            {highCount > 0 && (
              <Badge variant="outline" className="text-high border-high/40 bg-high/10 text-xs">
                {highCount} High
              </Badge>
            )}
            {findings.filter((f) => f.severity === "medium").length > 0 && (
              <Badge variant="outline" className="text-amber-400 border-amber-400/40 text-xs">
                {findings.filter((f) => f.severity === "medium").length} Medium
              </Badge>
            )}
          </div>
        )}

        {checkedAt && findings.length === 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-low">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>No known breaches or exposures found for your email</span>
          </div>
        )}
      </Card>

      {/* Error */}
      {error && (
        <Card className="p-3 border-critical/40 bg-critical/10 text-critical">
          <p className="text-xs">{error}</p>
        </Card>
      )}

      {/* Findings */}
      <AnimatePresence>
        {findings.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-2"
          >
            {findings.map((finding) => (
              <FindingCard key={finding.id} finding={finding} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
