import { useState } from "react";
import { Lock, Eye, EyeOff, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface EncryptionUnlockProps {
  open: boolean;
  onUnlock: (passphrase: string) => Promise<boolean>;
  onCancel?: () => void;
}

export function EncryptionUnlock({ open, onUnlock, onCancel }: EncryptionUnlockProps) {
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleUnlock = async () => {
    setError("");
    setIsLoading(true);
    
    const success = await onUnlock(passphrase);
    setIsLoading(false);

    if (!success) {
      setError("Invalid passphrase");
      setPassphrase("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && passphrase) {
      handleUnlock();
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle>Unlock Encryption</DialogTitle>
              <DialogDescription>
                Enter your passphrase to decrypt messages
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="passphrase">Encryption Passphrase</Label>
            <div className="relative">
              <Input
                id="passphrase"
                type={showPassphrase ? "text" : "password"}
                placeholder="Enter your passphrase"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                onKeyDown={handleKeyPress}
                className="pr-10"
                autoFocus
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                onClick={() => setShowPassphrase(!showPassphrase)}
              >
                {showPassphrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
          )}
          <Button onClick={handleUnlock} disabled={isLoading || !passphrase}>
            {isLoading ? "Unlocking..." : "Unlock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
