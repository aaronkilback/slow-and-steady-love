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
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; }, [options]);

  const disconnect = useCallback(() => {
    dcRef.current?.close(); dcRef.current = null;
    pcRef.current?.close(); pcRef.current = null;
    mediaStreamRef.current?.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null;
    if (audioElementRef.current) { audioElementRef.current.pause(); audioElementRef.current.srcObject = null; audioElementRef.current.remove(); audioElementRef.current = null; }
    setIsAgentSpeaking(false); setStatus('idle');
  }, []);

  const connect = useCallback(async () => {
    try {
      setStatus('connecting');
      const { data, error } = await supabase.functions.invoke('openai-realtime-token', { body: { agentContext: optionsRef.current.agentContext } });
      if (error || !data?.client_secret) throw new Error(error?.message || 'Failed to get token');

      const pc = new RTCPeerConnection(); pcRef.current = pc;
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true; (audioEl as any).playsInline = true; audioEl.setAttribute('playsinline', 'true');
      audioElementRef.current = audioEl; document.body.appendChild(audioEl);

      pc.ontrack = (e) => { audioEl.srcObject = e.streams[0]; audioEl.play().catch(() => window.addEventListener('pointerdown', () => audioEl.play(), { once: true })); };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      mediaStreamRef.current = stream; stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const dc = pc.createDataChannel('oai-events'); dcRef.current = dc;
      dc.onopen = () => { setStatus('connected'); dc.send(JSON.stringify({ type: 'response.create', response: { modalities: ['audio', 'text'], instructions: 'Greet the user briefly.' } })); };
      dc.onmessage = (e) => {
        const d = JSON.parse(e.data);
        if (d.type === 'conversation.item.input_audio_transcription.completed') optionsRef.current.onTranscript?.(d.transcript);
        if (d.type === 'response.audio_transcript.done') optionsRef.current.onAgentResponseComplete?.(d.transcript || '');
        if (d.type === 'response.audio.delta') { setIsAgentSpeaking(true); setStatus('speaking'); }
        if (d.type === 'response.done') { setIsAgentSpeaking(false); setStatus('connected'); }
        if (d.type === 'error') optionsRef.current.onError?.(d.error?.message);
      };

      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      const sdpResp = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', { method: 'POST', headers: { 'Authorization': `Bearer ${data.client_secret.value}`, 'Content-Type': 'application/sdp' }, body: offer.sdp });
      if (!sdpResp.ok) throw new Error('WebRTC failed');
      await pc.setRemoteDescription({ type: 'answer', sdp: await sdpResp.text() });
    } catch (e) { optionsRef.current.onError?.(e instanceof Error ? e.message : 'Failed'); setStatus('idle'); disconnect(); }
  }, [disconnect]);

  useEffect(() => () => disconnect(), [disconnect]);
  return { 
    status, 
    isAgentSpeaking, 
    connect, 
    disconnect, 
    isConnected: status === 'connected' || status === 'speaking',
    isSupported: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!window.RTCPeerConnection
  };
}
