import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseOpenAIRealtimeOptions {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAgentResponse?: (text: string) => void;
  onAgentResponseComplete?: (fullText: string) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: 'idle' | 'connecting' | 'connected' | 'speaking' | 'listening' | 'thinking') => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  agentContext?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

export function useOpenAIRealtime(options: UseOpenAIRealtimeOptions = {}) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'speaking' | 'listening' | 'thinking'>('idle');
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [agentResponse, setAgentResponse] = useState('');
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const greetTimeoutRef = useRef<number | null>(null);
  const responseFallbackRef = useRef<number | null>(null);
  const userHasSpokenRef = useRef(false);
  const greetedRef = useRef(false);
  
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; }, [options]);

  const updateStatus = useCallback((newStatus: typeof status) => {
    setStatus(newStatus);
    optionsRef.current.onStatusChange?.(newStatus);
  }, []);

  const executeToolCall = useCallback(async (callId: string, toolName: string, toolArgs: Record<string, unknown>) => {
    console.log(`[Voice] Executing tool: ${toolName}`, toolArgs);
    updateStatus('thinking');
    optionsRef.current.onToolCall?.(toolName, toolArgs);
    
    try {
      const { data, error } = await supabase.functions.invoke('voice-tool-executor', {
        body: { tool_name: toolName, arguments: toolArgs }
      });
      if (error) throw error;
      const resultStr = JSON.stringify(data?.result || { error: 'No result' });
      
      if (dcRef.current?.readyState === 'open') {
        dcRef.current.send(JSON.stringify({
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id: callId, output: resultStr }
        }));
        await new Promise(resolve => setTimeout(resolve, 100));
        dcRef.current.send(JSON.stringify({ type: 'response.create' }));
      }
    } catch (err) {
      console.error('[Voice] Tool execution error:', err);
      if (dcRef.current?.readyState === 'open') {
        dcRef.current.send(JSON.stringify({
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id: callId, output: JSON.stringify({ error: 'Tool execution failed' }) }
        }));
        dcRef.current.send(JSON.stringify({ type: 'response.create' }));
      }
    }
  }, [updateStatus]);

  const handleRealtimeEvent = useCallback((event: Record<string, unknown>) => {
    console.log('Realtime event:', event.type, event);
    switch (event.type) {
      case 'session.created':
      case 'session.updated':
        break;
      case 'input_audio_buffer.speech_started':
        userHasSpokenRef.current = true;
        if (greetTimeoutRef.current) { window.clearTimeout(greetTimeoutRef.current); greetTimeoutRef.current = null; }
        if (responseFallbackRef.current) { window.clearTimeout(responseFallbackRef.current); responseFallbackRef.current = null; }
        updateStatus('listening');
        setIsAgentSpeaking(false);
        break;
      case 'input_audio_buffer.speech_stopped':
        console.log('User stopped speaking, waiting for transcription...');
        updateStatus('thinking');
        if (responseFallbackRef.current) window.clearTimeout(responseFallbackRef.current);
        responseFallbackRef.current = window.setTimeout(() => {
          if (dcRef.current?.readyState === 'open') {
            console.log('[Voice] Fallback: manually requesting response');
            dcRef.current.send(JSON.stringify({ type: 'response.create' }));
          }
        }, 5000);
        break;
      case 'input_audio_buffer.committed':
        updateStatus('thinking');
        break;
      case 'conversation.item.input_audio_transcription.completed':
        const transcriptText = (event as any).transcript as string;
        setTranscript(transcriptText);
        optionsRef.current.onTranscript?.(transcriptText, true);
        break;
      case 'response.function_call_arguments.done':
        const callId = ((event as any).call_id || (event as any).item?.call_id) as string;
        const name = ((event as any).name || (event as any).item?.name) as string;
        const argsStr = ((event as any).arguments || (event as any).item?.arguments) as string;
        if (callId && name) {
          try { executeToolCall(callId, name, JSON.parse(argsStr || '{}')); }
          catch (e) { console.error('[Voice] Failed to parse args:', e); }
        }
        break;
      case 'response.audio_transcript.delta':
        const delta = (event as any).delta as string;
        setAgentResponse(prev => prev + delta);
        optionsRef.current.onAgentResponse?.(delta);
        break;
      case 'response.audio_transcript.done':
        optionsRef.current.onAgentResponseComplete?.((event as any).transcript || '');
        break;
      case 'response.audio.delta':
        if (responseFallbackRef.current) { window.clearTimeout(responseFallbackRef.current); responseFallbackRef.current = null; }
        setIsAgentSpeaking(true);
        updateStatus('speaking');
        break;
      case 'response.audio.done':
      case 'response.done':
        setIsAgentSpeaking(false);
        updateStatus('connected');
        if (event.type === 'response.done') setAgentResponse('');
        break;
      case 'error':
        const errorData = (event as any).error;
        console.error('Realtime error:', errorData);
        optionsRef.current.onError?.(errorData?.message || 'Unknown error');
        break;
    }
  }, [updateStatus, executeToolCall]);

  const disconnect = useCallback(() => {
    [connectTimeoutRef, greetTimeoutRef, responseFallbackRef].forEach(ref => {
      if (ref.current) { window.clearTimeout(ref.current); ref.current = null; }
    });
    dcRef.current?.close(); dcRef.current = null;
    pcRef.current?.close(); pcRef.current = null;
    mediaStreamRef.current?.getTracks().forEach(track => track.stop()); mediaStreamRef.current = null;
    if (audioElementRef.current) { audioElementRef.current.pause(); audioElementRef.current.srcObject = null; audioElementRef.current.remove(); audioElementRef.current = null; }
    audioContextRef.current?.close(); audioContextRef.current = null;
    userHasSpokenRef.current = false; greetedRef.current = false;
    setTranscript(''); setAgentResponse(''); setIsAgentSpeaking(false);
    updateStatus('idle');
  }, [updateStatus]);

  const connect = useCallback(async () => {
    try {
      updateStatus('connecting');
      connectTimeoutRef.current = window.setTimeout(() => { optionsRef.current.onError?.('Voice connection timed out.'); disconnect(); }, 15000);

      // CRITICAL: getUserMedia MUST be first async call for iOS PWA
      console.log('[Voice] Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      mediaStreamRef.current = stream;
      console.log('[Voice] Microphone acquired');

      // Get ephemeral token
      console.log('[Voice] Fetching token...');
      const { data: tokenData, error: tokenError } = await supabase.functions.invoke('openai-realtime-token', {
        body: { agentContext: optionsRef.current.agentContext, conversationHistory: optionsRef.current.conversationHistory }
      });
      if (tokenError || !tokenData?.client_secret) throw new Error(tokenError?.message || 'Failed to get token');
      const ephemeralKey = tokenData.client_secret.value;
      console.log('[Voice] Token received');

      // Create audio element for playback
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.setAttribute('playsinline', 'true');
      audioEl.muted = false;
      audioEl.volume = 1;
      document.body.appendChild(audioEl);
      audioElementRef.current = audioEl;

      // iOS autoplay workaround
      const unlockAudio = () => {
        audioEl.play().catch(() => {});
        document.removeEventListener('touchstart', unlockAudio);
        document.removeEventListener('pointerdown', unlockAudio);
      };
      document.addEventListener('touchstart', unlockAudio, { once: true });
      document.addEventListener('pointerdown', unlockAudio, { once: true });

      // Create RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;

      pc.oniceconnectionstatechange = () => {
        console.log('[Voice] ICE state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') { 
          optionsRef.current.onError?.('ICE failed'); 
          disconnect(); 
        }
      };
      pc.onconnectionstatechange = () => {
        console.log('[Voice] Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') { 
          optionsRef.current.onError?.('Connection lost'); 
          disconnect(); 
        }
      };

      // Handle incoming audio
      pc.ontrack = (e) => {
        console.log('[Voice] Got remote audio track');
        audioEl.srcObject = e.streams[0];
        audioEl.play().catch(() => {});
      };

      // Add mic track BEFORE creating offer
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      console.log('[Voice] Mic track added');

      // Create data channel
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      
      dc.onopen = () => {
        console.log('[Voice] Data channel open');
        if (connectTimeoutRef.current) { window.clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
        updateStatus('connected');
        userHasSpokenRef.current = false; 
        greetedRef.current = false;
        // Proactive greeting after 500ms
        greetTimeoutRef.current = window.setTimeout(() => {
          if (greetedRef.current || userHasSpokenRef.current || dc.readyState !== 'open') return;
          greetedRef.current = true;
          console.log('[Voice] Sending greeting prompt');
          dc.send(JSON.stringify({ type: 'response.create', response: { modalities: ['audio', 'text'], instructions: 'Greet briefly: "Aegis here. How can I help?"' } }));
        }, 500);
      };
      dc.onmessage = (e) => { 
        try { handleRealtimeEvent(JSON.parse(e.data)); } 
        catch (err) { console.error('[Voice] Parse error:', err); } 
      };
      dc.onerror = (e) => {
        console.error('[Voice] Data channel error:', e);
        optionsRef.current.onError?.('Data channel error');
      };
      dc.onclose = () => {
        console.log('[Voice] Data channel closed');
        updateStatus('idle');
      };

      // Create SDP offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[Voice] SDP offer created');

      // Wait for ICE gathering to complete
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          const checkIce = () => {
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', checkIce);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', checkIce);
          setTimeout(resolve, 3000); // Fallback timeout
        }
      });
      console.log('[Voice] ICE gathering complete');

      // Send SDP to OpenAI
      console.log('[Voice] Sending SDP to OpenAI...');
      const sdpRes = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
        method: 'POST', 
        headers: { 'Authorization': `Bearer ${ephemeralKey}`, 'Content-Type': 'application/sdp' }, 
        body: pc.localDescription?.sdp
      });
      if (!sdpRes.ok) throw new Error(await sdpRes.text());
      
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      console.log('[Voice] WebRTC connected!');
      
    } catch (error) {
      console.error('[Voice] Connection failed:', error);
      if (connectTimeoutRef.current) { window.clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
      optionsRef.current.onError?.(error instanceof Error ? error.message : 'Connection failed');
      updateStatus('idle'); 
      disconnect();
    }
  }, [updateStatus, disconnect, handleRealtimeEvent]);

  const sendTextMessage = useCallback((text: string) => {
    if (dcRef.current?.readyState !== 'open') return;
    dcRef.current.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } }));
    dcRef.current.send(JSON.stringify({ type: 'response.create' }));
  }, []);

  useEffect(() => { return () => { disconnect(); }; }, [disconnect]);

  const stopSpeaking = useCallback(() => {
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(JSON.stringify({ type: 'response.cancel' }));
    }
    setIsAgentSpeaking(false);
  }, []);

  const isSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  return { status, isAgentSpeaking, transcript, agentResponse, connect, disconnect, sendTextMessage, stopSpeaking, isSupported, setOutputMuted: (m: boolean) => { if (audioElementRef.current) audioElementRef.current.muted = m; }, isConnected: status !== 'idle' && status !== 'connecting' };
}
