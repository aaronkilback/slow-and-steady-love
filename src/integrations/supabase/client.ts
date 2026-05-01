// Originally generated, now hand-edited to share an auth session with
// fortressClient.
//
// Both clients point at the same Fortress project (kpuqukppbmwebiptqmog).
// Without an explicit storageKey they used different localStorage keys
// for their auth tokens — sign-in via fortressClient wrote to
// 'fortress-auth-token' while `supabase` looked at the default
// 'sb-kpuqukppbmwebiptqmog-auth-token'. Result: every supabase.from /
// supabase.rpc call ran anonymously, RLS rejected writes, and UI
// actions appeared to silently no-op (the Solo Desk button bug).
//
// Pinning the same storageKey makes the two clients share one session.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'fortress-auth-token',
  }
});