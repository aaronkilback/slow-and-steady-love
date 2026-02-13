import { useState, useEffect, useCallback, useRef } from "react";
import { fortressClient } from "@/lib/fortress-client";

export interface CommsContact {
  contact_identifier: string;
  contact_name: string | null;
  channel: string;
  last_message: string | null;
  last_timestamp: string | null;
  message_count: number;
  investigators: string[];
}

export interface Communication {
  id: string;
  investigator_user_id: string;
  contact_identifier: string;
  contact_name: string | null;
  channel: string;
  direction: "inbound" | "outbound";
  message_body: string;
  message_timestamp: string;
  provider_status: string | null;
}

interface CommsListResponse {
  communications: Communication[];
  contacts: CommsContact[];
  total: number;
}

interface SendSmsResponse {
  success: boolean;
  message_sid: string;
  communication_id: string;
  entry_id: string;
  investigation_file_number: string;
}

export function useCommsData(investigationId: string | null) {
  const [contacts, setContacts] = useState<CommsContact[]>([]);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchComms = useCallback(async () => {
    if (!investigationId) return;

    // Use direct fetch for GET with query params (functions.invoke doesn't support query params well)
    const session = await fortressClient.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setError("Not authenticated");
      return;
    }

    const url = `https://udbjjeppbgwjlqmaeftn.supabase.co/functions/v1/list-communications?investigation_id=${encodeURIComponent(investigationId)}`;

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkYmpqZXBwYmd3amxxbWFlZnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzNDkwNjQsImV4cCI6MjA3NDkyNTA2NH0.4wtCRvIKYPcl8gQLSC86PoWvbVKFJPmRzOKDW9tV-Ec",
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const result: CommsListResponse = await res.json();
      setContacts(
        (result.contacts || []).sort((a, b) => {
          const ta = a.last_timestamp ? new Date(a.last_timestamp).getTime() : 0;
          const tb = b.last_timestamp ? new Date(b.last_timestamp).getTime() : 0;
          return tb - ta;
        })
      );
      setCommunications(result.communications || []);
      setTotal(result.total || 0);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to fetch communications";
      setError(msg);
      console.error("[useCommsData] fetch error:", msg);
    }
  }, [investigationId]);

  const loadComms = useCallback(async () => {
    setIsLoading(true);
    await fetchComms();
    setIsLoading(false);
  }, [fetchComms]);

  // Initial load
  useEffect(() => {
    if (investigationId) {
      loadComms();
    } else {
      setContacts([]);
      setCommunications([]);
      setTotal(0);
    }
  }, [investigationId, loadComms]);

  // Start/stop polling
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      fetchComms();
    }, 15000);
  }, [fetchComms]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const sendSms = useCallback(
    async (toNumber: string, message: string, contactName?: string) => {
      if (!investigationId) throw new Error("No investigation selected");

      const session = await fortressClient.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const url = `https://udbjjeppbgwjlqmaeftn.supabase.co/functions/v1/send-sms`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkYmpqZXBwYmd3amxxbWFlZnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzNDkwNjQsImV4cCI6MjA3NDkyNTA2NH0.4wtCRvIKYPcl8gQLSC86PoWvbVKFJPmRzOKDW9tV-Ec",
        },
        body: JSON.stringify({
          investigation_id: investigationId,
          to_number: toNumber,
          message,
          ...(contactName ? { contact_name: contactName } : {}),
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const result: SendSmsResponse = await res.json();

      // Refresh after send
      await fetchComms();

      return result;
    },
    [investigationId, fetchComms]
  );

  return {
    contacts,
    communications,
    total,
    isLoading,
    error,
    refresh: loadComms,
    sendSms,
    startPolling,
    stopPolling,
  };
}
