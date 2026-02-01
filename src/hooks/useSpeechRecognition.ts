import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";

interface UseSpeechRecognitionOptions {
  onTranscript?: (transcript: string) => void;
  onInterimTranscript?: (transcript: string) => void;
  continuous?: boolean;
  lang?: string;
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const {
    onTranscript,
    onInterimTranscript,
    continuous = true,
    lang = "en-US",
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isListeningRef = useRef(false);

  // Check browser support on mount
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
  }, []);

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

      if (finalTranscript && onTranscript) {
        onTranscript(finalTranscript);
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
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      
      if (event.error === "not-allowed") {
        toast.error("Microphone permission denied. Please allow microphone access.");
        isListeningRef.current = false;
        setIsListening(false);
      } else if (event.error === "no-speech") {
        // Normal timeout, will auto-restart via onend
      } else if (event.error === "aborted") {
        // User stopped, no action needed
      } else {
        toast.error(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onstart = () => {
      setIsListening(true);
    };

    return recognition;
  }, [continuous, lang, onTranscript, onInterimTranscript]);

  // CRITICAL: Must be called from a user gesture (e.g., button click)
  const startListening = useCallback(() => {
    if (!isSupported) {
      toast.error("Speech recognition is not supported in this browser");
      return;
    }

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
  }, [isSupported, initRecognition]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

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
      if (recognitionRef.current) {
        isListeningRef.current = false;
        recognitionRef.current.stop();
      }
    };
  }, []);

  return {
    isListening,
    isSupported,
    startListening,
    stopListening,
    toggleListening,
  };
}
