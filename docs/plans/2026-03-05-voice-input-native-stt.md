---
version:
pr:
created: 2026-03-05
---

# Phase 5: Voice Input — Native Speech-to-Text for Tauri Mobile

## Context

Voice input is already implemented for web/PWA via the Web Speech API:
- `frontend/src/hooks/use-voice-input.ts` — wraps `webkitSpeechRecognition`
- Mic button in `task-quick-add.tsx` and search palette (`search-palette.tsx`)
- Transcribed text feeds into `useSmartInput.setInput()` → parsed like typed input

**Problem:** Web Speech API is **not available** in WKWebView (iOS) or Android WebView.
The existing hook detects this (`isSupported: false`) and hides the mic button entirely.
On Tauri mobile, users get no voice input at all.

### Research Findings

| Platform | Web Speech API | Native API |
|----------|---------------|------------|
| Safari (web/PWA) | ✅ Works | N/A |
| Chrome (web) | ✅ Works | N/A |
| iOS WKWebView (Tauri) | ❌ Not available ([WebKit bug #225298](https://bugs.webkit.org/show_bug.cgi?id=225298)) | `SFSpeechRecognizer` (iOS 10+, on-device iOS 13+) |
| Android WebView (Tauri) | ❌ Not available ([Chromium issue #40417848](https://issues.chromium.org/issues/40417848)) | `SpeechRecognizer` API (on-device Android 12+) |
| macOS/Windows/Linux (Tauri desktop) | ✅ Works (Chromium-based) | Not needed |

**Community plugin:** [`tauri-plugin-stt`](https://github.com/brenogonzaga/tauri-plugin-stt) (11 stars, v0.1.x) wraps native APIs on iOS/Android and Vosk on desktop. Early stage but correct architecture. We'll use it as a starting point — if it works, use as-is; if not, fork and fix.

## Architecture Decision

**Hybrid approach with runtime detection:**

```
Web/PWA/Desktop Tauri  →  Web Speech API (existing, already works)
iOS/Android Tauri      →  tauri-plugin-stt (native SFSpeechRecognizer / SpeechRecognizer)
```

The existing `useVoiceInput` hook becomes the **unified frontend interface**. It gains a second backend: when `isTauri && (isIOS || isAndroid)`, it uses the Tauri plugin IPC commands instead of `webkitSpeechRecognition`. The hook's public API (`isSupported`, `isListening`, `startListening`, `stopListening`) stays identical — consumers don't change.

## File Summary

### Modified Files
| File | Change |
|------|--------|
| `frontend/src/hooks/use-voice-input.ts` | Add Tauri native STT backend alongside Web Speech API. Runtime detection picks the right one. |
| `src-tauri/Cargo.toml` | Add `tauri-plugin-stt` dependency |
| `src-tauri/src/lib.rs` | Register `tauri-plugin-stt` plugin |
| `src-tauri/capabilities/default.json` | Add STT plugin permissions |
| `src-tauri/gen/apple/*/Info.plist` | Add `NSSpeechRecognitionUsageDescription` + `NSMicrophoneUsageDescription` |
| `src-tauri/gen/android/app/src/main/AndroidManifest.xml` | Add `RECORD_AUDIO` permission |

### New Files
| File | Purpose |
|------|---------|
| `frontend/src/lib/tauri-stt.ts` | Thin wrapper around `tauri-plugin-stt` JS bindings — `invoke()` calls for start/stop/check-permission |

### No Changes Needed
- `task-quick-add.tsx` — already has mic button wired to `useVoiceInput`
- `search-palette.tsx` — already has mic button wired to `useVoiceInput`
- `use-smart-input.ts` — voice feeds text via `setInput()`, no modification needed
- `task-parser.ts` — parses transcribed text identically to typed text
- Backend (Python) — no changes, voice is frontend-only

## Implementation Steps

### Step 1: Install tauri-plugin-stt

```bash
cd src-tauri
cargo add tauri-plugin-stt
```

Add to `frontend/package.json`:
```bash
cd frontend
npm install tauri-plugin-stt-api  # JS bindings (check actual package name)
```

Register in `src-tauri/src/lib.rs`:
```rust
.plugin(tauri_plugin_stt::init())
```

### Step 2: Platform Permissions

**iOS** (`src-tauri/gen/apple/*/Info.plist`):
```xml
<key>NSSpeechRecognitionUsageDescription</key>
<string>Whendoist uses speech recognition for voice task input.</string>
<key>NSMicrophoneUsageDescription</key>
<string>Whendoist needs microphone access for voice task input.</string>
```

**Android** (`src-tauri/gen/android/app/src/main/AndroidManifest.xml`):
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

**Capabilities** (`src-tauri/capabilities/default.json`):
Add the STT plugin permissions (exact format depends on plugin's declared permissions).

### Step 3: Create Tauri STT Wrapper

`frontend/src/lib/tauri-stt.ts`:

```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface TauriSttCallbacks {
  onResult: (transcript: string, isFinal: boolean) => void;
  onError: (error: string) => void;
  onEnd: () => void;
}

export async function checkSttPermission(): Promise<boolean> {
  return invoke<boolean>("plugin:stt|check_permission");
}

export async function requestSttPermission(): Promise<boolean> {
  return invoke<boolean>("plugin:stt|request_permission");
}

export async function startSttRecognition(
  lang: string,
  callbacks: TauriSttCallbacks,
): Promise<UnlistenFn> {
  const unlisten = await listen<{ transcript: string; is_final: boolean }>(
    "stt://result",
    (event) => {
      callbacks.onResult(event.payload.transcript, event.payload.is_final);
    },
  );

  await invoke("plugin:stt|start", { lang });
  return unlisten;
}

export async function stopSttRecognition(): Promise<void> {
  await invoke("plugin:stt|stop");
}
```

> **Note:** The actual IPC command names depend on `tauri-plugin-stt`'s API. Read the plugin source and adjust. The above is a reasonable guess based on the plugin's README.

### Step 4: Update use-voice-input.ts

Add Tauri native backend with runtime detection:

```typescript
import { isTauri } from "@/hooks/use-device";

// Detect if we need native STT (Tauri mobile where Web Speech API is unavailable)
const needsNativeStt = isTauri && !SpeechRecognitionImpl;

export function useVoiceInput({ onTranscript, lang }: UseVoiceInputOptions): UseVoiceInputReturn {
  // ... existing state ...

  // For Tauri native: lazy-import tauri-stt.ts to avoid bundling on web
  const startListening = useCallback(async (currentText = "") => {
    if (needsNativeStt) {
      // Dynamic import to tree-shake on web builds
      const { startSttRecognition, requestSttPermission } = await import("@/lib/tauri-stt");

      const hasPermission = await requestSttPermission();
      if (!hasPermission) {
        toast.error("Microphone permission denied.");
        return;
      }

      prefixRef.current = currentText.trimEnd();
      setIsListening(true);

      unlistenRef.current = await startSttRecognition(
        lang ?? navigator.language ?? "en-US",
        {
          onResult: (transcript, isFinal) => {
            const prefix = prefixRef.current;
            const combined = prefix ? `${prefix} ${transcript}` : transcript;
            onTranscriptRef.current(combined);
          },
          onError: (error) => {
            toast.error(error || "Voice input failed.");
            setIsListening(false);
          },
          onEnd: () => setIsListening(false),
        },
      );
    } else {
      // Existing Web Speech API path (unchanged)
      // ...
    }
  }, [lang]);

  return {
    isSupported: !!SpeechRecognitionImpl || needsNativeStt,
    isListening,
    startListening,
    stopListening,
  };
}
```

Key changes:
- `isSupported` now returns `true` on Tauri mobile (enables mic button)
- `startListening` dynamically imports Tauri STT when needed
- `stopListening` calls plugin stop on Tauri, existing `recognition.stop()` on web
- All consumers (`task-quick-add.tsx`, search palette) work without changes

### Step 5: Test on Each Platform

| Platform | Expected Behavior |
|----------|-------------------|
| Web (Chrome/Safari) | Existing Web Speech API, no change |
| PWA (iOS Safari) | Existing Web Speech API, no change |
| Tauri Desktop | Web Speech API (Chromium WebView supports it) |
| Tauri iOS | Native `SFSpeechRecognizer` via plugin → mic works |
| Tauri Android | Native `SpeechRecognizer` via plugin → mic works |

## UX Decisions

### Tap to start/stop (not hold-to-talk)
- Matches existing implementation in `task-quick-add.tsx` (toggle button)
- Hold-to-talk is awkward when you also need to read the screen
- Tap mic → icon pulses red → speak → tap again or auto-stops after silence

### Visual Feedback
Already implemented:
- Listening: red color + `animate-pulse` CSS class
- Icon swaps: `Mic` → `MicOff` while recording
- No additional UI needed for MVP

### Auto-stop Behavior
- Web Speech API: `continuous: false` — stops after a pause in speech (existing)
- Native plugin: same behavior — `SFSpeechRecognizer` and Android `SpeechRecognizer` both support auto-stop on silence
- User can also tap the button to stop early

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| `tauri-plugin-stt` is immature (11 stars) | Test thoroughly on both platforms. If broken, fork and fix — the native API calls are ~100-200 lines per platform. |
| Plugin JS bindings don't match our assumptions | Read plugin source first. The wrapper in `tauri-stt.ts` isolates us from API changes. |
| Permission denied on first launch | Request permission on first mic tap, not on app launch. Show clear toast on denial. |
| Offline support varies | iOS: on-device recognition works (iOS 13+). Android: requires downloaded language packs. Show "unavailable offline" toast if network recognition fails. |

## Verification Checklist

- [ ] Mic button visible on Tauri iOS
- [ ] Mic button visible on Tauri Android
- [ ] Tap mic → permission prompt (first time)
- [ ] Speak "Buy groceries hash personal bang high tomorrow thirty minutes"
- [ ] Text appears in input field in real-time (interim results)
- [ ] Smart parser extracts: domain=personal, impact=high, date=tomorrow, duration=30m
- [ ] Tap mic again → stops recording
- [ ] Auto-stops after silence
- [ ] Web/PWA still works (regression test)
- [ ] Desktop Tauri still works (regression test)
- [ ] Permission denied → clear error toast
- [ ] No microphone → clear error toast

## Open Questions

1. **Plugin JS package name:** Need to verify the actual npm package name for `tauri-plugin-stt`'s JavaScript bindings (may be `@anthropic-labs/tauri-plugin-stt` or similar, or may need to import directly from the plugin).

2. **Event format:** The Tauri event payload shape (`stt://result` with `transcript` and `is_final`) needs verification against the actual plugin implementation.

3. **Voice input for token syntax:** Users saying "hashtag personal" or "bang high" is awkward. For V2, consider a post-processing step that maps spoken phrases like "domain personal, priority high" to the token syntax. Out of scope for this phase.
