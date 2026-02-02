import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type RealtimeStatus = "idle" | "connecting" | "connected" | "speaking" | "listening";

interface UseOpenAIRealtimeOptions {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAgentResponse?: (text: string) => void;
  onAgentResponseComplete?: (fullText: string) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: RealtimeStatus) => void;
  agentContext?: string;
}

export function useOpenAIRealtime(options: UseOpenAIRealtimeOptions = {}) {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [isSupported, setIsSupported] = useState(true);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioElMountedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);

  // Check WebRTC support
  useEffect(() => {
    const supported = !!(
      window.RTCPeerConnection &&
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia
    );
    setIsSupported(supported);
  }, []);

  const updateStatus = useCallback((newStatus: RealtimeStatus) => {
    setStatus(newStatus);
    options.onStatusChange?.(newStatus);
  }, [options]);

  const waitForIceGatheringComplete = useCallback(async (pc: RTCPeerConnection) => {
    // Some browsers (notably mobile Safari) may not have ICE candidates in the SDP
    // immediately after setLocalDescription. Waiting prevents "stuck connecting".
    if (pc.iceGatheringState === "complete") return;

    await new Promise<void>((resolve) => {
      let resolved = false;
      const onChange = () => {
        if (pc.iceGatheringState === "complete" && !resolved) {
          resolved = true;
          pc.removeEventListener("icegatheringstatechange", onChange);
          resolve();
        }
      };

      pc.addEventListener("icegatheringstatechange", onChange);

      // Safety timeout so we don't hang forever.
      window.setTimeout(() => {
        if (!resolved) {
          resolved = true;
          pc.removeEventListener("icegatheringstatechange", onChange);
          resolve();
        }
      }, 2500);
    });
  }, []);

  const disconnect = useCallback(() => {
    // Stop microphone
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Close data channel
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }

    // Close peer connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // Clean up audio element
    if (audioElRef.current) {
      if (audioElMountedRef.current) {
        try {
          audioElRef.current.remove();
        } catch {
          // ignore
        }
        audioElMountedRef.current = false;
      }
      audioElRef.current.srcObject = null;
      audioElRef.current = null;
    }

    updateStatus("idle");
    console.log("[Realtime] Disconnected");
  }, [updateStatus]);

  const connect = useCallback(async () => {
    if (!isSupported) {
      options.onError?.("WebRTC not supported in this browser");
      return;
    }

    try {
      updateStatus("connecting");
      console.log("[Realtime] connect() starting");

      // We do the SDP handshake via backend function to avoid client-side CORS/network blockers
      // that commonly cause "Starting..." stalls in production.

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Audio playback element
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      // Improves reliability on iOS/Safari
      audioEl.setAttribute("playsinline", "true");
      audioEl.style.display = "none";
      audioElRef.current = audioEl;
      if (!audioElMountedRef.current) {
        document.body.appendChild(audioEl);
        audioElMountedRef.current = true;
      }
      
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };

      // Get microphone access
      console.log("[Realtime] requesting microphone");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      console.log("[Realtime] microphone granted");

      // Data channel for events
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      pc.onconnectionstatechange = () => {
        console.log("[Realtime] connectionState:", pc.connectionState);
      };
      pc.oniceconnectionstatechange = () => {
        console.log("[Realtime] iceConnectionState:", pc.iceConnectionState);
      };
      pc.onicegatheringstatechange = () => {
        console.log("[Realtime] iceGatheringState:", pc.iceGatheringState);
      };

      dc.onopen = () => {
        console.log("[Realtime] Data channel open");
        updateStatus("connected");
        
        // Send initial greeting request
        dc.send(JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
            instructions: "Greet the operator briefly. You are Aegis, lead AI security agent.",
          },
        }));
      };

      dc.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          switch (message.type) {
            case "response.audio_transcript.done":
              // Agent finished speaking
              console.log("[Realtime] Agent response complete:", message.transcript);
              options.onAgentResponseComplete?.(message.transcript);
              updateStatus("listening");
              break;
              
            case "response.audio_transcript.delta":
              // Streaming agent response text
              options.onAgentResponse?.(message.delta);
              break;
              
            case "conversation.item.input_audio_transcription.completed":
              // User speech transcribed
              console.log("[Realtime] User transcript:", message.transcript);
              options.onTranscript?.(message.transcript, true);
              break;
              
            case "input_audio_buffer.speech_started":
              console.log("[Realtime] User started speaking");
              updateStatus("listening");
              break;
              
            case "input_audio_buffer.speech_stopped":
              console.log("[Realtime] User stopped speaking");
              updateStatus("connected");
              break;
              
            case "response.audio.started":
              console.log("[Realtime] Agent started speaking");
              updateStatus("speaking");
              break;
              
            case "response.audio.done":
              console.log("[Realtime] Agent audio done");
              break;
              
            case "error":
              console.error("[Realtime] Error:", message.error);
              options.onError?.(message.error?.message || "Realtime error");
              break;
          }
        } catch (err) {
          console.error("[Realtime] Message parse error:", err);
        }
      };

      dc.onerror = (err) => {
        console.error("[Realtime] Data channel error:", err);
        options.onError?.("Connection error");
      };

      dc.onclose = () => {
        console.log("[Realtime] Data channel closed");
        updateStatus("idle");
      };

      // WebRTC handshake
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await waitForIceGatheringComplete(pc);

      const localSdp = pc.localDescription?.sdp;
      if (!localSdp) {
        options.onError?.("Failed to create SDP offer");
        disconnect();
        return;
      }

      const { data, error } = await supabase.functions.invoke("openai-realtime-token", {
        body: {
          agentContext: options.agentContext,
          offer_sdp: localSdp,
        },
      });

      if (error || !data?.answer_sdp) {
        console.error("[Realtime] Handshake error:", error || data);
        options.onError?.(error?.message || "Failed to establish connection");
        disconnect();
        return;
      }

      const answerSdp = data.answer_sdp as string;
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      console.log("[Realtime] Connection established");
    } catch (err) {
      console.error("[Realtime] Connect error:", err);
      options.onError?.(err instanceof Error ? err.message : "Connection failed");
      updateStatus("idle");
    }
  }, [disconnect, isSupported, options, updateStatus, waitForIceGatheringComplete]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pcRef.current) {
        disconnect();
      }
    };
  }, [disconnect]);

  return {
    status,
    isSupported,
    connect,
    disconnect,
    isConnected: status !== "idle" && status !== "connecting",
  };
}
