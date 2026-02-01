import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Download, Shield, Smartphone, Check, Share, Plus, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    // Check if iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    // Listen for install prompt (Android/Desktop)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background p-6 safe-area-top safe-area-bottom">
      <div className="max-w-md mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <div className="flex justify-center">
            <div className="h-24 w-24 rounded-2xl bg-primary/20 flex items-center justify-center glow-cyan">
              <Shield className="h-12 w-12 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Fortress</h1>
          <p className="text-muted-foreground">
            Silent Shield Security Intelligence Platform
          </p>
        </motion.div>

        {/* Status */}
        {isInstalled ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card className="p-6 border-emerald-500/50 bg-emerald-500/10">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Check className="h-6 w-6 text-emerald-500" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">App Installed</h2>
                  <p className="text-sm text-muted-foreground">
                    Fortress is ready on your home screen
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-4"
          >
            {/* Android/Desktop - Direct install button */}
            {deferredPrompt && (
              <Button
                size="lg"
                className="w-full gap-2 h-14 text-lg"
                onClick={handleInstall}
              >
                <Download className="h-5 w-5" />
                Install Fortress
              </Button>
            )}

            {/* iOS Instructions */}
            {isIOS && !deferredPrompt && (
              <Card className="p-6 space-y-4">
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Install on iPhone/iPad
                </h2>
                <ol className="space-y-4 text-sm">
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      1
                    </span>
                    <span className="text-muted-foreground">
                      Tap the <Share className="inline h-4 w-4 mx-1" /> <strong>Share</strong> button in Safari
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      2
                    </span>
                    <span className="text-muted-foreground">
                      Scroll down and tap <Plus className="inline h-4 w-4 mx-1" /> <strong>Add to Home Screen</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      3
                    </span>
                    <span className="text-muted-foreground">
                      Tap <strong>Add</strong> to confirm
                    </span>
                  </li>
                </ol>
              </Card>
            )}

            {/* Android fallback instructions */}
            {!isIOS && !deferredPrompt && (
              <Card className="p-6 space-y-4">
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Install on Android
                </h2>
                <ol className="space-y-4 text-sm">
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      1
                    </span>
                    <span className="text-muted-foreground">
                      Tap the <MoreVertical className="inline h-4 w-4 mx-1" /> <strong>menu</strong> in your browser
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      2
                    </span>
                    <span className="text-muted-foreground">
                      Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      3
                    </span>
                    <span className="text-muted-foreground">
                      Tap <strong>Install</strong> to confirm
                    </span>
                  </li>
                </ol>
              </Card>
            )}
          </motion.div>
        )}

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-3"
        >
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            App Features
          </h3>
          <div className="grid gap-3">
            {[
              "Works offline — access critical data anytime",
              "Fast loading — opens instantly like a native app",
              "Secure — end-to-end encrypted communications",
              "Real-time — instant alerts and notifications",
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span className="text-muted-foreground">{feature}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
