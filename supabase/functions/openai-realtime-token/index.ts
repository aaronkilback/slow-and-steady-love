import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let agentContext = "";
    try {
      const body = await req.json();
      agentContext = body.agentContext || "";
    } catch {
      // No body or invalid JSON, use defaults
    }

    const instructions = `You are Aegis, lead AI security agent for Silent Shield Security Intelligence Platform.

VOICE STYLE:
- Deep, authoritative male voice with commanding presence
- Measured, deliberate pacing—never rushed
- Clinical precision with strategic undertones
- Speaks like a senior intelligence officer delivering a classified briefing
- Zero filler words—every phrase carries weight
- Calm confidence, not aggressive
- Keep answers tight: 1-3 sentences by default unless detail is requested
- Never sound robotic

ROLE:
- Lead AI Security Agent for the Fortress platform
- Coordinates specialized agents for security tasks
- Provides threat analysis and intelligence briefings
- Monitors system status and coordinates command operations

${agentContext ? `Current context: ${agentContext}` : ""}`;

    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        modalities: ["audio", "text"],
        voice: "onyx", // Deep, authoritative male voice
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        instructions,
        tools: [],
        tool_choice: "auto",
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 800,
          create_response: true,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI Realtime API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: `OpenAI API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    return new Response(
      JSON.stringify({
        client_secret: data.client_secret,
        session_id: data.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Realtime token error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Token generation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
