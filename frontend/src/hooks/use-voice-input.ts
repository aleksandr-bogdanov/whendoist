import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// ─── Web Speech API type declarations ─────────────────────────────────────
// TypeScript's DOM lib includes SpeechRecognitionResult/Alternative but not
// the main SpeechRecognition class or its event types. These are declared
// here until TypeScript ships them natively.

interface SpeechRecognitionEventMap {
  audioend: Event;
  audiostart: Event;
  end: Event;
  error: SpeechRecognitionErrorEvent;
  nomatch: SpeechRecognitionEvent;
  result: SpeechRecognitionEvent;
  soundend: Event;
  soundstart: Event;
  speechend: Event;
  speechstart: Event;
  start: Event;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  grammars: unknown;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;

  onaudioend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onaudiostart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onsoundend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onsoundstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;

  abort(): void;
  start(): void;
  stop(): void;

  addEventListener<K extends keyof SpeechRecognitionEventMap>(
    type: K,
    listener: (this: SpeechRecognition, ev: SpeechRecognitionEventMap[K]) => void,
  ): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
  prototype: SpeechRecognition;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

type SpeechRecognitionErrorCode =
  | "no-speech"
  | "aborted"
  | "audio-capture"
  | "network"
  | "not-allowed"
  | "service-not-allowed"
  | "bad-grammar"
  | "language-not-supported";

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: SpeechRecognitionErrorCode;
  readonly message: string;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

// ─── Implementation ───────────────────────────────────────────────────────

const SpeechRecognitionImpl =
  typeof window !== "undefined"
    ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
    : undefined;

export interface UseVoiceInputOptions {
  /** Called with the full input text (prefix + transcript) on each recognition event. */
  onTranscript: (text: string) => void;
  /** BCP-47 language code (default: browser locale or "en-US"). */
  lang?: string;
}

export interface UseVoiceInputReturn {
  /** Whether the Web Speech API is available in this environment. */
  isSupported: boolean;
  /** Whether the recognizer is actively listening. */
  isListening: boolean;
  /**
   * Start voice recognition.
   * @param currentText — existing input text; voice output is appended after it.
   */
  startListening: (currentText?: string) => void;
  /** Stop voice recognition. */
  stopListening: () => void;
}

/**
 * Wraps the Web Speech API for voice-to-text input.
 *
 * Interim results are reported via `onTranscript` for real-time feedback.
 * The callback receives `currentText + " " + transcript` so voice output
 * naturally appends to whatever the user has already typed.
 *
 * If the API is unavailable, `isSupported` is `false` and UI should hide
 * the mic button entirely.
 */
export function useVoiceInput({ onTranscript, lang }: UseVoiceInputOptions): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const prefixRef = useRef("");

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const startListening = useCallback(
    (currentText = "") => {
      if (!SpeechRecognitionImpl) return;

      // Tear down any existing instance
      recognitionRef.current?.abort();

      prefixRef.current = currentText.trimEnd();

      const recognition = new SpeechRecognitionImpl();
      recognition.lang = lang ?? navigator.language ?? "en-US";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);

      recognition.onresult = (event) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        const prefix = prefixRef.current;
        const combined = prefix ? `${prefix} ${transcript}` : transcript;
        onTranscriptRef.current(combined);
      };

      recognition.onerror = (event) => {
        if (event.error === "not-allowed") {
          toast.error("Microphone access denied. Check your browser permissions.");
        } else if (event.error === "audio-capture") {
          toast.error("No microphone found.");
        } else if (event.error === "network") {
          toast.error("Speech recognition unavailable offline on this device.");
        } else if (event.error !== "aborted" && event.error !== "no-speech") {
          toast.error("Voice input failed. Try again.");
        }
        setIsListening(false);
      };

      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    },
    [lang],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return {
    isSupported: !!SpeechRecognitionImpl,
    isListening,
    startListening,
    stopListening,
  };
}
