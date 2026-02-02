import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseOpenAIRealtimeOptions {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAgentResponse?: (text: string) => void;
  onAgentResponseComplete?: (fullText: string) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: VoiceStatus) => void;
  agentContext?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'speaking' | 'listening' | 'thinking';

export function useOpenAIRealtime(options: UseOpenAIRealtimeOptions = {}) {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [agentResponse, setAgentResponse] = useState('');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const responseFallbackRef = useRef<NodeJS.Timeout | null>(null);

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const updateStatus = useCallback((newStatus: VoiceStatus) => {
    setStatus(newStatus);
    optionsRef.current.onStatusChange?.(newStatus);
  }, []);

  // Clear fallback timer
  const clearFallbackTimer = useCallback(() => {
    if (responseFallbackRef.current) {
      clearTimeout(responseFallbackRef.current);
      responseFallbackRef.current = null;
    }
  }, []);

  // Start 5-second fallback timer for manual response trigger
  const startFallbackTimer = useCallback(() => {
    clearFallbackTimer();
    responseFallbackRef.current = setTimeout(() => {
      console.log('[Voice] 5s fallback: triggering response.create');
      if (dcRef.current?.readyState === 'open') {
        dcRef.current.send(JSON.stringify({ type: 'response.create' }));
      }
    }, 5000);
  }, [clearFallbackTimer]);

  const handleRealtimeEvent = useCallback((event: Record<string, unknown>) => {
    const eventType = event.type as string;
    console.log('[Voice] Event:', eventType);

    switch (eventType) {
      case 'session.created':
        console.log('[Voice] Session created, ready for input');
        updateStatus('connected');
        break;

      case 'input_audio_buffer.speech_started':
        console.log('[Voice] User started speaking');
        updateStatus('listening');
        setIsAgentSpeaking(false);
        clearFallbackTimer();
        break;

      case 'input_audio_buffer.speech_stopped':
        console.log('[Voice] User stopped speaking, waiting for response');
        updateStatus('thinking');
        // Start 5-second fallback in case server VAD doesn't trigger response
        startFallbackTimer();
        break;

      case 'conversation.item.input_audio_transcription.completed':
        {
          const text = (event as { transcript?: string }).transcript || '';
          console.log('[Voice] Transcription:', text);
          setTranscript(text);
          optionsRef.current.onTranscript?.(text, true);
        }
        break;

      case 'response.audio_transcript.delta':
        {
          const delta = (event as { delta?: string }).delta || '';
          setAgentResponse(prev => prev + delta);
          optionsRef.current.onAgentResponse?.(delta);
        }
        break;

      case 'response.audio_transcript.done':
        {
          const full = (event as { transcript?: string }).transcript || '';
          console.log('[Voice] Response complete:', full.slice(0, 50) + '...');
          optionsRef.current.onAgentResponseComplete?.(full);
        }
        break;

      case 'response.created':
        console.log('[Voice] Response started');
        clearFallbackTimer();
        break;

      case 'response.audio.delta':
        setIsAgentSpeaking(true);
        updateStatus('speaking');
        clearFallbackTimer();
        break;

      case 'response.audio.done':
        console.log('[Voice] Audio playback complete');
        setIsAgentSpeaking(false);
        updateStatus('connected');
        // Reset for next turn
        setAgentResponse('');
        break;

      case 'response.done':
        setIsAgentSpeaking(false);
        updateStatus('connected');
        break;

      case 'error':
        {
          const err = (event as { error?: { message?: string } }).error;
          console.error('[Voice] Error:', err);
          optionsRef.current.onError?.(err?.message || 'Unknown error');
        }
        break;
    }
  }, [updateStatus, clearFallbackTimer, startFallbackTimer]);

  const disconnect = useCallback(() => {
    console.log('[Voice] Disconnecting...');
    clearFallbackTimer();

    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.srcObject = null;
      audioElementRef.current.remove();
      audioElementRef.current = null;
    }

    setTranscript('');
    setAgentResponse('');
    setIsAgentSpeaking(false);
    updateStatus('idle');
  }, [updateStatus, clearFallbackTimer]);

  const connect = useCallback(async () => {
    try {
      updateStatus('connecting');

      // Step 1: Get microphone FIRST (critical for iOS PWA)
      console.log('[Voice] Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      mediaStreamRef.current = stream;
      console.log('[Voice] Microphone acquired');

      // Step 2: Get ephemeral token from edge function
      console.log('[Voice] Fetching ephemeral token...');
      const { data, error } = await supabase.functions.invoke('openai-realtime-token', {
        body: {
          agentContext: optionsRef.current.agentContext,
          conversationHistory: optionsRef.current.conversationHistory
        }
      });

      if (error || !data?.client_secret) {
        throw new Error(error?.message || 'Failed to get ephemeral token');
      }

      const ephemeralKey = data.client_secret.value;
      console.log('[Voice] Token received');

      // Step 3: Create audio element for playback
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.setAttribute('playsinline', 'true');
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

      // Step 4: Create RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;

      // Handle incoming audio from OpenAI
      pc.ontrack = (e) => {
        console.log('[Voice] Received remote audio track');
        audioEl.srcObject = e.streams[0];
      };

      // CRITICAL: Add mic track to connection BEFORE creating offer
      const audioTrack = stream.getAudioTracks()[0];
      pc.addTrack(audioTrack, stream);
      console.log('[Voice] Mic track attached');

      // Add explicit sendrecv transceiver for bidirectional audio
      pc.addTransceiver('audio', { direction: 'sendrecv' });

      // Create data channel for realtime events
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      dc.onopen = () => {
        console.log('[Voice] Data channel open - ready for voice');
        updateStatus('connected');
      };

      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          handleRealtimeEvent(event);
        } catch (err) {
          console.error('[Voice] Failed to parse event:', err);
        }
      };

      dc.onerror = (e) => {
        console.error('[Voice] Data channel error:', e);
      };

      dc.onclose = () => {
        console.log('[Voice] Data channel closed');
        disconnect();
      };

      // Step 5: Create SDP offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[Voice] SDP offer created');

      // Step 6: Wait for ICE gathering to complete
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
          // Fallback timeout
          setTimeout(resolve, 3000);
        }
      });
      console.log('[Voice] ICE gathering complete');

      // Step 7: Send SDP to OpenAI Realtime API
      console.log('[Voice] Sending SDP to OpenAI...');
      const sdpResponse = await fetch(
        'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ephemeralKey}`,
            'Content-Type': 'application/sdp',
          },
          body: pc.localDescription?.sdp,
        }
      );

      if (!sdpResponse.ok) {
        const errText = await sdpResponse.text();
        throw new Error(`SDP exchange failed: ${errText}`);
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      console.log('[Voice] WebRTC connection established!');

    } catch (err) {
      console.error('[Voice] Connection failed:', err);
      optionsRef.current.onError?.(err instanceof Error ? err.message : 'Connection failed');
      disconnect();
    }
  }, [updateStatus, handleRealtimeEvent, disconnect]);

  const stopSpeaking = useCallback(() => {
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(JSON.stringify({ type: 'response.cancel' }));
    }
    setIsAgentSpeaking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    stopSpeaking,
    status,
    isAgentSpeaking,
    transcript,
    agentResponse,
    isSupported: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
  };
}
