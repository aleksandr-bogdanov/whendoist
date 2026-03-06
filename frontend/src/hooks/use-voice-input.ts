import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isTauri } from "@/hooks/use-device";
import i18n from "@/lib/i18n";

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

/**
 * On Tauri mobile (iOS WKWebView / Android WebView), Web Speech API is
 * unavailable. We use tauri-plugin-stt for native speech recognition instead.
 * Desktop Tauri has Web Speech API via Chromium, so it uses the existing path.
 */
const needsNativeStt = isTauri && !SpeechRecognitionImpl;

/** Map i18n language to BCP-47 speech recognition code */
function getSpeechLang(): string {
  const lang = i18n.resolvedLanguage ?? "en";
  const map: Record<string, string> = {
    en: "en-US",
    de: "de-DE",
    fr: "fr-FR",
    es: "es-ES",
    it: "it-IT",
    pt: "pt-BR",
    ru: "ru-RU",
  };
  return map[lang] ?? navigator.language ?? "en-US";
}

export interface UseVoiceInputOptions {
  /** Called with the full input text (prefix + transcript) on each recognition event. */
  onTranscript: (text: string) => void;
  /** BCP-47 language code (default: derived from i18n language). */
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
  // Cleanup function for Tauri native STT session (async — returns Promise)
  const nativeCleanupRef = useRef<(() => Promise<void>) | null>(null);
  // Guards against unmount-during-async and double-tap races
  const mountedRef = useRef(true);
  const startingNativeRef = useRef(false);

  const stopListening = useCallback(() => {
    if (needsNativeStt) {
      nativeCleanupRef.current?.();
      nativeCleanupRef.current = null;
      // Defensive: don't rely solely on the state-change event chain
      setIsListening(false);
    } else {
      recognitionRef.current?.stop();
    }
  }, []);

  const startListening = useCallback(
    (currentText = "") => {
      if (needsNativeStt) {
        // Guard: prevent double-tap from starting concurrent sessions
        if (startingNativeRef.current) return;
        startingNativeRef.current = true;

        // ── Tauri native STT path (iOS / Android) ──────────────────────
        // Dynamic import keeps tauri-plugin-stt out of the web bundle
        import("@/lib/tauri-stt").then(async ({ ensureSttPermission, startSttSession }) => {
          try {
            const hasPermission = await ensureSttPermission();
            if (!hasPermission) {
              toast.error(i18n.t("voice.permissionDenied"));
              return;
            }

            // Bail if unmounted during the permission check
            if (!mountedRef.current) return;

            // Tear down any existing session (awaited to avoid ALREADY_LISTENING)
            await nativeCleanupRef.current?.();

            prefixRef.current = currentText.trimEnd();
            setIsListening(true);

            const cleanup = await startSttSession(lang ?? getSpeechLang(), {
              onResult: (transcript, _isFinal) => {
                if (!mountedRef.current) return;
                const prefix = prefixRef.current;
                const combined = prefix ? `${prefix} ${transcript}` : transcript;
                onTranscriptRef.current(combined);
              },
              onError: (message) => {
                if (!mountedRef.current) return;
                toast.error(message || i18n.t("voice.failedGeneric"));
                setIsListening(false);
                nativeCleanupRef.current = null;
              },
              onEnd: () => {
                if (!mountedRef.current) return;
                setIsListening(false);
                nativeCleanupRef.current = null;
              },
            });

            // If unmounted while startSttSession was running, clean up immediately
            if (!mountedRef.current) {
              cleanup();
              return;
            }

            nativeCleanupRef.current = cleanup;
          } finally {
            startingNativeRef.current = false;
          }
        });
        return;
      }

      // ── Web Speech API path (browsers / desktop Tauri) ─────────────
      if (!SpeechRecognitionImpl) return;

      // Tear down any existing instance
      recognitionRef.current?.abort();

      prefixRef.current = currentText.trimEnd();

      const recognition = new SpeechRecognitionImpl();
      recognition.lang = lang ?? getSpeechLang();
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
          toast.error(i18n.t("voice.micDenied"));
        } else if (event.error === "audio-capture") {
          toast.error(i18n.t("voice.noMic"));
        } else if (event.error === "network") {
          toast.error(i18n.t("voice.unavailableOffline"));
        } else if (event.error !== "aborted" && event.error !== "no-speech") {
          toast.error(i18n.t("voice.failed"));
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
      mountedRef.current = false;
      recognitionRef.current?.abort();
      nativeCleanupRef.current?.();
    };
  }, []);

  return {
    isSupported: !!SpeechRecognitionImpl || needsNativeStt,
    isListening,
    startListening,
    stopListening,
  };
}
