-- Create table for user travel itineraries
CREATE TABLE public.travel_itineraries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  trip_name TEXT NOT NULL,
  destination TEXT NOT NULL,
  departure_date DATE NOT NULL,
  return_date DATE,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for flights within itineraries
CREATE TABLE public.travel_flights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id UUID REFERENCES public.travel_itineraries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  flight_number TEXT NOT NULL,
  airline TEXT,
  departure_airport TEXT NOT NULL,
  arrival_airport TEXT NOT NULL,
  departure_time TIMESTAMP WITH TIME ZONE NOT NULL,
  arrival_time TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'delayed', 'cancelled', 'departed', 'arrived')),
  gate TEXT,
  terminal TEXT,
  last_checked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for travel alerts specific to user's destinations
CREATE TABLE public.travel_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  itinerary_id UUID REFERENCES public.travel_itineraries(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  category TEXT,
  location TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.travel_itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_flights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies for itineraries
CREATE POLICY "Users can view own itineraries"
ON public.travel_itineraries FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own itineraries"
ON public.travel_itineraries FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own itineraries"
ON public.travel_itineraries FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own itineraries"
ON public.travel_itineraries FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for flights
CREATE POLICY "Users can view own flights"
ON public.travel_flights FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own flights"
ON public.travel_flights FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own flights"
ON public.travel_flights FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own flights"
ON public.travel_flights FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for alerts
CREATE POLICY "Users can view own alerts"
ON public.travel_alerts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own alerts"
ON public.travel_alerts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own alerts"
ON public.travel_alerts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own alerts"
ON public.travel_alerts FOR DELETE
USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_travel_itineraries_updated_at
BEFORE UPDATE ON public.travel_itineraries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_travel_flights_updated_at
BEFORE UPDATE ON public.travel_flights
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();