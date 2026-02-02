import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseOpenAIRealtimeOptions {
  onTranscript?: (text: string) => void;
  onAgentResponseComplete?: (text: string) => void;
  onError?: (error: string) => void;
  agentContext?: string;
}

export function useOpenAIRealtime(options: UseOpenAIRealtimeOptions = {}) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'speaking'>('idle');
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const optionsRef = useRef(options);
  
  useEffect(() => { 
    optionsRef.current = options; 
  }, [options]);

  // Request Wake Lock to prevent screen from sleeping during voice session
  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('[Realtime] Wake Lock acquired - screen will stay on');
        
        // Re-acquire wake lock if released (e.g., tab switch)
        wakeLockRef.current.addEventListener('release', () => {
          console.log('[Realtime] Wake Lock released');
        });
      } catch (err) {
        console.warn('[Realtime] Wake Lock not available:', err);
      }
    } else {
      console.log('[Realtime] Wake Lock API not supported');
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
      console.log('[Realtime] Wake Lock released');
    }
  }, []);

  const disconnect = useCallback(() => {
    console.log('[Realtime] Disconnecting...');
    
    // Release wake lock
    releaseWakeLock();
    
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.srcObject = null;
      audioElementRef.current.remove();
      audioElementRef.current = null;
    }
    
    setIsAgentSpeaking(false);
    setStatus('idle');
  }, [releaseWakeLock]);

  /**
   * CRITICAL: This function MUST be called directly from a button onClick handler.
   * iOS PWA mode requires getUserMedia to be initiated synchronously from user interaction.
   * Do NOT call this from useEffect, setTimeout, or async callbacks.
   */
  const connect = useCallback(async () => {
    try {
      // Prevent duplicate connects (double-taps, rerenders)
      if (pcRef.current || status === 'connecting' || status === 'connected' || status === 'speaking') {
        return;
      }

      console.log('[Realtime] Starting connection...');
      setStatus('connecting');

      // CRITICAL (iOS PWA): Initiate microphone capture immediately from the click stack.
      // Do this BEFORE any network awaits to avoid losing the user-gesture requirement.
      console.log('[Realtime] Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true, // Helps with iOS audio levels
        },
      });
      mediaStreamRef.current = stream;
      console.log('[Realtime] Microphone access granted');

      // Request Wake Lock AFTER mic is acquired (iOS user-gesture requirement)
      requestWakeLock().catch(() => {});
      
      // Step 1: Get ephemeral token from edge function
      const { data, error } = await supabase.functions.invoke('openai-realtime-token', { 
        body: { agentContext: optionsRef.current.agentContext } 
      });
      
      if (error || !data?.client_secret) {
        throw new Error(error?.message || 'Failed to get session token');
      }
      
      console.log('[Realtime] Got session token');

      // Step 2: Create RTCPeerConnection with STUN servers for better connectivity
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });
      pcRef.current = pc;

      // Monitor ICE connection state
      pc.oniceconnectionstatechange = () => {
        console.log('[Realtime] ICE state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          console.error('[Realtime] ICE connection failed');
          optionsRef.current.onError?.('Connection lost. Please try again.');
        }
      };

      // Step 3: Create audio element for playback (iOS PWA compatible)
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (audioEl as any).playsInline = true;
      audioEl.setAttribute('playsinline', 'true');
      audioEl.setAttribute('webkit-playsinline', 'true');
      audioElementRef.current = audioEl;
      document.body.appendChild(audioEl);

      // Step 4: Handle incoming audio track
      pc.ontrack = (e) => {
        console.log('[Realtime] Received audio track');
        audioEl.srcObject = e.streams[0];
        audioEl.play().catch(() => {
          // iOS might block autoplay, add touch listener as fallback
          window.addEventListener('pointerdown', () => audioEl.play(), { once: true });
        });
      };

      // Step 5: Add microphone tracks to peer connection
      stream.getTracks().forEach(track => {
        console.log('[Realtime] Adding track:', track.kind, track.label);
        pc.addTrack(track, stream);
      });

      // Step 6: Create data channel for events
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      
      dc.onopen = () => {
        console.log('[Realtime] Data channel open - connected!');
        setStatus('connected');
        
        // Send initial greeting request
        dc.send(JSON.stringify({ 
          type: 'response.create', 
          response: { 
            modalities: ['audio', 'text'], 
            instructions: 'Greet the user briefly as AEGIS, their AI security agent.' 
          } 
        }));
      };
      
      dc.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          
          // User speech transcription
          if (d.type === 'conversation.item.input_audio_transcription.completed') {
            console.log('[Realtime] User said:', d.transcript);
            optionsRef.current.onTranscript?.(d.transcript);
          }
          
          // Agent response complete
          if (d.type === 'response.audio_transcript.done') {
            console.log('[Realtime] Agent said:', d.transcript);
            optionsRef.current.onAgentResponseComplete?.(d.transcript || '');
          }
          
          // Agent is speaking
          if (d.type === 'response.audio.delta') {
            setIsAgentSpeaking(true);
            setStatus('speaking');
          }
          
          // Agent finished speaking
          if (d.type === 'response.done') {
            setIsAgentSpeaking(false);
            setStatus('connected');
          }
          
          // Error from API
          if (d.type === 'error') {
            console.error('[Realtime] API error:', d.error);
            optionsRef.current.onError?.(d.error?.message || 'Realtime error');
          }
        } catch (err) {
          console.error('[Realtime] Message parse error:', err);
        }
      };
      
      dc.onerror = (err) => {
        console.error('[Realtime] Data channel error:', err);
      };
      
      dc.onclose = () => {
        console.log('[Realtime] Data channel closed');
      };

      // Step 7: Create and send SDP offer
      console.log('[Realtime] Creating WebRTC offer...');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // IMPORTANT (mobile): wait for ICE candidates to be gathered so the SDP is usable.
      // Without this, some iOS networks get stuck in a "connected/listening" state.
      const waitForIceGatheringComplete = async () => {
        if (pc.iceGatheringState === 'complete') return;
        await new Promise<void>((resolve) => {
          const onStateChange = () => {
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', onStateChange);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', onStateChange);
          // Safety timeout: proceed anyway after 2.5s
          setTimeout(() => {
            pc.removeEventListener('icegatheringstatechange', onStateChange);
            resolve();
          }, 2500);
        });
      };

      await waitForIceGatheringComplete();
      const sdpToSend = pc.localDescription?.sdp ?? offer.sdp;

      // Step 8: Send offer to OpenAI and get answer
      console.log('[Realtime] Sending offer to OpenAI...');
      const sdpResp = await fetch(
        'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
        { 
          method: 'POST', 
          headers: { 
            'Authorization': `Bearer ${data.client_secret.value}`, 
            'Content-Type': 'application/sdp' 
          }, 
          body: sdpToSend 
        }
      );
      
      if (!sdpResp.ok) {
        const errorText = await sdpResp.text();
        throw new Error(`WebRTC handshake failed: ${sdpResp.status} - ${errorText}`);
      }
      
      await pc.setRemoteDescription({ type: 'answer', sdp: await sdpResp.text() });
      console.log('[Realtime] WebRTC connection established!');
      
    } catch (e) {
      console.error('[Realtime] Connection error:', e);
      optionsRef.current.onError?.(e instanceof Error ? e.message : 'Connection failed');
      setStatus('idle');
      disconnect();
    }
  }, [disconnect, status, requestWakeLock]);

  // Re-acquire wake lock when page becomes visible again (tab switch, screen wake)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && 
          (status === 'connected' || status === 'speaking') && 
          !wakeLockRef.current) {
        console.log('[Realtime] Re-acquiring wake lock after visibility change');
        await requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [status, requestWakeLock]);

  // Cleanup on unmount
  useEffect(() => () => disconnect(), [disconnect]);
  
  return { 
    status, 
    isAgentSpeaking, 
    connect, 
    disconnect, 
    isConnected: status === 'connected' || status === 'speaking',
    isSupported: typeof navigator !== 'undefined' && 
                 !!navigator.mediaDevices?.getUserMedia && 
                 !!window.RTCPeerConnection
  };
}
