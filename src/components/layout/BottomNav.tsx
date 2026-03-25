import { NavLink, useLocation } from "react-router-dom";
import { Radio, MessageSquare, User, Plane, Bot, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";

const navItems = [
  {
    path: "/signal",
    label: "Signal",
    icon: Radio,
  },
  {
    path: "/aegis",
    label: "Aegis",
    icon: Shield,
  },
  {
    path: "/messages",
    label: "Messages",
    icon: MessageSquare,
  },
  {
    path: "/agents",
    label: "Agents",
    icon: Bot,
  },
  {
    path: "/travel",
    label: "Travel",
    icon: Plane,
  },
  {
    path: "/profile",
    label: "Profile",
    icon: User,
  },
];

export function BottomNav() {
  const location = useLocation();
  const unreadMessages = useUnreadMessages();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path === "/signal" && location.pathname === "/");
          const badge = item.path === "/messages" && unreadMessages > 0 ? unreadMessages : null;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className="relative flex flex-1 flex-col items-center gap-1 py-2"
            >
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -top-2 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary glow-cyan-sm"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <div className="relative">
                <item.icon
                  className={cn(
                    "h-5 w-5 transition-colors duration-200",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                />
                {badge && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium transition-colors duration-200",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
