import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, Shield, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fortressClient } from "@/lib/fortress-client";
import { useToast } from "@/hooks/use-toast";

const ACCEPT_INVITE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-operator-invite`;

/**
 * Public route — /invite/:tokenOrPin — for redeeming AEGIS Mobile
 * operator invites generated from AddOperatorsDialog. No auth required
 * to load the page; on submit, the accept-operator-invite function
 * creates the auth user, profile, conversation membership, and signs
 * the user in so they land in the app.
 */
export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [allowLocation, setAllowLocation] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Capture coords if the operator opts in. We don't gate the form on
  // it — location is best-effort for the future map view.
  useEffect(() => {
    if (!allowLocation || coords) return;
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setAllowLocation(false),
      { enableHighAccuracy: false, timeout: 6000 }
    );
  }, [allowLocation, coords]);

  const tokenLooksValid = useMemo(() => !!(token && token.length >= 6), [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const resp = await fetch(ACCEPT_INVITE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token,
          email: email.trim().toLowerCase(),
          password,
          name: name.trim(),
          phone: phone.trim() || undefined,
          latitude: coords?.lat,
          longitude: coords?.lng,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

      // Set session on fortressClient so subsequent queries are authed.
      if (data.access_token && data.refresh_token) {
        await fortressClient.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
      }

      toast({
        title: "Welcome aboard",
        description: data.conversation_id
          ? "You've been added to the conversation."
          : "Your account is ready.",
      });

      navigate(data.conversation_id ? "/messages" : "/signal", { replace: true });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not accept invite",
        description: err instanceof Error ? err.message : "Unknown error",
      });
      setIsSubmitting(false);
    }
  };

  if (!tokenLooksValid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid invite link</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This invite link is malformed. Ask the operator who invited you to send a new one.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background safe-area-top safe-area-bottom">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <CardTitle>Join AEGIS Mobile</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Set up your account to be added to the conversation. This invite is single-use and
            expires shortly.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Display name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sarah Chen"
                required
                autoComplete="name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Phone (optional)</label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 555 5555"
                autoComplete="tel"
              />
            </div>

            <label className="flex items-start gap-2 text-xs text-muted-foreground rounded-md border border-border bg-card/40 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={allowLocation}
                onChange={(e) => setAllowLocation(e.target.checked)}
                className="mt-0.5"
              />
              <span className="flex-1">
                <span className="flex items-center gap-1 font-medium text-foreground mb-0.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Share approximate location with my team
                </span>
                Used to plot operators on the team map. Can be turned off later in profile.
                {coords && (
                  <span className="block text-[10px] mt-1 text-low">
                    Captured ({coords.lat.toFixed(3)}, {coords.lng.toFixed(3)})
                  </span>
                )}
              </span>
            </label>

            <Button type="submit" disabled={isSubmitting} className="w-full mt-2">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Accept invite & sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
