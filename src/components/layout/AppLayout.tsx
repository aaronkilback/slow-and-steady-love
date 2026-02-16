import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { FloatingAegis } from "@/components/aegis/FloatingAegis";
import { useLocationTracking } from "@/hooks/useLocationTracking";
import { PasswordExpiryBanner } from "@/components/profile/PasswordExpiryBanner";

export function AppLayout() {
  const location = useLocation();
  useLocationTracking();
  
  // Don't show floating Aegis on the Aegis page itself
  const showFloatingAegis = location.pathname !== "/aegis";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PasswordExpiryBanner />
      {/* Main content area with safe area padding */}
      <main className="flex-1 overflow-auto pb-20 safe-area-top">
        <Outlet />
      </main>
      
      {/* Floating Aegis button (visible on all pages except /aegis) */}
      {showFloatingAegis && <FloatingAegis />}
      
      {/* Bottom navigation bar */}
      <BottomNav />
    </div>
  );
}
