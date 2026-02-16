import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";

const PASSWORD_MAX_AGE_DAYS = 90;

export function PasswordExpiryBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [daysOverdue, setDaysOverdue] = useState(0);

  useEffect(() => {
    if (!user) return;

    const checkExpiry = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("password_changed_at")
        .eq("id", user.id)
        .single();

      if (!data?.password_changed_at) return;

      const changedAt = new Date(data.password_changed_at);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - changedAt.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays >= PASSWORD_MAX_AGE_DAYS) {
        setIsExpired(true);
        setDaysOverdue(diffDays - PASSWORD_MAX_AGE_DAYS);
      }
    };

    checkExpiry();
  }, [user]);

  if (!isExpired || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="bg-destructive/15 border-b border-destructive/30 px-4 py-2.5"
      >
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="flex-1 text-xs text-destructive">
            <span className="font-semibold">Password expired</span>
            {daysOverdue > 0 && ` (${daysOverdue}d overdue)`} — update it in{" "}
            <button
              onClick={() => navigate("/profile")}
              className="underline font-medium hover:text-destructive/80"
            >
              Security Settings
            </button>
          </p>
          <button
            onClick={() => setDismissed(true)}
            className="text-destructive/60 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
