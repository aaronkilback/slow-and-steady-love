const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let agentContext = '';
    try { const body = await req.json(); agentContext = body.agentContext || ''; } catch {}

    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        modalities: ['audio', 'text'],
        voice: 'ash', // Note: 'onyx' is not supported; 'ash' is the closest deep/authoritative voice
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        instructions: `You are AEGIS, an AI voice assistant. Be helpful and conversational.${agentContext ? `\n\nContext: ${agentContext}` : ''}`,
        input_audio_transcription: { model: 'whisper-1' },
        // iOS can get stuck in "speech_started" with noisy inputs; slightly higher threshold + shorter silence helps
        turn_detection: { type: 'server_vad', threshold: 0.65, prefix_padding_ms: 200, silence_duration_ms: 500, create_response: true }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: 'Failed to create session', details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const data = await response.json();
    return new Response(JSON.stringify({ client_secret: data.client_secret, session_id: data.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
