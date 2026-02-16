
-- Fix travel_flights RLS
DROP POLICY IF EXISTS "Users can view own flights" ON public.travel_flights;
DROP POLICY IF EXISTS "Users can create own flights" ON public.travel_flights;
DROP POLICY IF EXISTS "Users can update own flights" ON public.travel_flights;
DROP POLICY IF EXISTS "Users can delete own flights" ON public.travel_flights;

CREATE POLICY "Allow all select on travel_flights" ON public.travel_flights FOR SELECT USING (true);
CREATE POLICY "Allow all insert on travel_flights" ON public.travel_flights FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update on travel_flights" ON public.travel_flights FOR UPDATE USING (true);
CREATE POLICY "Allow all delete on travel_flights" ON public.travel_flights FOR DELETE USING (true);

-- Fix travel_itineraries RLS
DROP POLICY IF EXISTS "Users can view own itineraries" ON public.travel_itineraries;
DROP POLICY IF EXISTS "Users can create own itineraries" ON public.travel_itineraries;
DROP POLICY IF EXISTS "Users can update own itineraries" ON public.travel_itineraries;
DROP POLICY IF EXISTS "Users can delete own itineraries" ON public.travel_itineraries;

CREATE POLICY "Allow all select on travel_itineraries" ON public.travel_itineraries FOR SELECT USING (true);
CREATE POLICY "Allow all insert on travel_itineraries" ON public.travel_itineraries FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update on travel_itineraries" ON public.travel_itineraries FOR UPDATE USING (true);
CREATE POLICY "Allow all delete on travel_itineraries" ON public.travel_itineraries FOR DELETE USING (true);

-- Fix travel_alerts RLS
DROP POLICY IF EXISTS "Users can view own alerts" ON public.travel_alerts;
DROP POLICY IF EXISTS "Users can create own alerts" ON public.travel_alerts;
DROP POLICY IF EXISTS "Users can update own alerts" ON public.travel_alerts;
DROP POLICY IF EXISTS "Users can delete own alerts" ON public.travel_alerts;

CREATE POLICY "Allow all select on travel_alerts" ON public.travel_alerts FOR SELECT USING (true);
CREATE POLICY "Allow all insert on travel_alerts" ON public.travel_alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update on travel_alerts" ON public.travel_alerts FOR UPDATE USING (true);
CREATE POLICY "Allow all delete on travel_alerts" ON public.travel_alerts FOR DELETE USING (true);
