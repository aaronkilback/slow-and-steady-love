import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { KeyRound, Eye, EyeOff, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CheckResult = {
  status: "safe" | "pwned";
  count?: number;
} | null;

async function sha1(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function checkPassword(password: string): Promise<CheckResult> {
  if (!password || password.length < 1) return null;

  const hash = await sha1(password);
  const prefix = hash.substring(0, 5);
  const suffix = hash.substring(5);

  const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { "Add-Padding": "true" },
  });

  if (!response.ok) throw new Error("HIBP API request failed");

  const text = await response.text();
  const lines = text.split("\n");

  for (const line of lines) {
    const [hashSuffix, count] = line.trim().split(":");
    if (hashSuffix === suffix) {
      const c = parseInt(count, 10);
      if (c > 0) return { status: "pwned", count: c };
    }
  }

  return { status: "safe" };
}

export function PasswordCheckCard() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<CheckResult>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = useCallback(async () => {
    if (!password.trim()) return;
    setIsChecking(true);
    setResult(null);
    setError(null);

    try {
      const r = await checkPassword(password);
      setResult(r);
    } catch {
      setError("Could not reach the breach database. Try again.");
    } finally {
      setIsChecking(false);
    }
  }, [password]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCheck();
  };

  return (
    <Card className="border-border bg-card/50">
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-2 bg-primary/10">
            <KeyRound className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">Check a Password</h3>
            <p className="text-[11px] text-muted-foreground">
              Uses k-anonymity — your password never leaves this device
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Enter a password to check…"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setResult(null);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              className="pr-10 text-sm"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button
            size="sm"
            onClick={handleCheck}
            disabled={!password.trim() || isChecking}
            className="shrink-0"
          >
            {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
          </Button>
        </div>

        <AnimatePresence mode="wait">
          {error && (
            <motion.p
              key="error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs text-destructive"
            >
              {error}
            </motion.p>
          )}

          {result?.status === "pwned" && (
            <motion.div
              key="pwned"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-2 rounded-lg bg-critical/10 p-3"
            >
              <ShieldAlert className="h-4 w-4 text-critical mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-critical">Password compromised</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This password appeared in{" "}
                  <span className="font-semibold text-foreground">
                    {result.count?.toLocaleString()}
                  </span>{" "}
                  data breaches. Change it immediately wherever it's used.
                </p>
              </div>
            </motion.div>
          )}

          {result?.status === "safe" && (
            <motion.div
              key="safe"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-2 rounded-lg bg-low/10 p-3"
            >
              <ShieldCheck className="h-4 w-4 text-low mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-low">Not found in breaches</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This password has not appeared in any known data breaches.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}
