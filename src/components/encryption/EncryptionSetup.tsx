import { useState } from "react";
import { Shield, Lock, Eye, EyeOff, AlertTriangle } from "lucide-react";
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

interface EncryptionSetupProps {
  open: boolean;
  onSetup: (passphrase: string) => Promise<boolean>;
  onSkip?: () => void;
}

export function EncryptionSetup({ open, onSetup, onSkip }: EncryptionSetupProps) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSetup = async () => {
    setError("");

    if (passphrase.length < 8) {
      setError("Passphrase must be at least 8 characters");
      return;
    }

    if (passphrase !== confirmPassphrase) {
      setError("Passphrases do not match");
      return;
    }

    setIsLoading(true);
    const success = await onSetup(passphrase);
    setIsLoading(false);

    if (!success) {
      setError("Failed to set up encryption");
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle>Enable End-to-End Encryption</DialogTitle>
              <DialogDescription>
                Signal-grade encryption for your messages
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              Your messages will be encrypted using <strong>X25519 + XSalsa20-Poly1305</strong> — 
              the same cryptography used by Signal. Only you and your recipients can read messages.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="passphrase">Encryption Passphrase</Label>
            <div className="relative">
              <Input
                id="passphrase"
                type={showPassphrase ? "text" : "password"}
                placeholder="Enter a strong passphrase"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="pr-10"
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

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm Passphrase</Label>
            <Input
              id="confirm"
              type={showPassphrase ? "text" : "password"}
              placeholder="Confirm your passphrase"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-amber-200">
              <strong>Important:</strong> This passphrase cannot be recovered. If you forget it, 
              you will lose access to your encrypted messages.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {onSkip && (
            <Button variant="ghost" onClick={onSkip} disabled={isLoading}>
              Skip for now
            </Button>
          )}
          <Button onClick={handleSetup} disabled={isLoading || !passphrase || !confirmPassphrase}>
            {isLoading ? "Setting up..." : "Enable Encryption"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
