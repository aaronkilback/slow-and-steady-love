import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";

interface UseSpeechRecognitionOptions {
  onTranscript?: (transcript: string) => void;
  onInterimTranscript?: (transcript: string) => void;
  onSpeechEnd?: () => void; // Called when user stops speaking (silence detected)
  continuous?: boolean;
  lang?: string;
  silenceTimeout?: number; // ms of silence before triggering onSpeechEnd
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const {
    onTranscript,
    onInterimTranscript,
    onSpeechEnd,
    continuous = true,
    lang = "en-US",
    silenceTimeout = 1500, // 1.5 seconds of silence triggers end
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isListeningRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const hasSpokenRef = useRef(false);

  // Check browser support on mount
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    if (hasSpokenRef.current && onSpeechEnd) {
      silenceTimerRef.current = window.setTimeout(() => {
        // User has spoken and now gone silent - trigger end
        if (isListeningRef.current && hasSpokenRef.current) {
          onSpeechEnd();
        }
      }, silenceTimeout);
    }
  }, [clearSilenceTimer, onSpeechEnd, silenceTimeout]);

  const initRecognition = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("Speech recognition not supported in this browser");
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // User is speaking - reset silence timer
      if (finalTranscript || interimTranscript) {
        hasSpokenRef.current = true;
        clearSilenceTimer();
      }

      if (finalTranscript && onTranscript) {
        onTranscript(finalTranscript);
        // Start silence timer after final transcript
        startSilenceTimer();
      }

      if (interimTranscript && onInterimTranscript) {
        onInterimTranscript(interimTranscript);
      }
    };

    // Auto-restart on silence timeout if still listening
    recognition.onend = () => {
      if (isListeningRef.current) {
        try {
          recognition.start();
        } catch (e) {
          // Recognition may already be started
          console.log("Recognition restart skipped:", e);
        }
      } else {
        setIsListening(false);
        clearSilenceTimer();
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      
      if (event.error === "not-allowed") {
        toast.error("Microphone permission denied. Please allow microphone access.");
        isListeningRef.current = false;
        setIsListening(false);
        clearSilenceTimer();
      } else if (event.error === "no-speech") {
        // Normal timeout, will auto-restart via onend
        // If user had spoken before, trigger speech end
        if (hasSpokenRef.current && onSpeechEnd) {
          onSpeechEnd();
        }
      } else if (event.error === "aborted") {
        // User stopped, no action needed
        clearSilenceTimer();
      } else {
        toast.error(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onstart = () => {
      setIsListening(true);
    };

    return recognition;
  }, [continuous, lang, onTranscript, onInterimTranscript, clearSilenceTimer, startSilenceTimer, onSpeechEnd]);

  // CRITICAL: Must be called from a user gesture (e.g., button click)
  const startListening = useCallback(() => {
    if (!isSupported) {
      toast.error("Speech recognition is not supported in this browser");
      return;
    }

    // Reset state for new listening session
    hasSpokenRef.current = false;
    clearSilenceTimer();

    if (!recognitionRef.current) {
      recognitionRef.current = initRecognition();
    }

    if (recognitionRef.current) {
      isListeningRef.current = true;
      try {
        recognitionRef.current.start();
      } catch (e) {
        // May already be started
        console.log("Recognition start error:", e);
      }
    }
  }, [isSupported, initRecognition, clearSilenceTimer]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    hasSpokenRef.current = false;
    clearSilenceTimer();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, [clearSilenceTimer]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSilenceTimer();
      if (recognitionRef.current) {
        isListeningRef.current = false;
        recognitionRef.current.stop();
      }
    };
  }, [clearSilenceTimer]);

  return {
    isListening,
    isSupported,
    startListening,
    stopListening,
    toggleListening,
  };
}
