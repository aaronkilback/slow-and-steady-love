import { motion } from "framer-motion";
import { AlertTriangle, Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AegisAlertProps {
  severity: "critical" | "high" | "medium" | "low" | "none";
  suggestion: string;
  onDismiss: () => void;
  onAcceptHelp?: () => void;
}

export function AegisAlert({ severity, suggestion, onDismiss, onAcceptHelp }: AegisAlertProps) {
  const isCritical = severity === "critical" || severity === "high";

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "mx-4 mb-2 p-3 rounded-xl border flex items-start gap-3",
        isCritical
          ? "bg-destructive/10 border-destructive/50"
          : "bg-primary/10 border-primary/50"
      )}
    >
      <div className={cn(
        "h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0",
        isCritical ? "bg-destructive/20" : "bg-primary/20"
      )}>
        {isCritical ? (
          <AlertTriangle className="h-4 w-4 text-destructive" />
        ) : (
          <Shield className="h-4 w-4 text-primary" />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground mb-0.5">Aegis</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{suggestion}</p>
        
        {isCritical && onAcceptHelp && (
          <Button
            size="sm"
            variant="destructive"
            className="mt-2 h-7 text-xs"
            onClick={onAcceptHelp}
          >
            Get Help Now
          </Button>
        )}
      </div>
      
      <button
        onClick={onDismiss}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

export function AegisMonitoringBadge({ isActive }: { isActive: boolean }) {
  if (!isActive) return null;
  
  return (
    <div className="flex items-center gap-1">
      <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
    </div>
  );
}
