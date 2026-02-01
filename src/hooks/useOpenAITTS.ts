import { useState, useCallback, useRef } from "react";

interface UseOpenAITTSOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

export function useOpenAITTS(options: UseOpenAITTSOptions = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // Cancel any ongoing speech
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aegis-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "TTS request failed");
      }

      const data = await response.json();
      
      if (!data.audio) {
        throw new Error("No audio data received");
      }

      // Create audio from base64
      const audioUrl = `data:audio/mpeg;base64,${data.audio}`;
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => {
        setIsLoading(false);
        setIsSpeaking(true);
        options.onStart?.();
      };

      audio.onended = () => {
        setIsSpeaking(false);
        audioRef.current = null;
        options.onEnd?.();
      };

      audio.onerror = (e) => {
        setIsLoading(false);
        setIsSpeaking(false);
        audioRef.current = null;
        options.onError?.(new Error("Audio playback failed"));
      };

      await audio.play();
    } catch (err) {
      setIsLoading(false);
      setIsSpeaking(false);
      
      if (err instanceof Error && err.name === "AbortError") {
        return; // Cancelled intentionally
      }
      
      console.error("OpenAI TTS error:", err);
      options.onError?.(err instanceof Error ? err : new Error("TTS failed"));
    }
  }, [options]);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsLoading(false);
    setIsSpeaking(false);
  }, []);

  return {
    speak,
    stop,
    isSpeaking,
    isLoading,
    isSupported: true, // Always supported since it's server-side
  };
}
