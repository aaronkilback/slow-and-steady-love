import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, AlertTriangle, X, Zap, HelpCircle, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AegisAlertProps {
  severity: "critical" | "high" | "medium" | "low" | "none";
  suggestion: string;
  emergencyType?: string | null;
  onDismiss: () => void;
  onAcceptHelp?: () => void;
}

export function AegisAlert({ 
  severity, 
  suggestion, 
  emergencyType,
  onDismiss,
  onAcceptHelp 
}: AegisAlertProps) {
  const [isExpanded, setIsExpanded] = useState(severity === "critical");

  const getSeverityStyles = () => {
    switch (severity) {
      case "critical":
        return {
          bg: "bg-destructive/20 border-destructive",
          icon: "text-destructive",
          glow: "shadow-[0_0_30px_rgba(239,68,68,0.4)]",
          pulse: true
        };
      case "high":
        return {
          bg: "bg-orange-500/20 border-orange-500",
          icon: "text-orange-500",
          glow: "shadow-[0_0_20px_rgba(249,115,22,0.3)]",
          pulse: true
        };
      case "medium":
        return {
          bg: "bg-yellow-500/20 border-yellow-500",
          icon: "text-yellow-500",
          glow: "",
          pulse: false
        };
      default:
        return {
          bg: "bg-primary/20 border-primary",
          icon: "text-primary",
          glow: "",
          pulse: false
        };
    }
  };

  const styles = getSeverityStyles();

  const getEmergencyLabel = () => {
    switch (emergencyType) {
      case "security_breach": return "Security Breach";
      case "medical": return "Medical Emergency";
      case "hostile_threat": return "Hostile Threat";
      case "evacuation": return "Evacuation Required";
      case "technical_failure": return "System Failure";
      case "personnel_issue": return "Personnel Alert";
      default: return "Alert";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      className={cn(
        "mx-4 mb-3 rounded-2xl border-2 overflow-hidden",
        styles.bg,
        styles.glow,
        styles.pulse && "animate-pulse"
      )}
    >
      {/* Header */}
      <div 
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className={cn(
          "flex items-center justify-center h-10 w-10 rounded-xl",
          severity === "critical" ? "bg-destructive/30" : "bg-primary/30"
        )}>
          {severity === "critical" || severity === "high" ? (
            <AlertTriangle className={cn("h-5 w-5", styles.icon)} />
          ) : (
            <Shield className={cn("h-5 w-5", styles.icon)} />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">AEGIS</span>
            {emergencyType && emergencyType !== "null" && (
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                severity === "critical" ? "bg-destructive text-destructive-foreground" : "bg-primary/30 text-primary"
              )}>
                {getEmergencyLabel()}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {isExpanded ? "Monitoring active" : suggestion}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              <p className="text-sm text-foreground leading-relaxed">
                {suggestion}
              </p>
              
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className={cn(
                    "flex-1",
                    severity === "critical" && "bg-destructive hover:bg-destructive/90"
                  )}
                  onClick={onAcceptHelp}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Accept Help
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={onDismiss}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface AegisMonitoringBadgeProps {
  isActive: boolean;
  lastCheck?: Date;
}

export function AegisMonitoringBadge({ isActive, lastCheck }: AegisMonitoringBadgeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 border border-primary/30"
    >
      <div className={cn(
        "h-2 w-2 rounded-full",
        isActive ? "bg-primary animate-pulse" : "bg-muted-foreground"
      )} />
      <span className="text-[10px] font-medium text-primary">
        Aegis Monitoring
      </span>
    </motion.div>
  );
}
