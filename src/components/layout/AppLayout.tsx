import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { FloatingAegis } from "@/components/aegis/FloatingAegis";
import { useLocationTracking } from "@/hooks/useLocationTracking";
import { PasswordExpiryBanner } from "@/components/profile/PasswordExpiryBanner";

export function AppLayout() {
  const location = useLocation();
  useLocationTracking();
  
  // Don't show floating Aegis on pages that have their own bottom-anchored
  // input bar — the floating button overlaps the send button on those
  // pages (Messages conversations, Aegis chat, Comms SMS thread, the
  // active SOS view, and Agent chats). Operators can still reach Aegis
  // via the bottom nav tab on every page.
  const noFloatPaths = ["/aegis", "/messages", "/comms", "/sos"];
  const showFloatingAegis =
    !noFloatPaths.includes(location.pathname) &&
    !location.pathname.startsWith("/agent/");

  return (
    <div className="flex h-[100dvh] flex-col bg-background overflow-hidden">
      <PasswordExpiryBanner />
      {/*
        Main content area. h-[100dvh] on the parent + flex-1 + min-h-0 here
        gives the child page (Outlet) an EXACT remaining-height to size
        against — no more relying on calc(100vh-5rem) inside each page,
        which broke on iOS once safe-area-inset-bottom was added to the
        nav. Pages should use h-full (and min-h-0 if they nest scroll
        containers) instead of viewport math.
      */}
      <main
        className="flex-1 min-h-0 overflow-auto safe-area-top"
        style={{
          paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <Outlet />
      </main>

      {/* Floating Aegis button (visible on all pages except /aegis) */}
      {showFloatingAegis && <FloatingAegis />}

      {/* Bottom navigation bar */}
      <BottomNav />
    </div>
  );
}
