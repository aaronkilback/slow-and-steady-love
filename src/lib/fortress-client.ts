import { createClient } from "@supabase/supabase-js";

// Fortress main platform Supabase connection
// This allows users to sign in with their existing Fortress accounts
const FORTRESS_SUPABASE_URL = "https://udbjjeppbgwjlqmaeftn.supabase.co";
const FORTRESS_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkYmpqZXBwYmd3amxxbWFlZnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzNDkwNjQsImV4cCI6MjA3NDkyNTA2NH0.4wtCRvIKYPcl8gQLSC86PoWvbVKFJPmRzOKDW9tV-Ec";

export const fortressClient = createClient(FORTRESS_SUPABASE_URL, FORTRESS_SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: localStorage,
    storageKey: 'fortress-auth-token',
  },
});
