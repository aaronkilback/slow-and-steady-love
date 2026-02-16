
-- Add password_changed_at to profiles
ALTER TABLE public.profiles
ADD COLUMN password_changed_at timestamp with time zone DEFAULT now();

-- Backfill existing rows
UPDATE public.profiles SET password_changed_at = now() WHERE password_changed_at IS NULL;
