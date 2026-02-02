import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type RealtimeStatus = "idle" | "connecting" | "connected";

interface UseOpenAIRealtimeOptions {
  agentContext?: string;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAgentResponse?: (delta: string) => void;
  onAgentResponseComplete?: (fullText: string) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: RealtimeStatus) => void;
}

export function useOpenAIRealtime(options: UseOpenAIRealtimeOptions = {}) {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const responseTextRef = useRef("");

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

  const disconnect = useCallback(() => {
    // Stop all tracks
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
      audioElRef.current.srcObject = null;
      audioElRef.current.remove();
      audioElRef.current = null;
    }

    updateStatus("idle");
    setIsAgentSpeaking(false);
    setError(null);
    responseTextRef.current = "";
    console.log("[Realtime] Disconnected");
  }, [updateStatus]);

  /**
   * CRITICAL: This function MUST be called directly from a user gesture (click/tap handler).
   * iOS PWA mode requires getUserMedia to be initiated synchronously from user interaction.
   * Do NOT call this from useEffect, setTimeout, or async callbacks.
   */
  const connect = useCallback(async () => {
    if (!isSupported) {
      const msg = "WebRTC not supported in this browser";
      setError(msg);
      options.onError?.(msg);
      return;
    }

    // Clean up any existing connection
    if (pcRef.current || dcRef.current || streamRef.current) {
      disconnect();
    }

    try {
      updateStatus("connecting");
      setError(null);
      responseTextRef.current = "";

      // STEP 1: iOS PWA fix - Create AudioContext on user gesture
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || 
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
        }
      }

      // Resume AudioContext if suspended (iOS requirement)
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }

      // STEP 2: Get microphone with iOS-compatible constraints
      // This MUST happen synchronously from user gesture
      console.log("[Realtime] Requesting microphone access");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        },
      });
      streamRef.current = stream;
      console.log("[Realtime] Microphone access granted");

      // STEP 3: Get ephemeral token from edge function
      console.log("[Realtime] Fetching session token");
      const { data, error: tokenError } = await supabase.functions.invoke("openai-realtime-token", {
        body: {
          instructions: options.agentContext || `You are Aegis, lead AI security agent for Silent Shield Security Intelligence Platform.

VOICE STYLE:
- Deep, authoritative male voice with commanding presence
- Measured, deliberate pacing—never rushed
- Clinical precision with strategic undertones
- Speaks like a senior intelligence officer delivering a classified briefing
- Zero filler words—every phrase carries weight
- Calm confidence, not aggressive
- Keep answers tight: 1-3 sentences by default unless detail is requested
- Never sound robotic

ROLE:
- Lead AI Security Agent for the Fortress platform
- Coordinates specialized agents for security tasks
- Provides threat analysis and intelligence briefings
- Monitors system status and coordinates command operations`,
        },
      });

      if (tokenError || !data?.client_secret?.value) {
        throw new Error(tokenError?.message || "Failed to get session token");
      }

      console.log("[Realtime] Session token received");

      // STEP 4: Create WebRTC peer connection
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });
      pcRef.current = pc;

      // Add microphone track to peer connection
      stream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // STEP 5: Handle remote audio from OpenAI
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.setAttribute("playsinline", "true");
      audioEl.setAttribute("webkit-playsinline", "true");
      audioElRef.current = audioEl;

      pc.ontrack = (e) => {
        console.log("[Realtime] Received audio track");
        audioEl.srcObject = e.streams[0];
        audioEl.play().catch((err) => {
          console.warn("[Realtime] Audio autoplay blocked:", err);
        });
      };

      // STEP 6: Create data channel for events
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        console.log("[Realtime] Data channel open - connected!");
        updateStatus("connected");
      };

      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);

          switch (event.type) {
            case "conversation.item.input_audio_transcription.completed":
              console.log("[Realtime] User transcript:", event.transcript);
              options.onTranscript?.(event.transcript || "", true);
              break;

            case "response.audio_transcript.delta":
              responseTextRef.current += event.delta || "";
              options.onAgentResponse?.(event.delta || "");
              break;

            case "response.audio.started":
              console.log("[Realtime] Agent started speaking");
              setIsAgentSpeaking(true);
              break;

            case "response.audio.done":
            case "response.done":
              console.log("[Realtime] Agent finished speaking");
              setIsAgentSpeaking(false);
              if (responseTextRef.current) {
                options.onAgentResponseComplete?.(responseTextRef.current);
                responseTextRef.current = "";
              }
              break;

            case "error":
              console.error("[Realtime] API error:", event.error);
              setError(event.error?.message || "Realtime error");
              options.onError?.(event.error?.message || "Realtime error");
              break;
          }
        } catch (err) {
          console.error("[Realtime] Message parse error:", err);
        }
      };

      dc.onerror = (err) => {
        console.error("[Realtime] Data channel error:", err);
        setError("Connection error");
        options.onError?.("Connection error");
      };

      dc.onclose = () => {
        console.log("[Realtime] Data channel closed");
        updateStatus("idle");
      };

      pc.onconnectionstatechange = () => {
        console.log("[Realtime] Connection state:", pc.connectionState);
        if (pc.connectionState === "failed") {
          setError("Connection failed");
          options.onError?.("Connection failed");
          disconnect();
        }
      };

      // STEP 7: Create offer and set local description
      console.log("[Realtime] Creating WebRTC offer");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // STEP 8: Send offer to OpenAI and get answer (client-side SDP handshake)
      console.log("[Realtime] Sending offer to OpenAI");
      const sdpResponse = await fetch(
        "https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${data.client_secret.value}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        }
      );

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        throw new Error(`OpenAI SDP error: ${sdpResponse.status} - ${errorText}`);
      }

      const answerSdp = await sdpResponse.text();
      console.log("[Realtime] Received SDP answer, setting remote description");
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      console.log("[Realtime] WebRTC connection established successfully");
    } catch (err) {
      console.error("[Realtime] Connect error:", err);
      const msg = err instanceof Error ? err.message : "Connection failed";
      setError(msg);
      options.onError?.(msg);
      updateStatus("idle");
    }
  }, [disconnect, isSupported, options, updateStatus]);

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
    isConnected: status === "connected",
    isAgentSpeaking,
    error,
    connect,
    disconnect,
  };
}
