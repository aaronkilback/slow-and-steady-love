import { createClient } from "@supabase/supabase-js";

// Fortress main platform Supabase connection
// This allows users to sign in with their existing Fortress accounts
const FORTRESS_SUPABASE_URL = "https://kpuqukppbmwebiptqmog.supabase.co";
const FORTRESS_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwdXF1a3BwYm13ZWJpcHRxbW9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NjMwMjAsImV4cCI6MjA4ODIzOTAyMH0.x36k-kAUtPXmmZloojPc0-b1sd67d7-5pBOViN0EmXc";

export const fortressClient = createClient(FORTRESS_SUPABASE_URL, FORTRESS_SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: localStorage,
    storageKey: 'fortress-auth-token',
  },
});
