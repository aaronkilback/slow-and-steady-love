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

// Detect iOS device
function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

// Detect PWA standalone mode (iOS Home Screen app)
function isPWAStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const navStandalone = Boolean((navigator as unknown as { standalone?: boolean }).standalone);
  const mediaStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return navStandalone || mediaStandalone;
}

// Resume AudioContext (iOS suspends until user gesture)
async function ensureAudioContextActive(): Promise<void> {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") await audioContext.resume();
    // NOTE: Do NOT close() here. iOS PWA can throw "object is in an invalid state" when
    // quickly closing audio contexts during a live WebRTC startup.
  } catch (e) {
    console.warn("[Realtime] AudioContext resume failed:", e);
  }
}

function formatError(err: unknown) {
  if (!err) return { name: "UnknownError", message: "Unknown error" };
  if (err instanceof Error) return { name: err.name || "Error", message: err.message || String(err) };
  // DOMException sometimes doesn't extend Error cleanly in older Safari
  const anyErr = err as { name?: string; message?: string };
  return {
    name: anyErr?.name || "Error",
    message: anyErr?.message || String(err),
  };
}

// Get iOS-optimized audio constraints
function getAudioConstraints(): MediaStreamConstraints {
  const isIOS = isIOSDevice();
  
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      // iOS Safari requires specific sample rate for WebRTC
      ...(isIOS && { sampleRate: 24000 }),
    },
  };
}

export function useOpenAIRealtime(options: UseOpenAIRealtimeOptions = {}) {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [isSupported, setIsSupported] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioElMountedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const connectInFlightRef = useRef(false);
  const audioContextUnlockRef = useRef(false);

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

      // Safety timeout
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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

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
    setLastError(null);
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
      setLastError(msg);
      options.onError?.(msg);
      return;
    }

    const isIOS = isIOSDevice();
    const isPWA = isPWAStandalone();
    console.log("[Realtime] connect() starting - iOS:", isIOS, "PWA:", isPWA);

    // Prevent re-entrancy from double taps / event duplication in iOS PWAs.
    if (connectInFlightRef.current) return;
    connectInFlightRef.current = true;

    // If an old session exists, clear it first (avoids InvalidStateError on reused PC).
    if (pcRef.current || dcRef.current || streamRef.current) {
      disconnect();
    }

    try {
      updateStatus("connecting");
      setLastError(null);

      // STEP 1: Resume AudioContext on user gesture (iOS requirement)
      if (isIOS) {
        // Only do this once per session to reduce flakiness on iOS PWA.
        if (!audioContextUnlockRef.current) {
          console.log("[Realtime] Resuming AudioContext for iOS");
          await ensureAudioContextActive();
          audioContextUnlockRef.current = true;
        }
      }

      // STEP 2: Get microphone access IMMEDIATELY from user gesture
      // This is the critical part - getUserMedia must be called synchronously
      console.log("[Realtime] Requesting microphone (iOS-optimized constraints)");
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(getAudioConstraints());
        streamRef.current = stream;
        console.log("[Realtime] Microphone granted");
      } catch (micError) {
        console.error("[Realtime] Microphone error:", micError);
        const isPWAMode = isPWAStandalone();
        const f = formatError(micError);
        const errorMsg = f.message || "Microphone access denied";
        
        // Provide helpful message for PWA users
        if (isPWAMode && isIOS) {
          const pwaMsg = `[getUserMedia] ${f.name}: ${errorMsg}. If this is iOS Home Screen mode, realtime may be restricted—try Safari.`;
          setLastError(pwaMsg);
          options.onError?.(pwaMsg);
        } else {
          const msg = `[getUserMedia] ${f.name}: ${errorMsg}`;
          setLastError(msg);
          options.onError?.(msg);
        }
        updateStatus("idle");
        return;
      }

      // STEP 3: Create RTCPeerConnection with STUN servers
      let pc: RTCPeerConnection;
      try {
        pc = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        });
      } catch (e) {
        const f = formatError(e);
        const msg = `[RTCPeerConnection] ${f.name}: ${f.message}`;
        setLastError(msg);
        options.onError?.(msg);
        updateStatus("idle");
        return;
      }
      pcRef.current = pc;

      // STEP 4: Create audio playback element (must be created from user gesture on iOS)
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.setAttribute("playsinline", "true");
      audioEl.setAttribute("webkit-playsinline", "true");
      audioEl.style.display = "none";
      audioElRef.current = audioEl;
      
      if (!audioElMountedRef.current) {
        document.body.appendChild(audioEl);
        audioElMountedRef.current = true;
      }
      
      pc.ontrack = (e) => {
        console.log("[Realtime] Received audio track");
        audioEl.srcObject = e.streams[0];
        // Force play on iOS
        audioEl.play().catch((err) => {
          console.warn("[Realtime] Audio autoplay blocked:", err);
        });
      };

      // Add microphone tracks to peer connection
      try {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      } catch (e) {
        const f = formatError(e);
        const msg = `[addTrack] ${f.name}: ${f.message}`;
        setLastError(msg);
        options.onError?.(msg);
        disconnect();
        return;
      }

      // STEP 5: Create data channel
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      pc.onconnectionstatechange = () => {
        console.log("[Realtime] connectionState:", pc.connectionState);
        if (pc.connectionState === "failed") {
          const msg = "Connection failed";
          setLastError(msg);
          options.onError?.(msg);
          disconnect();
        }
      };
      
      pc.oniceconnectionstatechange = () => {
        console.log("[Realtime] iceConnectionState:", pc.iceConnectionState);
      };
      
      pc.onicegatheringstatechange = () => {
        console.log("[Realtime] iceGatheringState:", pc.iceGatheringState);
      };
      
      pc.onicecandidateerror = (ev) => {
        console.warn("[Realtime] ICE candidate error", ev);
      };

      dc.onopen = () => {
        console.log("[Realtime] Data channel open");
        updateStatus("connected");
        
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
              console.log("[Realtime] Agent response complete:", message.transcript);
              options.onAgentResponseComplete?.(message.transcript);
              updateStatus("listening");
              break;
              
            case "response.audio_transcript.delta":
              options.onAgentResponse?.(message.delta);
              break;
              
            case "conversation.item.input_audio_transcription.completed":
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
              setLastError(message.error?.message || "Realtime error");
              options.onError?.(message.error?.message || "Realtime error");
              break;
          }
        } catch (err) {
          console.error("[Realtime] Message parse error:", err);
        }
      };

      dc.onerror = (err) => {
        console.error("[Realtime] Data channel error:", err);
        const msg = "Connection error";
        setLastError(msg);
        options.onError?.(msg);
      };

      dc.onclose = () => {
        console.log("[Realtime] Data channel closed");
        updateStatus("idle");
      };

      // STEP 6: WebRTC handshake
      let offer: RTCSessionDescriptionInit;
      try {
        offer = await pc.createOffer();
      } catch (e) {
        const f = formatError(e);
        const msg = `[createOffer] ${f.name}: ${f.message}`;
        setLastError(msg);
        options.onError?.(msg);
        disconnect();
        return;
      }

      try {
        await pc.setLocalDescription(offer);
      } catch (e) {
        const f = formatError(e);
        const msg = `[setLocalDescription] ${f.name}: ${f.message}`;
        setLastError(msg);
        options.onError?.(msg);
        disconnect();
        return;
      }

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
        const msg = error?.message || "Failed to establish connection";
        setLastError(msg);
        options.onError?.(msg);
        disconnect();
        return;
      }

      const answerSdp = data.answer_sdp as string;
      try {
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      } catch (e) {
        const f = formatError(e);
        const msg = `[setRemoteDescription] ${f.name}: ${f.message}`;
        setLastError(msg);
        options.onError?.(msg);
        disconnect();
        return;
      }

      console.log("[Realtime] Connection established successfully");
    } catch (err) {
      console.error("[Realtime] Connect error:", err);
      const f = formatError(err);
      const msg = `[connect] ${f.name}: ${f.message}`;
      setLastError(msg);
      options.onError?.(msg);
      updateStatus("idle");
    } finally {
      connectInFlightRef.current = false;
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
    error: lastError,
    connect,
    disconnect,
    isConnected: status !== "idle" && status !== "connecting",
    isIOSPWA: isIOSDevice() && isPWAStandalone(),
  };
}
