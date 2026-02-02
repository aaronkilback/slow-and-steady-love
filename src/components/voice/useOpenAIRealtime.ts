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

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const updateStatus = useCallback((newStatus: VoiceStatus) => {
    setStatus(newStatus);
    optionsRef.current.onStatusChange?.(newStatus);
  }, []);

  const handleRealtimeEvent = useCallback((event: Record<string, unknown>) => {
    console.log('Realtime event:', event.type);

    switch (event.type) {
      case 'session.created':
        console.log('Session created');
        break;

      case 'input_audio_buffer.speech_started':
        updateStatus('listening');
        setIsAgentSpeaking(false);
        break;

      case 'input_audio_buffer.speech_stopped':
        updateStatus('thinking');
        break;

      case 'conversation.item.input_audio_transcription.completed':
        {
          const text = (event as any).transcript as string;
          console.log('User said:', text);
          setTranscript(text);
          optionsRef.current.onTranscript?.(text, true);
        }
        break;

      case 'response.audio_transcript.delta':
        {
          const delta = (event as any).delta as string;
          setAgentResponse(prev => prev + delta);
          optionsRef.current.onAgentResponse?.(delta);
        }
        break;

      case 'response.audio_transcript.done':
        {
          const full = (event as any).transcript as string;
          optionsRef.current.onAgentResponseComplete?.(full || '');
        }
        break;

      case 'response.audio.delta':
        setIsAgentSpeaking(true);
        updateStatus('speaking');
        break;

      case 'response.audio.done':
        setIsAgentSpeaking(false);
        updateStatus('connected');
        break;

      case 'response.done':
        setIsAgentSpeaking(false);
        updateStatus('connected');
        break;

      case 'error':
        {
          const err = (event as any).error;
          console.error('Realtime error:', err);
          optionsRef.current.onError?.(err?.message || 'Unknown error');
        }
        break;
    }
  }, [updateStatus]);

  const disconnect = useCallback(() => {
    console.log('Disconnecting...');

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
  }, [updateStatus]);

  const connect = useCallback(async () => {
    try {
      updateStatus('connecting');

      // Step 1: Get microphone FIRST (critical for iOS)
      console.log('Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      mediaStreamRef.current = stream;
      console.log('Got microphone');

      // Step 2: Get ephemeral token
      console.log('Getting token...');
      const { data, error } = await supabase.functions.invoke('openai-realtime-token', {
        body: {
          agentContext: optionsRef.current.agentContext,
          conversationHistory: optionsRef.current.conversationHistory
        }
      });

      if (error || !data?.client_secret) {
        throw new Error(error?.message || 'Failed to get token');
      }

      const ephemeralKey = data.client_secret.value;
      console.log('Got token');

      // Step 3: Create audio element
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.setAttribute('playsinline', 'true');
      document.body.appendChild(audioEl);
      audioElementRef.current = audioEl;

      // Step 4: Create RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;

      // Handle incoming audio
      pc.ontrack = (e) => {
        console.log('Got remote audio track');
        audioEl.srcObject = e.streams[0];
      };

      // Add local audio track
      const audioTrack = stream.getAudioTracks()[0];
      pc.addTrack(audioTrack, stream);

      // Create data channel for events
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      dc.onopen = () => {
        console.log('Data channel open');
        updateStatus('connected');
      };

      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          handleRealtimeEvent(event);
        } catch (err) {
          console.error('Failed to parse event:', err);
        }
      };

      dc.onerror = (e) => {
        console.error('Data channel error:', e);
      };

      dc.onclose = () => {
        console.log('Data channel closed');
        disconnect();
      };

      // Step 5: Create offer and wait for ICE
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          const check = () => {
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', check);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', check);
          // Timeout fallback
          setTimeout(resolve, 3000);
        }
      });

      console.log('Sending SDP to OpenAI...');
      const sdpResponse = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
        body: pc.localDescription?.sdp,
      });

      if (!sdpResponse.ok) {
        const errText = await sdpResponse.text();
        throw new Error(`SDP error: ${errText}`);
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      console.log('WebRTC connected!');

    } catch (err) {
      console.error('Connection failed:', err);
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
