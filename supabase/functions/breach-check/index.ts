import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // HaveIBeenPwned v3 API — breachedaccount endpoint
    // This endpoint is rate-limited but free for individual lookups
    const encodedEmail = encodeURIComponent(email.trim().toLowerCase());
    const response = await fetch(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodedEmail}?truncateResponse=false`,
      {
        headers: {
          "hibp-api-key": Deno.env.get("HIBP_API_KEY") || "",
          "User-Agent": "FortressApp",
        },
      }
    );

    if (response.status === 404) {
      // No breaches found — this is good news
      return new Response(
        JSON.stringify({ breaches: [], message: "No breaches found for this email." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (response.status === 401) {
      return new Response(
        JSON.stringify({ error: "HIBP API key not configured or invalid." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (response.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limited. Please try again in a few seconds." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `HIBP API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const breaches = await response.json();

    // Map to clean, factual breach data — no fabrication
    const findings = breaches.map((breach: any) => ({
      name: breach.Name,
      title: breach.Title,
      domain: breach.Domain,
      breach_date: breach.BreachDate,
      added_date: breach.AddedDate,
      pwn_count: breach.PwnCount,
      description: breach.Description,
      data_classes: breach.DataClasses, // e.g. ["Email addresses", "Passwords"]
      is_verified: breach.IsVerified,
      is_sensitive: breach.IsSensitive,
      logo_path: breach.LogoPath,
    }));

    return new Response(
      JSON.stringify({
        breaches: findings,
        total: findings.length,
        checked_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Breach check error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to check breaches" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
