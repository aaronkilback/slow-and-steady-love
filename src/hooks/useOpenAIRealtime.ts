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
  const [micLevel, setMicLevel] = useState(0); // 0-1 normalized mic input level
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const optionsRef = useRef(options);
  
  useEffect(() => { 
    optionsRef.current = options; 
  }, [options]);

  // Mic level analyser loop
  const startMicLevelMonitor = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateLevel = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        // Calculate RMS for a better representation of loudness
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const normalized = Math.min(1, rms / 128); // Normalize to 0-1
        setMicLevel(normalized);
        
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      
      updateLevel();
      console.log('[Realtime] Mic level monitor started');
    } catch (err) {
      console.warn('[Realtime] Could not start mic level monitor:', err);
    }
  }, []);

  const stopMicLevelMonitor = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setMicLevel(0);
  }, []);

  const waitForIceGatheringComplete = useCallback((pc: RTCPeerConnection, timeoutMs = 2500) => {
    // For non-trickle HTTP SDP exchange, we must wait until ICE candidates are embedded
    // in pc.localDescription.sdp. Otherwise the connection can appear “connected” but
    // media/data never flow reliably (especially on mobile networks).
    if (pc.iceGatheringState === 'complete') return Promise.resolve();

    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        pc.removeEventListener('icegatheringstatechange', onChange);
        resolve();
      };

      const onChange = () => {
        console.log('[Realtime] ICE gathering state:', pc.iceGatheringState);
        if (pc.iceGatheringState === 'complete') finish();
      };

      pc.addEventListener('icegatheringstatechange', onChange);
      setTimeout(finish, timeoutMs);
    });
  }, []);

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
    
    // Stop mic level monitor
    stopMicLevelMonitor();
    
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
  }, [releaseWakeLock, stopMicLevelMonitor]);

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

      // CRITICAL (iOS Safari / iOS PWA): Initiate microphone capture as the FIRST awaited call.
      // Do NOT await anything (network, wake lock, timers) before getUserMedia, or iOS may
      // show "listening" UI while the mic never actually becomes active.
      console.log('[Realtime] Requesting microphone (must be first await)...');
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

      // Start mic level monitor for visual feedback
      startMicLevelMonitor(stream);

      // Request Wake Lock to keep screen awake during voice session (best-effort; may be unsupported on iOS)
      // Not awaited to avoid coupling mic activation to this capability.
      requestWakeLock().catch(() => {});
      
      // Step 1: Get ephemeral token from edge function
      const { data, error } = await supabase.functions.invoke('openai-realtime-token', { 
        body: { agentContext: optionsRef.current.agentContext } 
      });
      
      if (error || !data?.client_secret) {
        throw new Error(error?.message || 'Failed to get session token');
      }
      
      console.log('[Realtime] Got session token');

      // Step 2: Create RTCPeerConnection
      // Add a STUN server for more reliable ICE negotiation on mobile networks.
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;

      pc.oniceconnectionstatechange = () => {
        console.log('[Realtime] ICE state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          optionsRef.current.onError?.('Voice connection lost (network/ICE).');
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[Realtime] Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          optionsRef.current.onError?.('Voice connection lost.');
        }
      };

      // Step 3: Create audio element for playback (iOS PWA compatible)
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      // iOS often blocks first audio output unless you "unlock" it with a user gesture.
      // Start muted and attempt to play immediately (still within the original tap handler).
      audioEl.muted = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (audioEl as any).playsInline = true;
      audioEl.setAttribute('playsinline', 'true');
      audioEl.setAttribute('webkit-playsinline', 'true');
      audioElementRef.current = audioEl;
      document.body.appendChild(audioEl);
      audioEl.play().catch(() => {
        // Ignore; we'll retry after the remote track arrives.
      });

      // Step 4: Handle incoming audio track
      pc.ontrack = (e) => {
        console.log('[Realtime] Received audio track');
        audioEl.srcObject = e.streams[0];
        // Unmute once we have actual audio and try to play.
        audioEl.muted = false;
        audioEl.play().catch(() => {
          // iOS might still block; require one additional user interaction.
          window.addEventListener('pointerdown', () => audioEl.play(), { once: true });
        });
      };

      // Step 5: Add microphone tracks to peer connection
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

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

          // Useful for debugging “stuck on listening” cases (iOS often succeeds in WebRTC but never triggers a response)
          if (d?.type) {
            console.log('[Realtime] Event:', d.type);
          }
          
          // User speech transcription
          if (d.type === 'conversation.item.input_audio_transcription.completed') {
            console.log('[Realtime] User said:', d.transcript);
            optionsRef.current.onTranscript?.(d.transcript);

            // IMPORTANT: Explicitly request a response on each completed transcription.
            // Relying on server_vad.create_response alone can fail/stall on some iOS/WebRTC paths.
            try {
              dcRef.current?.send(
                JSON.stringify({
                  type: 'response.create',
                  response: {
                    modalities: ['audio', 'text'],
                  },
                })
              );
            } catch (err) {
              console.warn('[Realtime] Failed to request response:', err);
            }
          }
          
          // Agent response complete
          if (d.type === 'response.audio_transcript.done') {
            console.log('[Realtime] Agent said:', d.transcript);
            optionsRef.current.onAgentResponseComplete?.(d.transcript || '');
          }

          // Some versions emit text completion events under different names
          if (d.type === 'response.output_text.done' || d.type === 'response.text.done') {
            if (typeof d.text === 'string' && d.text.trim()) {
              console.log('[Realtime] Agent text:', d.text);
              optionsRef.current.onAgentResponseComplete?.(d.text.trim());
            }
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

      // IMPORTANT: wait for ICE candidates to be gathered into localDescription.sdp
      await waitForIceGatheringComplete(pc);
      const localSdp = pc.localDescription?.sdp;
      if (!localSdp) {
        throw new Error('Missing local SDP after ICE gathering');
      }

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
          body: localSdp 
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
    micLevel,
    connect, 
    disconnect, 
    isConnected: status === 'connected' || status === 'speaking',
    isSupported: typeof navigator !== 'undefined' && 
                 !!navigator.mediaDevices?.getUserMedia && 
                 !!window.RTCPeerConnection
  };
}
