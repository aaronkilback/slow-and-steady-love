
-- Add reservation_code and delay tracking columns to travel_flights
ALTER TABLE public.travel_flights
ADD COLUMN reservation_code text,
ADD COLUMN delay_minutes integer DEFAULT 0,
ADD COLUMN delay_reason text;
