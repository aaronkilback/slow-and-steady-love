import { Shield, ShieldOff, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface EncryptionStatusProps {
  isEncrypted: boolean;
  isUnlocked: boolean;
  className?: string;
}

export function EncryptionStatus({ isEncrypted, isUnlocked, className }: EncryptionStatusProps) {
  if (!isEncrypted) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn("gap-1 text-muted-foreground", className)}>
            <ShieldOff className="h-3 w-3" />
            <span className="text-[10px]">Unencrypted</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Messages are not end-to-end encrypted</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (!isUnlocked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn("gap-1 text-amber-500 border-amber-500/50", className)}>
            <Lock className="h-3 w-3" />
            <span className="text-[10px]">Locked</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Enter passphrase to decrypt messages</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn("gap-1 text-emerald-500 border-emerald-500/50", className)}>
          <Shield className="h-3 w-3" />
          <span className="text-[10px]">E2E Encrypted</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>Messages are end-to-end encrypted with Signal protocol</p>
      </TooltipContent>
    </Tooltip>
  );
}
