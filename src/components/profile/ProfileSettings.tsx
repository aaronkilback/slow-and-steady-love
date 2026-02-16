import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { User, Bell, Shield, LogOut, ChevronRight, Moon, Volume2, Fingerprint, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { fortressClient } from "@/lib/fortress-client";
import { useToast } from "@/hooks/use-toast";
import { MuteSettings } from "./MuteSettings";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { useAuth } from "@/components/auth/AuthProvider";

interface SettingItemProps {
  icon: React.ElementType;
  label: string;
  description?: string;
  action?: React.ReactNode;
  onClick?: () => void;
}

function SettingItem({ icon: Icon, label, description, action, onClick }: SettingItemProps) {
  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 py-3 px-1",
        onClick && "cursor-pointer"
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action || (onClick && <ChevronRight className="h-5 w-5 text-muted-foreground" />)}
    </motion.div>
  );
}

export function ProfileSettings() {
  const [pushNotifications, setPushNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Get user metadata from Fortress auth
  const userEmail = user?.email || "";
  const displayName = user?.user_metadata?.full_name || 
                      user?.user_metadata?.name || 
                      user?.email?.split("@")[0] || 
                      "Operator";
  const avatarUrl = user?.user_metadata?.avatar_url || null;

  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    setIsLoggingOut(true);
    const { error } = await fortressClient.auth.signOut();
    
    if (error) {
      toast({
        variant: "destructive",
        title: "Logout failed",
        description: error.message,
      });
      setIsLoggingOut(false);
    } else {
      navigate("/auth", { replace: true });
    }
  };

  return (
    <ScrollArea className="flex-1 px-4 py-4">
      <div className="space-y-6 pb-4">
        {/* Profile Card */}
        <Card className="p-4 border-border bg-card">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-primary">
              <AvatarImage src={avatarUrl || undefined} />
              <AvatarFallback className="bg-primary/20 text-primary text-lg">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-foreground">{displayName}</h2>
              <p className="text-sm text-primary">Fortress Operator</p>
              <p className="text-xs text-muted-foreground">{userEmail}</p>
            </div>
          </div>
        </Card>

        {/* Mute Schedule */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            Do Not Disturb
          </h3>
          <MuteSettings />
        </div>

        {/* Notifications Section */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            Notifications
          </h3>
          <Card className="divide-y divide-border border-border bg-card">
            <div className="px-3">
              <SettingItem
                icon={Bell}
                label="Push Notifications"
                description="Receive alerts for critical events"
                action={
                  <Switch
                    checked={pushNotifications}
                    onCheckedChange={setPushNotifications}
                  />
                }
              />
            </div>
            <div className="px-3">
              <SettingItem
                icon={Volume2}
                label="Sound Effects"
                description="Audio feedback for notifications"
                action={
                  <Switch
                    checked={soundEnabled}
                    onCheckedChange={setSoundEnabled}
                  />
                }
              />
            </div>
          </Card>
        </div>

        {/* Security Section */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            Security
          </h3>
          <div className="space-y-3">
            <ChangePasswordForm />
            <Card className="divide-y divide-border border-border bg-card">
              <div className="px-3">
                <SettingItem
                  icon={Fingerprint}
                  label="Biometric Login"
                  description="Use fingerprint or face ID"
                  action={
                    <Switch
                      checked={biometricEnabled}
                      onCheckedChange={setBiometricEnabled}
                    />
                  }
                />
              </div>
            </Card>
          </div>
        </div>

        {/* App Section */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            App
          </h3>
          <Card className="divide-y divide-border border-border bg-card">
            <div className="px-3">
              <SettingItem
                icon={Moon}
                label="Appearance"
                description="Dark mode is always enabled"
                action={
                  <span className="text-xs text-muted-foreground">Dark</span>
                }
              />
            </div>
            <div className="px-3">
              <SettingItem
                icon={User}
                label="Account Settings"
                onClick={() => {}}
              />
            </div>
          </Card>
        </div>

        {/* Logout */}
        <Button
          variant="destructive"
          className="w-full"
          onClick={handleLogout}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <LogOut className="h-4 w-4 mr-2" />
          )}
          Sign Out
        </Button>

        {/* Version */}
        <p className="text-center text-xs text-muted-foreground">
          Fortress Mobile v1.0.0
        </p>
      </div>
    </ScrollArea>
  );
}
