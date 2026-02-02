import { useState, useRef, useCallback } from "react";

interface UseWhisperSTTOptions {
  onTranscript?: (transcript: string) => void;
  onError?: (error: Error) => void;
  onListeningChange?: (isListening: boolean) => void;
}

export function useWhisperSTT(options: UseWhisperSTTOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>("");
  const fileExtRef = useRef<"webm" | "mp4">("webm");

  const pickBestMimeType = useCallback(() => {
    // iOS Safari often does NOT support audio/webm for MediaRecorder.
    // Prefer opus/webm when available, otherwise fall back to audio/mp4.
    const preferred = [
      "audio/webm;codecs=opus",
      "audio/mp4",
      "audio/webm",
    ];
    const chosen = preferred.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const ext: "webm" | "mp4" = chosen.includes("mp4") ? "mp4" : "webm";
    return { mimeType: chosen, ext };
  }, []);

  const startListening = useCallback(async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      streamRef.current = stream;

      // Create MediaRecorder
      const { mimeType, ext } = pickBestMimeType();
      mimeTypeRef.current = mimeType;
      fileExtRef.current = ext;

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(250); // Collect data every 250ms (more stable on mobile)
      setIsListening(true);
      options.onListeningChange?.(true);
      
      console.log("Whisper STT: Started recording");
    } catch (err) {
      console.error("Whisper STT: Failed to start recording", err);
      options.onError?.(err instanceof Error ? err : new Error("Failed to access microphone"));
    }
  }, [options]);

  const stopListening = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
        setIsListening(false);
        options.onListeningChange?.(false);
        resolve(null);
        return;
      }

      const mediaRecorder = mediaRecorderRef.current;

      mediaRecorder.onstop = async () => {
        setIsListening(false);
        options.onListeningChange?.(false);
        
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Create audio blob
        const chosenMime = mimeTypeRef.current || mediaRecorder.mimeType || "";
        const ext = fileExtRef.current;
        const audioBlob = new Blob(chunksRef.current, { type: chosenMime || (ext === "mp4" ? "audio/mp4" : "audio/webm") });
        chunksRef.current = [];

        if (audioBlob.size < 1000) {
          console.log("Whisper STT: Audio too short, skipping transcription");
          resolve(null);
          return;
        }

        setIsProcessing(true);
        console.log("Whisper STT: Sending audio for transcription, size:", audioBlob.size);

        try {
          // Send to our edge function
          const formData = new FormData();
          formData.append("audio", audioBlob, `audio.${ext}`);

          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aegis-stt`,
            {
              method: "POST",
              headers: {
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: formData,
            }
          );

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Transcription failed");
          }

          const data = await response.json();
          const transcript = data.text?.trim() || "";
          
          console.log("Whisper STT: Transcription result:", transcript);
          
          if (transcript) {
            options.onTranscript?.(transcript);
          }
          
          setIsProcessing(false);
          resolve(transcript || null);
        } catch (err) {
          console.error("Whisper STT: Transcription error", err);
          setIsProcessing(false);
          options.onError?.(err instanceof Error ? err : new Error("Transcription failed"));
          resolve(null);
        }
      };

      mediaRecorder.stop();
    });
  }, [options]);

  const cancelListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
    setIsListening(false);
    setIsProcessing(false);
    options.onListeningChange?.(false);
  }, [options]);

  return {
    isListening,
    isProcessing,
    isSupported: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    startListening,
    stopListening,
    cancelListening,
  };
}
