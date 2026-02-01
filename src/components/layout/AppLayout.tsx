import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Main content area with safe area padding */}
      <main className="flex-1 overflow-auto pb-20 safe-area-top">
        <Outlet />
      </main>
      
      {/* Bottom navigation bar */}
      <BottomNav />
    </div>
  );
}
