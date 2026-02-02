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
  const [micLevel, setMicLevel] = useState(0);
  const [lastEventType, setLastEventType] = useState<string | null>(null);
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const optionsRef = useRef(options);
  
  useEffect(() => { 
    optionsRef.current = options; 
  }, [options]);

  // Mic level monitor for visual feedback
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
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setMicLevel(Math.min(1, rms / 128));
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      
      updateLevel();
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

  const disconnect = useCallback(() => {
    console.log('[Realtime] Disconnecting...');
    stopMicLevelMonitor();
    
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
    setLastEventType(null);
    setStatus('idle');
  }, [stopMicLevelMonitor]);

  /**
   * CRITICAL: This function MUST be called directly from a button onClick handler.
   * iOS PWA mode requires getUserMedia to be initiated from user interaction.
   */
  const connect = useCallback(async () => {
    try {
      if (pcRef.current || status === 'connecting' || status === 'connected' || status === 'speaking') {
        return;
      }

      console.log('[Realtime] Starting connection...');
      setStatus('connecting');

      // Step 1: Get ephemeral token from edge function
      const { data, error } = await supabase.functions.invoke('openai-realtime-token', { 
        body: { agentContext: optionsRef.current.agentContext } 
      });
      
      if (error || !data?.client_secret) {
        throw new Error(error?.message || 'Failed to get session token');
      }
      
      console.log('[Realtime] Got session token');

      // Step 2: Create RTCPeerConnection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Step 3: Create audio element for playback (iOS PWA compatible)
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (audioEl as any).playsInline = true;
      audioEl.setAttribute('playsinline', 'true');
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

      // Step 5: Get microphone access and add tracks
      console.log('[Realtime] Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;
      console.log('[Realtime] Microphone access granted');
      
      // Start mic level monitor
      startMicLevelMonitor(stream);
      
      // Add tracks to peer connection
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
          
          if (d?.type) {
            console.log('[Realtime] Event:', d.type);
            setLastEventType(d.type);
          }
          
          // User speech transcription
          if (d.type === 'conversation.item.input_audio_transcription.completed') {
            console.log('[Realtime] User said:', d.transcript);
            optionsRef.current.onTranscript?.(d.transcript);
          }
          
          // Agent response complete (audio transcript)
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
          body: offer.sdp 
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
  }, [disconnect, status, startMicLevelMonitor]);

  // Cleanup on unmount
  useEffect(() => () => disconnect(), [disconnect]);
  
  return { 
    status, 
    isAgentSpeaking,
    micLevel,
    lastEventType,
    connect, 
    disconnect, 
    isConnected: status === 'connected' || status === 'speaking',
    isSupported: typeof navigator !== 'undefined' && 
                 !!navigator.mediaDevices?.getUserMedia && 
                 !!window.RTCPeerConnection
  };
}
