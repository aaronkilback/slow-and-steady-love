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

  // Keep a ref in sync so timeouts can check the latest status reliably.
  const statusRef = useRef<typeof status>('idle');
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const greetTimeoutRef = useRef<number | null>(null);
  const responseFallbackRef = useRef<number | null>(null);
  const listeningWatchdogRef = useRef<number | null>(null);
  const userHasSpokenRef = useRef(false);
  const greetedRef = useRef(false);
  
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const updateStatus = useCallback((newStatus: typeof status) => {
    statusRef.current = newStatus;
    setStatus(newStatus);
    optionsRef.current.onStatusChange?.(newStatus);
  }, []);

  const clearListeningWatchdog = useCallback(() => {
    if (listeningWatchdogRef.current) {
      window.clearTimeout(listeningWatchdogRef.current);
      listeningWatchdogRef.current = null;
    }
  }, []);

  const armListeningWatchdog = useCallback(() => {
    clearListeningWatchdog();

    // If iOS never emits speech_stopped (common), force a commit + response.
    listeningWatchdogRef.current = window.setTimeout(() => {
      const dc = dcRef.current;
      if (!dc || dc.readyState !== 'open') return;

      if (statusRef.current === 'listening') {
        console.warn('[Voice] Watchdog: stuck in listening — forcing response.create');
        updateStatus('thinking');
        // NOTE: For WebRTC audio tracks, sending input_audio_buffer.commit can error with
        // input_audio_buffer_commit_empty and yield a no-op response. Only request a response.
        dc.send(JSON.stringify({
          type: 'response.create',
          response: {
            modalities: ['audio', 'text'],
          }
        }));
      }
    }, 2500);
  }, [clearListeningWatchdog, updateStatus]);

  const handleRealtimeEvent = useCallback((event: Record<string, unknown>) => {
    console.log('Realtime event:', event.type, event);

    switch (event.type) {
      case 'session.created':
        console.log('Session created');
        break;

      case 'session.updated':
        console.log('Session updated');
        break;

      case 'input_audio_buffer.speech_started':
        userHasSpokenRef.current = true;
        if (greetTimeoutRef.current) {
          window.clearTimeout(greetTimeoutRef.current);
          greetTimeoutRef.current = null;
        }
        if (responseFallbackRef.current) {
          window.clearTimeout(responseFallbackRef.current);
          responseFallbackRef.current = null;
        }
        updateStatus('listening');
        setIsAgentSpeaking(false);
        armListeningWatchdog();
        break;

      case 'input_audio_buffer.speech_stopped':
        console.log('User stopped speaking, requesting response immediately...');
        updateStatus('thinking');

        clearListeningWatchdog();
        
        // CRITICAL FIX: Immediately request a response when speech stops
        // Server VAD with create_response:true isn't always reliable on iOS
        if (dcRef.current?.readyState === 'open') {
          console.log('[Voice] Sending immediate response.create after speech stopped');
          dcRef.current.send(JSON.stringify({
            type: 'response.create',
            response: { modalities: ['audio', 'text'] }
          }));
        }
        
        // Also set a fallback in case the first one doesn't work
        if (responseFallbackRef.current) {
          window.clearTimeout(responseFallbackRef.current);
        }
        responseFallbackRef.current = window.setTimeout(() => {
          if (dcRef.current?.readyState === 'open') {
            console.log('[Voice] Fallback: retrying response.create');
            dcRef.current.send(JSON.stringify({
              type: 'response.create',
              response: { modalities: ['audio', 'text'] }
            }));
          }
        }, 3000);
        break;

      case 'input_audio_buffer.committed':
        console.log('Audio buffer committed to server');
        updateStatus('thinking');
        clearListeningWatchdog();
        break;

      case 'conversation.item.input_audio_transcription.completed':
        {
          const transcriptText = (event as Record<string, unknown>).transcript as string;
          console.log('User transcript:', transcriptText);
          setTranscript(transcriptText);
          optionsRef.current.onTranscript?.(transcriptText, true);
          clearListeningWatchdog();
        }
        break;

      case 'response.audio_transcript.delta':
        {
          const delta = (event as Record<string, unknown>).delta as string;
          console.log('Agent response delta:', delta);
          setAgentResponse(prev => prev + delta);
          optionsRef.current.onAgentResponse?.(delta);
        }
        break;

      // Some sessions/models may emit text deltas instead of audio_transcript deltas.
      // Handle both to avoid "no response" when audio output is suppressed.
      case 'response.text.delta':
      case 'response.output_text.delta':
        {
          const delta = (event as Record<string, unknown>).delta as string;
          if (delta) {
            console.log('Agent text delta:', delta);
            setAgentResponse(prev => prev + delta);
            optionsRef.current.onAgentResponse?.(delta);
          }
        }
        break;

      case 'response.audio_transcript.done':
        {
          const fullTranscript = (event as Record<string, unknown>).transcript as string;
          console.log('Agent finished speaking, full transcript:', fullTranscript);
          optionsRef.current.onAgentResponseComplete?.(fullTranscript || '');
        }
        break;

      case 'response.text.done':
      case 'response.output_text.done':
        {
          const fullText = ((event as Record<string, unknown>).text as string) || '';
          console.log('Agent text done:', fullText);
          optionsRef.current.onAgentResponseComplete?.(fullText);
        }
        break;

      case 'response.audio.delta':
        if (responseFallbackRef.current) {
          window.clearTimeout(responseFallbackRef.current);
          responseFallbackRef.current = null;
        }
        clearListeningWatchdog();
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
        setAgentResponse('');
        clearListeningWatchdog();
        break;

      case 'error':
        {
          const errorData = (event as Record<string, unknown>).error as Record<string, unknown>;
          console.error('Realtime error:', errorData);
          optionsRef.current.onError?.(errorData?.message as string || 'Unknown error');
          clearListeningWatchdog();
        }
        break;

      default:
        if (event.type && !(event.type as string).startsWith('rate_limits')) {
          console.log('Unhandled event type:', event.type);
        }
    }
  }, [updateStatus]);

  const disconnect = useCallback(() => {
    console.log('Disconnecting...');

    if (connectTimeoutRef.current) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }

    if (greetTimeoutRef.current) {
      window.clearTimeout(greetTimeoutRef.current);
      greetTimeoutRef.current = null;
    }

    if (responseFallbackRef.current) {
      window.clearTimeout(responseFallbackRef.current);
      responseFallbackRef.current = null;
    }

    if (listeningWatchdogRef.current) {
      window.clearTimeout(listeningWatchdogRef.current);
      listeningWatchdogRef.current = null;
    }

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
      audioElementRef.current.pause?.();
      audioElementRef.current.srcObject = null;
      audioElementRef.current.remove();
      audioElementRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    userHasSpokenRef.current = false;
    greetedRef.current = false;

    setTranscript('');
    setAgentResponse('');
    setIsAgentSpeaking(false);
    updateStatus('idle');
  }, [updateStatus]);

  const connect = useCallback(async () => {
    try {
      updateStatus('connecting');

      // ========================================================================
      // CRITICAL iOS PWA FIX: getUserMedia MUST be the FIRST async call
      // immediately after the user tap. Any await before this breaks iOS PWA.
      // ========================================================================
      console.log('Requesting microphone access (must be first async call)...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      mediaStreamRef.current = stream;
      console.log('Microphone access granted, tracks:', stream.getAudioTracks().length);

      // Set connection timeout
      if (connectTimeoutRef.current) {
        window.clearTimeout(connectTimeoutRef.current);
      }
      connectTimeoutRef.current = window.setTimeout(() => {
        console.warn('Realtime voice connection timed out');
        optionsRef.current.onError?.('Voice connection timed out. Tap mic to try again.');
        disconnect();
      }, 20000);

      // Get ephemeral token
      console.log('Requesting ephemeral token...');
      const { data: tokenData, error: tokenError } = await supabase.functions.invoke('openai-realtime-token', {
        body: {
          agentContext: optionsRef.current.agentContext,
          conversationHistory: optionsRef.current.conversationHistory
        }
      });

      if (tokenError || !tokenData?.client_secret) {
        throw new Error(tokenError?.message || 'Failed to get ephemeral token');
      }

      console.log('Got ephemeral token, session:', tokenData.session_id);
      const ephemeralKey = tokenData.client_secret.value;

      // Create audio element BEFORE PeerConnection for iOS
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      (audioEl as any).playsInline = true;
      audioEl.setAttribute('playsinline', 'true');
      audioEl.setAttribute('webkit-playsinline', 'true');
      audioEl.muted = false;
      audioEl.volume = 1;
      document.body.appendChild(audioEl);
      audioElementRef.current = audioEl;

      // Create PeerConnection with STUN servers
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ]
      });
      pcRef.current = pc;

      pc.oniceconnectionstatechange = () => {
        console.log('ICE state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          optionsRef.current.onError?.('Voice connection failed (ICE).');
          disconnect();
        }
      };
      
      pc.onconnectionstatechange = () => {
        console.log('Peer connection state:', pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          optionsRef.current.onError?.('Voice connection lost.');
          disconnect();
        }
      };

      pc.ontrack = (event) => {
        console.log('Received audio track from OpenAI, streams:', event.streams.length);
        if (event.streams[0]) {
          audioEl.srcObject = event.streams[0];
          const playPromise = audioEl.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              console.warn('Audio autoplay blocked:', err);
              optionsRef.current.onError?.('Tap screen to enable audio');
              const resumeAudio = () => {
                audioEl.play().catch(() => {});
                document.removeEventListener('touchstart', resumeAudio);
                document.removeEventListener('click', resumeAudio);
              };
              document.addEventListener('touchstart', resumeAudio, { once: true, passive: true });
              document.addEventListener('click', resumeAudio, { once: true });
            });
          }
        }
      };

      // ========================================================================
      // CRITICAL: Add audio transceiver with sendrecv direction BEFORE adding tracks.
      // This ensures proper two-way audio negotiation on iOS WebRTC.
      // ========================================================================
      pc.addTransceiver('audio', { direction: 'sendrecv' });

      // Add microphone tracks to the connection
      stream.getTracks().forEach(track => {
        console.log('Adding audio track to PeerConnection:', track.label);
        pc.addTrack(track, stream);
      });

      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      dc.onopen = () => {
        console.log('Data channel opened');
        if (connectTimeoutRef.current) {
          window.clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        updateStatus('connected');

        userHasSpokenRef.current = false;
        greetedRef.current = false;

        greetTimeoutRef.current = window.setTimeout(() => {
          if (greetedRef.current || userHasSpokenRef.current || dc.readyState !== 'open') return;
          greetedRef.current = true;
          console.log('Sending proactive greeting request...');
          dc.send(JSON.stringify({
            type: 'response.create',
            response: {
              modalities: ['audio', 'text'],
              instructions: 'Greet the user briefly. Say something like "Aegis here. How can I help?" Keep it under 10 words.',
            },
          }));
        }, 500);
      };

      dc.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleRealtimeEvent(data);
        } catch (e) {
          console.error('Failed to parse realtime event:', e);
        }
      };

      dc.onerror = (error) => {
        console.error('Data channel error:', error);
        optionsRef.current.onError?.('Data channel error');
      };

      dc.onclose = () => {
        console.log('Data channel closed');
        updateStatus('idle');
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // CRITICAL for iOS: Wait for ICE gathering to complete before sending offer
      // This ensures all candidates are included and audio tracks are properly negotiated
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          const checkState = () => {
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', checkState);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', checkState);
          // Fallback timeout in case gathering takes too long
          setTimeout(() => {
            pc.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }, 3000);
        }
      });

      console.log('ICE gathering complete, sending SDP offer to OpenAI...');
      const sdpResponse = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp'
        },
        body: pc.localDescription?.sdp || offer.sdp
      });

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        throw new Error(`Failed to connect to OpenAI Realtime: ${errorText}`);
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      console.log('WebRTC connection established!');

    } catch (error) {
      if (connectTimeoutRef.current) {
        window.clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      console.error('Connection error:', error);
      optionsRef.current.onError?.(error instanceof Error ? error.message : 'Connection failed');
      updateStatus('idle');
      disconnect();
    }
  }, [updateStatus, disconnect, handleRealtimeEvent]);

  const sendTextMessage = useCallback((text: string) => {
    if (dcRef.current?.readyState !== 'open') {
      console.error('Data channel not open');
      return;
    }

    dcRef.current.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }]
      }
    }));
    dcRef.current.send(JSON.stringify({ type: 'response.create' }));
  }, []);

  useEffect(() => {
    return () => { disconnect(); };
  }, [disconnect]);

  return {
    status,
    isAgentSpeaking,
    transcript,
    agentResponse,
    connect,
    disconnect,
    sendTextMessage,
    setOutputMuted: (muted: boolean) => {
      if (audioElementRef.current) audioElementRef.current.muted = muted;
    },
    isConnected: status !== 'idle' && status !== 'connecting',
    isSupported: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!window.RTCPeerConnection
  };
}
