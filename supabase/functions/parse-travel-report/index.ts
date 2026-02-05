import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParseReportRequest {
  content: string; // Text content extracted from PDF
  source?: string; // 'isos', 'control_risks', 'user_upload'
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const body: ParseReportRequest = await req.json();
    const { content, source = "user_upload" } = body;

    if (!content || content.trim().length < 100) {
      return new Response(
        JSON.stringify({ error: "Report content is required (minimum 100 characters)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the travel report content using AI
    const parsePrompt = `Analyze the following travel security briefing/report and extract structured information.

REPORT CONTENT:
${content.slice(0, 15000)}

Extract and return a JSON object with this exact structure:
{
  "title": "Report title or location name",
  "location": "City/Region name",
  "country": "Country name",
  "riskRating": "one of: insignificant, low, medium, high, extreme (normalize from any rating system)",
  "source": "${source}",
  "reportDate": "Date in YYYY-MM-DD format if found, or null",
  "keyRisks": ["Array of main risk categories mentioned"],
  "toplineAdvice": "Main travel recommendation summary",
  "emergencyContacts": {
    "police": "number if found",
    "ambulance": "number if found", 
    "assistanceCenter": "number if found"
  },
  "securityRisks": {
    "crime": "Summary of crime-related information",
    "roadSafety": "Summary of road/transport safety",
    "socialUnrest": "Summary of protest/political risks",
    "naturalHazards": "Summary of weather/natural disaster risks",
    "terrorism": "Summary of terrorism information",
    "health": "Summary of health risks if mentioned"
  },
  "transportation": "Transportation recommendations",
  "accommodation": "Accommodation recommendations",
  "areasOfConcern": ["Specific areas/neighborhoods mentioned as risky"],
  "latestDevelopments": "Current events or recent incidents mentioned",
  "generalAdvice": ["Array of specific security tips from the report"]
}

Extract real information from the document. Use null for fields not found in the report.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are an expert at parsing travel security reports from organizations like International SOS and Control Risks. Extract structured data accurately. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: parsePrompt,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI parsing error:", response.status, errorText);
      throw new Error(`AI parsing error: ${response.status}`);
    }

    const data = await response.json();
    const responseContent = data.choices?.[0]?.message?.content || "";

    // Extract JSON from the response
    let parsedReport;
    try {
      parsedReport = JSON.parse(responseContent);
    } catch {
      const jsonMatch = responseContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        parsedReport = JSON.parse(jsonMatch[1]);
      } else {
        const objectMatch = responseContent.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          parsedReport = JSON.parse(objectMatch[0]);
        } else {
          throw new Error("Could not parse report analysis");
        }
      }
    }

    return new Response(
      JSON.stringify({
        parsedReport,
        parsedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Parse travel report error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
