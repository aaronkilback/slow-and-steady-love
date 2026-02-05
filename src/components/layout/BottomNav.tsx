import { NavLink, useLocation } from "react-router-dom";
import { Radio, MessageCircle, Users, User, Plane } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const navItems = [
  {
    path: "/signal",
    label: "Signal",
    icon: Radio,
  },
  {
    path: "/aegis",
    label: "Aegis",
    icon: MessageCircle,
  },
  {
    path: "/travel",
    label: "Travel",
    icon: Plane,
  },
  {
    path: "/agents",
    label: "Agents",
    icon: Users,
  },
  {
    path: "/profile",
    label: "Profile",
    icon: User,
  },
];

export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path === "/signal" && location.pathname === "/");
          
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
              <item.icon
                className={cn(
                  "h-6 w-6 transition-colors duration-200",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              />
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
