-- Add public_key column to profiles for E2E encryption
ALTER TABLE public.profiles 
ADD COLUMN public_key TEXT,
ADD COLUMN key_salt TEXT;

-- Add encrypted flag to messages
ALTER TABLE public.messages 
ADD COLUMN encrypted BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN nonce TEXT;