import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface FlightResult {
  result: string;
  citations: string[];
  query: string;
  timestamp: string;
}

export function useFlightLookup() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<FlightResult | null>(null);

  const lookupFlight = useCallback(async (query: string): Promise<FlightResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("flight-lookup", {
        body: { query },
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setLastResult(data);
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to lookup flight";
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    lookupFlight,
    isLoading,
    error,
    lastResult,
  };
}
