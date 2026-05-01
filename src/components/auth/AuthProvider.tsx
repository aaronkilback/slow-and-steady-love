import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { fortressClient } from "@/lib/fortress-client";
import { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  /** Set when the initial auth probe failed to reach Supabase. */
  authError: string | null;
  /** Manual retry — attempts to fetch the session again. */
  retryAuth: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  authError: null,
  retryAuth: () => {},
});

export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps {
  children: ReactNode;
}

// If Supabase auth doesn't respond within this window, surface an error
// instead of leaving the app stuck on the spinner. Supabase had a real
// platform incident on 2026-05-01 where /auth/v1 returned 522/525 for
// several minutes — without this guard the PWA hung indefinitely.
const AUTH_PROBE_TIMEOUT_MS = 8000;

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [probeId, setProbeId] = useState(0); // bump to force a re-probe

  const retryAuth = useCallback(() => {
    setAuthError(null);
    setIsLoading(true);
    setProbeId((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const { data: { subscription } } = fortressClient.auth.onAuthStateChange(
      (_event, session) => {
        if (cancelled) return;
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
        setAuthError(null);
      }
    );

    timeoutId = setTimeout(() => {
      if (cancelled) return;
      // If we still haven't resolved by here, Supabase auth is unreachable.
      setIsLoading(false);
      setAuthError("Could not reach the Fortress authentication service.");
    }, AUTH_PROBE_TIMEOUT_MS);

    fortressClient.auth.getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return;
        if (timeoutId) clearTimeout(timeoutId);
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
        setAuthError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (timeoutId) clearTimeout(timeoutId);
        setIsLoading(false);
        setAuthError(err?.message || "Authentication probe failed.");
      });

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [probeId]);

  return (
    <AuthContext.Provider value={{ user, session, isLoading, authError, retryAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading, authError, retryAuth } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user && !authError) {
      navigate("/auth", { replace: true });
    }
  }, [user, isLoading, authError, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Connecting to Fortress...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 safe-area-top safe-area-bottom">
        <div className="flex flex-col items-center gap-4 max-w-sm text-center">
          <div className="h-10 w-10 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-500 text-2xl">!</div>
          <div className="space-y-1">
            <p className="font-medium">Cannot reach Fortress</p>
            <p className="text-xs text-muted-foreground">{authError}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Usually a transient Supabase platform incident. Check{" "}
              <a className="underline" href="https://status.supabase.com" target="_blank" rel="noreferrer">
                status.supabase.com
              </a>
              .
            </p>
          </div>
          <button
            onClick={retryAuth}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
