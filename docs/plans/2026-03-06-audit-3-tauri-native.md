---
version:
pr:
created: 2026-03-06
---

# Audit 3: Tauri & iOS Native Layer (v0.57.0 → v0.64.1)

Scope: All Tauri and iOS-specific code — Rust commands, Swift plugins, IPC wrappers,
Tauri config, keyboard avoidance, and iOS-specific frontend code.

---

## Findings

### 1. IPC Timeout & Circuit Breaker

#### **[SEV: High] Biometric IPC commands have no timeout protection**
- **Files:** `frontend/src/lib/tauri-biometric.ts` (all functions)
- **Description:** All five biometric IPC calls (`checkBiometricAvailability`, `storeEncryptionKey`,
  `retrieveEncryptionKey`, `hasStoredKey`, `clearEncryptionKey`) use raw `invoke()` without
  `Promise.race()` timeout. Every other IPC wrapper in the codebase uses a 1.5s timeout.
  `storeEncryptionKey()` and `retrieveEncryptionKey()` are especially dangerous — they trigger
  the native biometric prompt which can hang indefinitely if the system dialog stalls.
  Additionally, `storeEncryptionKey()` and `retrieveEncryptionKey()` have **no try-catch** —
  exceptions propagate directly to `crypto-store.ts`.
- **Platform impact:** App UI freezes while awaiting biometric prompt. User cannot interact
  with the app until the biometric system times out naturally (which may take 30+ seconds
  or never resolve on certain iOS versions). Called from Zustand store actions that are
  awaited by UI components.

#### **[SEV: Low] Circuit breaker never resets — requires app restart**
- **Files:** `frontend/src/lib/tauri-cache.ts` (`sqlAvailable`),
  `frontend/src/lib/tauri-token-store.ts` (`storeAvailable`)
- **Description:** Both modules use a boolean flag that transitions from `true` to `false`
  on first timeout/error, and **never transitions back**. Once a service is marked broken,
  it stays broken for the entire app session. There is no half-open state, no retry after
  a cooldown, and no manual reset mechanism.
- **Platform impact:** If the SQLite plugin or token store times out once during a slow cold
  start, offline caching and token persistence are disabled for the entire session. Only an
  app restart recovers the service. This is acceptable for dev-mode IPC hangs (the original
  motivation) but overly aggressive for transient failures in production.

#### **[SEV: Low] 1.5s timeout constant duplicated across 5 files**
- **Files:** `tauri-notifications.ts`, `tauri-widgets.ts`, `tauri-native-tabbar.ts`,
  `tauri-cache.ts`, `tauri-token-store.ts`
- **Description:** The 1.5s timeout is hardcoded in each file (some as named constants like
  `INVOKE_TIMEOUT_MS = 1_500`, others inline in `Promise.race`). No shared constant exists.
  Project convention (CLAUDE.md Rule 6) says to use `app.constants` for magic numbers;
  this applies to frontend too.
- **Platform impact:** No functional impact, but maintenance burden if timeout needs tuning.

---

### 2. WKWebView POST Body Workaround

#### **[SEV: Medium] X-Tauri-Body header limited to ~6KB payload**
- **Files:** `frontend/src/lib/api-client.ts:51-61`, `frontend/vite.config.ts:23-42,56-84`
- **Description:** The workaround Base64-encodes JSON bodies into the `X-Tauri-Body` HTTP
  header. Base64 inflates size by ~33%, and Node.js/Vite default header limit is 16KB,
  so max payload is ~12KB raw JSON. While current payloads are small (task updates < 2KB),
  there is no size guard or fallback. If a user creates a task with very long notes or
  description, the request silently fails with HTTP 431.
- **Platform impact:** Dev-only (gated by `isTauri && import.meta.env.DEV`). In production,
  Tauri connects directly to the backend without proxy. However, during development on
  physical iOS devices, large payloads would fail silently.

#### **[SEV: Low] Workaround logic duplicated between dev and preview proxy configs**
- **Files:** `frontend/vite.config.ts:23-42` (dev), `frontend/vite.config.ts:56-84` (preview)
- **Description:** The `proxyReq` handler that decodes `X-Tauri-Body` is copy-pasted for
  both dev and preview server configurations. Should be extracted to a shared function.
- **Platform impact:** Maintenance burden only.

---

### 3. Native UITabBar

#### **[SEV: Low] evaluateJavaScript calls have no error handling**
- **Files:** `frontend/src-tauri/ios/Sources/NativeTabBarPlugin.swift` (lines ~203, 217, 269)
- **Description:** All three JS evaluation calls (`__nativeTabBarEvent`, `__keyboardEvent`)
  pass `completionHandler: nil`. If the JS bridge function is undefined (e.g., page still
  loading after navigation) or throws, the error is silently lost. This means tab navigation
  events or keyboard height updates can be dropped without any logging.
- **Platform impact:** Tab bar indicator may desync from actual page. Keyboard repositioning
  may not fire on first input focus after cold navigation. UX degradation, not crash.

#### **[SEV: Low] Tab bar route detection uses prefix matching**
- **Files:** `NativeTabBarPlugin.swift` — `authenticatedPrefixes` array
- **Description:** Routes like `/thoughts-archive` would match the `/thoughts` prefix and
  incorrectly show the tab bar. Currently no such routes exist, but this is fragile if
  new routes are added with overlapping prefixes.
- **Platform impact:** Tab bar may appear on unexpected routes. UX issue only.

#### **No retain cycles or memory leaks found.**
- `webView` and `tabBar` are `weak var`
- All closures use `[weak self]`
- `deinit` properly invalidates KVO observation, removes NotificationCenter observers,
  and removes WKScriptMessageHandler

---

### 4. Speech-to-Text

#### **[SEV: Low] STT wrapper exists but implementation is minimal**
- **Files:** `frontend/src/lib/tauri-stt.ts`
- **Description:** The STT integration uses `tauri-plugin-stt` with proper Tauri detection
  and fallback to Web Speech API for non-Tauri platforms. Permission handling defers to the
  native plugin. No issues found in the wrapper code itself — the plugin handles microphone
  permission prompts and error states internally.
- **Platform impact:** None currently. STT works through the plugin's standard flow.

---

### 5. Biometric Auth & Keychain Storage

#### **[SEV: Medium] Encryption key stored in JSON file, not hardware-backed keychain**
- **Files:** `frontend/src-tauri/src/commands/biometric.rs`
- **Description:** The encryption key is stored via `tauri-plugin-store`, which writes a JSON
  file to the app's private data directory. This is **not** backed by iOS Keychain or the
  Secure Enclave. On jailbroken devices, the file is accessible. The code documents this
  limitation and references `tauri-plugin-keystore` as the upgrade path when its JS API
  stabilizes.
- **Platform impact:** Security degradation on jailbroken devices. Encryption key can be
  extracted without biometric auth by accessing the app sandbox directly. The biometric
  gate in Rust only protects the IPC command, not the storage itself.

#### **[SEV: Low] Biometric auth disables device credential fallback**
- **Files:** `biometric.rs` — `allow_device_credential: false`
- **Description:** PIN/password fallback is explicitly disabled. If Face ID fails (glasses,
  mask, lighting), the user must retry biometric — there's no password escape hatch.
  This is a deliberate security decision but may frustrate users.
- **Platform impact:** UX friction. User must retry Face ID or restart the app to use
  password-based auth instead (if available).

---

### 6. Local Notifications

#### **[SEV: Medium] Push token stored only in memory — lost on app restart**
- **Files:** `frontend/src-tauri/src/lib.rs:84-86`, `src/commands/notifications.rs`
- **Description:** The push notification token obtained from
  `register_for_push_notifications()` is stored in `PushTokenState(Mutex<Option<String>>)` —
  an in-memory Rust state. If the app is killed before the frontend registers the token with
  the backend, the token is permanently lost until the next push registration.
- **Platform impact:** Push notifications may not work after app restart until the OS
  re-issues the token (which happens on next `register_for_push_notifications()` call).
  Risk is low because iOS re-registers on launch, but there's a window where push is
  broken.

#### **[SEV: Low] Notifications fire immediately — no native scheduling**
- **Files:** `notifications.rs` — `schedule_reminder()`
- **Description:** The `schedule_reminder` command stores metadata but fires the notification
  immediately via `.show()`. The frontend is responsible for calling this at the right time.
  There is no native `UNCalendarNotificationTrigger` or `UNTimeIntervalNotificationTrigger`.
  If the app is backgrounded or killed, scheduled reminders won't fire.
- **Platform impact:** Missed reminders when app is not in foreground. This is a known
  limitation of the current architecture.

---

### 7. Tauri Capabilities & Security

#### **[SEV: Medium] CSP completely disabled on iOS**
- **Files:** `frontend/src-tauri/tauri.ios.conf.json` — `"security": { "csp": null }`
- **Description:** Content Security Policy is set to `null` on iOS, removing all XSS
  protection from the webview. The comment explains this is due to WKWebView's inconsistent
  CSP enforcement on iOS 16+, making it pragmatic. However, it means any XSS vulnerability
  in the app has no CSP mitigation on iOS.
- **Platform impact:** If an attacker can inject script (e.g., via unsanitized task content),
  there is no CSP to prevent execution. Mitigated by: (1) Tauri's `tauri://` same-origin
  policy, (2) React's built-in XSS protection, (3) encrypted task content.

#### **[SEV: Low] CSP uses unsafe-inline for scripts and styles**
- **Files:** `frontend/src-tauri/tauri.conf.json` — `csp` field
- **Description:** Desktop CSP includes `script-src 'self' 'unsafe-inline'` and
  `style-src 'self' 'unsafe-inline'`. The `unsafe-inline` for scripts weakens XSS defense.
  Required by Tailwind v4's JIT and inline event handlers, but should be reviewed if
  moving to CSP nonces.
- **Platform impact:** Reduced XSS protection on desktop Tauri. Low severity because
  Tauri's IPC boundary and React's escaping provide defense-in-depth.

#### **[SEV: Low] connect-src uses wildcard subdomain**
- **Files:** `tauri.conf.json` — `connect-src 'self' https://whendoist.com https://*.whendoist.com`
- **Description:** The `*.whendoist.com` wildcard allows connections to any subdomain.
  Should be restricted to specific subdomains (`api.whendoist.com`) if possible.
- **Platform impact:** Minimal. Attacker would need to control a `*.whendoist.com` subdomain.

#### **Capabilities are minimal and appropriate.**
- `default.json`: core, store, sql, notifications — no filesystem/shell
- `mobile.json`: biometric, stt — mobile-only features
- `desktop.json`: only `shell:allow-open` (not `shell:execute`)

---

### 8. Keyboard Avoidance

#### **[SEV: Low] No special handling for iPad floating keyboard**
- **Files:** `NativeTabBarPlugin.swift` (keyboard event), `frontend/src/lib/tauri-keyboard.ts`,
  `frontend/src/styles/globals.css:410-442`
- **Description:** The keyboard avoidance system uses keyboard height from
  `UIKeyboardFrameEndUserInfoKey` to reposition content. For iPad's floating keyboard,
  the height is reported correctly but the keyboard may be positioned in the middle of
  the screen, not at the bottom. Content pushed up by the full keyboard height may create
  unnecessary empty space below.
- **Platform impact:** Minor visual issue on iPad only. Content is still accessible;
  just not optimally positioned when floating keyboard is active.

#### **Keyboard avoidance architecture is well-designed.**
- Three-layer bridge: Swift → JS → CSS with proper safe-area subtraction
- Animation duration synchronized from native `UIKeyboardAnimationDurationUserInfoKey`
- Conflict prevention with PWA viewport detection via CSS variable guard
- `--keyboard-height` correctly subtracts `--native-safe-area-bottom` to prevent
  double-counting the home indicator area

---

### 9. Additional Findings

#### **[SEV: Low] Tauri framework has intentional memory leak**
- **Files:** `frontend/src-tauri/ios/.tauri/tauri-api/Sources/Tauri/Tauri.swift` (~line 89)
- **Description:** Framework code contains `let _ = Unmanaged.passRetained(error)` with
  a comment "TODO: app crashes without this leak". This is Tauri framework code (not app
  code) and is a known upstream issue. Each IPC error leaks a small amount of memory.
- **Platform impact:** Slow memory growth during error-heavy sessions. Not actionable at
  app level — requires upstream Tauri fix.

#### **[SEV: Low] Framework Swift code has force unwraps**
- **Files:** `frontend/src-tauri/ios/.tauri/tauri-api/Sources/Tauri/Invoke.swift` (lines 34, 37, 41)
- **Description:** IPC data deserialization uses `data(using: .utf8)!` and `as! NSDictionary`
  force unwraps. These assume IPC data is always valid UTF-8 JSON dictionaries. While this
  is guaranteed by the Rust serialization layer, a corrupted IPC message could crash the app.
- **Platform impact:** App crash on malformed IPC data. Very unlikely in practice.
  Framework code, not actionable at app level.

---

## Summary by Severity

| Severity | Count | Key Items |
|----------|-------|-----------|
| Critical | 0 | — |
| High     | 1 | Biometric IPC lacks timeout protection |
| Medium   | 4 | Encryption key not hardware-backed, push token in-memory only, CSP disabled on iOS, X-Tauri-Body size limit |
| Low      | 10 | Circuit breaker no reset, timeout constant duplication, evaluateJS silent failures, notifications fire immediately, etc. |

## Architecture Assessment

**Strengths:**
- Excellent memory management in Swift — no retain cycles, proper weak references, clean deinit
- Consistent 1.5s timeout pattern across IPC wrappers (except biometric)
- Minimal capability permissions — no over-broad access
- Well-designed keyboard avoidance with 3-layer architecture
- Proper request deduplication in cache and token store initialization
- Clean separation: Rust never touches encrypted data, frontend drives decryption

**Areas for improvement:**
1. Add timeout + circuit breaker to biometric IPC wrappers
2. Upgrade encryption key storage to `tauri-plugin-keystore` (hardware-backed)
3. Persist push token to disk via `tauri-plugin-store`
4. Add error handlers to `evaluateJavaScript` calls for debugging
5. Extract shared IPC timeout constant
