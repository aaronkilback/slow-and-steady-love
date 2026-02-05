import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TravelBriefingRequest {
  location: string;
  country: string;
  travelDates?: string;
  purpose?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_API_KEY) {
      throw new Error("PERPLEXITY_API_KEY is not configured");
    }

    const body: TravelBriefingRequest = await req.json();
    const { location, country, travelDates, purpose } = body;

    if (!location || !country) {
      return new Response(
        JSON.stringify({ error: "Location and country are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const dateContext = travelDates ? `for travel dates: ${travelDates}` : `as of ${today}`;
    const purposeContext = purpose ? `Purpose: ${purpose}.` : "";

    // Comprehensive travel risk analysis prompt in ISOS/Control Risks style
    const analysisPrompt = `Generate a comprehensive travel security briefing for ${location}, ${country} ${dateContext}. ${purposeContext}

Structure the response as a JSON object with the following exact format:
{
  "location": "${location}, ${country}",
  "riskRating": "one of: insignificant, low, medium, high, extreme",
  "keyRisks": ["array of 3-6 key security risk categories like Crime, Road Safety, Terrorism, etc."],
  "toplineAdvice": "One sentence summary of travel advice",
  "latestDevelopments": "2-3 paragraphs on current security situation, recent incidents, upcoming events",
  "emergencyContacts": {
    "police": "emergency number",
    "ambulance": "emergency number",
    "localEmergency": "local emergency number if different"
  },
  "securityRisks": {
    "crime": "Detailed paragraph on crime situation, types, hotspots, and advice",
    "roadSafety": "Paragraph on driving conditions, traffic, and advice",
    "socialUnrest": "Paragraph on protest activity, political situation, and advice",
    "naturalHazards": "Paragraph on weather, earthquakes, flooding risks and advice",
    "terrorism": "Paragraph on terrorism threat level and advice",
    "health": "Paragraph on health risks, disease, medical facilities"
  },
  "transportation": "Paragraph on safe transportation options, recommendations, ride-hailing apps",
  "accommodation": "Paragraph on accommodation recommendations, security features to look for",
  "areasOfConcern": ["Array of specific neighborhoods or areas to avoid or exercise caution"],
  "generalAdvice": ["Array of 5-8 specific actionable security tips"]
}

Use current, real-world intelligence. Include specific details about recent events, local conditions, and actionable recommendations. Be thorough but practical.`;

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          {
            role: "system",
            content: "You are a travel security analyst providing professional security briefings similar to International SOS and Control Risks. Always respond with valid JSON matching the requested schema. Be thorough, current, and actionable.",
          },
          {
            role: "user",
            content: analysisPrompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Perplexity API error:", response.status, errorText);
      throw new Error(`Perplexity API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const citations = data.citations || [];

    // Extract JSON from the response
    let briefing;
    try {
      // Try to parse directly
      briefing = JSON.parse(content);
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        briefing = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find JSON object in the text
        const objectMatch = content.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          briefing = JSON.parse(objectMatch[0]);
        } else {
          throw new Error("Could not parse briefing response");
        }
      }
    }

    return new Response(
      JSON.stringify({
        briefing,
        citations,
        generatedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generate travel briefing error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
