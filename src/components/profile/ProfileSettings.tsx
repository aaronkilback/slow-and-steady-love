import { useState } from "react";
import { motion } from "framer-motion";
import { User, Bell, Shield, LogOut, ChevronRight, Moon, Volume2, Fingerprint } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

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

  // Mock user data - will be replaced with auth data
  const user = {
    name: "Operator Alpha",
    email: "operator@silentshield.com",
    role: "Security Analyst",
    avatar: null,
  };

  const handleLogout = () => {
    // TODO: Implement logout with Supabase auth
    console.log("Logging out...");
  };

  return (
    <ScrollArea className="flex-1 px-4 py-4">
      <div className="space-y-6 pb-4">
        {/* Profile Card */}
        <Card className="p-4 border-border bg-card">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-primary">
              <AvatarImage src={user.avatar || undefined} />
              <AvatarFallback className="bg-primary/20 text-primary text-lg">
                {user.name.split(" ").map(n => n[0]).join("")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-foreground">{user.name}</h2>
              <p className="text-sm text-primary">{user.role}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </Card>

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
            <div className="px-3">
              <SettingItem
                icon={Shield}
                label="Security Settings"
                description="Password, 2FA, and sessions"
                onClick={() => {}}
              />
            </div>
          </Card>
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
        >
          <LogOut className="h-4 w-4 mr-2" />
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
