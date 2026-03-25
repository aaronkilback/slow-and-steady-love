import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "lastVisitedMessages";

export function useUnreadMessages(): number {
  const [unreadCount, setUnreadCount] = useState(0);
  const location = useLocation();

  // When user visits /messages, record the timestamp and clear the badge
  useEffect(() => {
    if (location.pathname === "/messages") {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
      setUnreadCount(0);
    }
  }, [location.pathname]);

  // Fetch initial unread count and subscribe to new messages
  useEffect(() => {
    if (location.pathname === "/messages") return;

    const lastVisited = localStorage.getItem(STORAGE_KEY);

    const fetchUnread = async () => {
      if (!lastVisited) return;
      const { count } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .gt("updated_at", lastVisited);
      setUnreadCount(count ?? 0);
    };

    fetchUnread();

    const channel = supabase
      .channel("nav-unread-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [location.pathname]);

  return unreadCount;
}
