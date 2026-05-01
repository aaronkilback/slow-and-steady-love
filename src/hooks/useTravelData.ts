import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthProvider";

export interface TravelItinerary {
  id: string;
  user_id: string;
  trip_name: string;
  destination: string;
  departure_date: string;
  return_date: string | null;
  status: "upcoming" | "active" | "completed" | "cancelled";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TravelFlight {
  id: string;
  itinerary_id: string | null;
  user_id: string;
  flight_number: string;
  airline: string | null;
  reservation_code: string | null;
  departure_airport: string;
  arrival_airport: string;
  departure_time: string;
  arrival_time: string | null;
  status: "scheduled" | "delayed" | "cancelled" | "departed" | "arrived";
  gate: string | null;
  terminal: string | null;
  delay_minutes: number;
  delay_reason: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TravelAlert {
  id: string;
  user_id: string;
  itinerary_id: string | null;
  title: string;
  description: string | null;
  severity: "info" | "warning" | "critical";
  category: string | null;
  location: string | null;
  is_read: boolean;
  created_at: string;
}

export function useTravelItineraries() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data: itineraries = [], isLoading, error, refetch } = useQuery({
    queryKey: ["travel-itineraries", userId],
    enabled: !!userId,
    queryFn: async () => {
      // Travel rows live on this project's Supabase but auth lives on
      // Fortress, so we cannot rely on auth.uid() in RLS — scope by the
      // resolved Fortress user_id explicitly. RLS is "allow all" on
      // these tables; this filter is what actually keeps users from
      // seeing each other's itineraries.
      const { data, error } = await supabase
        .from("travel_itineraries")
        .select("*")
        .eq("user_id", userId!)
        .order("departure_date", { ascending: true });

      if (error) throw error;
      return data as TravelItinerary[];
    },
  });

  const createItinerary = useMutation({
    mutationFn: async (params: {
      trip_name: string;
      destination: string;
      departure_date: string;
      return_date?: string;
      notes?: string;
    }) => {
      if (!userId) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("travel_itineraries")
        .insert({
          user_id: userId,
          ...params,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["travel-itineraries"] });
      toast.success("Trip added");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateItinerary = useMutation({
    mutationFn: async (params: { id: string; updates: Partial<TravelItinerary> }) => {
      const { data, error } = await supabase
        .from("travel_itineraries")
        .update(params.updates)
        .eq("id", params.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["travel-itineraries"] });
      toast.success("Trip updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteItinerary = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("travel_itineraries")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["travel-itineraries"] });
      toast.success("Trip deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return {
    itineraries,
    isLoading,
    error,
    refetch,
    createItinerary: createItinerary.mutateAsync,
    updateItinerary: updateItinerary.mutateAsync,
    deleteItinerary: deleteItinerary.mutateAsync,
    isCreating: createItinerary.isPending,
  };
}

export function useTravelFlights(itineraryId?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data: flights = [], isLoading, error, refetch } = useQuery({
    queryKey: ["travel-flights", userId, itineraryId],
    enabled: !!userId,
    queryFn: async () => {
      let query = supabase
        .from("travel_flights")
        .select("*")
        .eq("user_id", userId!)
        .order("departure_time", { ascending: true });

      if (itineraryId) {
        query = query.eq("itinerary_id", itineraryId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as TravelFlight[];
    },
  });

  const addFlight = useMutation({
    mutationFn: async (params: {
      flight_number: string;
      airline?: string;
      reservation_code?: string;
      departure_airport: string;
      arrival_airport: string;
      departure_time: string;
      arrival_time?: string;
      itinerary_id?: string;
    }) => {
      if (!userId) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("travel_flights")
        .insert({
          user_id: userId,
          ...params,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["travel-flights"] });
      toast.success("Flight added");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateFlight = useMutation({
    mutationFn: async (params: { id: string; updates: Partial<TravelFlight> }) => {
      const { data, error } = await supabase
        .from("travel_flights")
        .update(params.updates)
        .eq("id", params.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["travel-flights"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteFlight = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("travel_flights")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["travel-flights"] });
      toast.success("Flight removed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Check flight status using edge function
  const checkFlightStatus = useCallback(async (flightNumber: string) => {
    const { data, error } = await supabase.functions.invoke("flight-lookup", {
      body: { query: `${flightNumber} flight status today` },
    });

    if (error) throw error;
    return data;
  }, []);

  return {
    flights,
    isLoading,
    error,
    refetch,
    addFlight: addFlight.mutateAsync,
    updateFlight: updateFlight.mutateAsync,
    deleteFlight: deleteFlight.mutateAsync,
    checkFlightStatus,
    isAdding: addFlight.isPending,
  };
}

export function useTravelAlerts() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data: alerts = [], isLoading, error, refetch } = useQuery({
    queryKey: ["travel-alerts", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("travel_alerts")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as TravelAlert[];
    },
  });

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("travel_alerts")
        .update({ is_read: true })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["travel-alerts"] });
    },
  });

  const unreadCount = alerts.filter((a) => !a.is_read).length;

  return {
    alerts,
    isLoading,
    error,
    refetch,
    markAsRead: markAsRead.mutateAsync,
    unreadCount,
  };
}
