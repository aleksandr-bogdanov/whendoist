---
version: v0.58.0
pr: 632
created: 2026-03-04
---

# Tauri v2 Mobile — iOS & Android

Wrap the existing React SPA in Tauri v2 for iOS and Android. Backend stays remote (Railway). Rust layer adds: push notifications, offline SQLite cache, biometric auth, voice input, home screen widgets.

**Why Tauri over Capacitor:** First-mover visibility in 104k-star Rust community. Rust SQLite > IndexedDB for offline. Shared crypto core. Desktop for free. 2-10 MB binaries. Security-first ACL model. Aligns with developer goals.

**Known risks:** LLM training data ~1000x less than Capacitor. Zero confirmed iOS App Store submissions. No official push notification plugin. iOS DX reportedly poor. Install `dchuk/claude-code-tauri-skills` and `hypothesi/mcp-server-tauri` MCP server before starting.

---

## Strategic Decisions

### 1. `src-tauri/` inside `frontend/`

```
whendoist/
  app/                        # Python backend (unchanged)
  frontend/
    src/                      # React SPA (unchanged)
    src-tauri/                # NEW — Tauri Rust project
      src/
        lib.rs                # Tauri setup, plugin registration
        main.rs               # Entry point
        commands/             # Rust commands invokable from frontend
          mod.rs
          notifications.rs
          offline_cache.rs
          biometric.rs
        db/                   # Local SQLite schema and queries
          mod.rs
          schema.rs
          sync.rs
      gen/                    # Auto-generated
        android/
        apple/
      tauri.conf.json
      Cargo.toml
      capabilities/
        default.json
```

### 2. Tauri detection in frontend

`use-device.ts` gets `isTauri: "__TAURI_INTERNALS__" in window`. This gates:
- PWA service worker: skip when Tauri
- API base URL: absolute `https://whendoist.com` instead of relative
- Native feature UI: reminders, biometric, voice, widgets

### 3. Token-based auth (not cookies)

Cross-origin WebView (`tauri://localhost`) can't send cookies to `https://whendoist.com`. Solution:
- New `POST /api/v1/device/token` — accepts session cookie, returns JWT
- Tauri stores JWT in `tauri-plugin-store` (secure local storage)
- Axios interceptor attaches `Authorization: Bearer <token>` when `isTauri`
- Skip CSRF entirely for bearer auth (CSRF is cookie-only vulnerability)

### 4. Conditional PWA plugin

`vite.config.ts` checks `process.env.TAURI_ENV_PLATFORM` (set by Tauri CLI):
```typescript
plugins: [
  ...(!process.env.TAURI_ENV_PLATFORM ? [VitePWA({ ... })] : []),
]
```

### 5. Android first

Better DX, no Apple Developer account for testing, easier Play Store review. Build each phase on Android first, port to iOS.

---

## Phase 0: Tauri Scaffold (3-4 days)

**Goal:** Existing React SPA runs inside Tauri WebView on Android emulator with HMR.

**Create:**
- `frontend/src-tauri/tauri.conf.json` — app ID `com.whendoist.app`, `devUrl: http://localhost:5173`, `frontendDist: ../dist`
- `frontend/src-tauri/Cargo.toml` — `tauri = "2"`, `serde`, `serde_json`
- `frontend/src-tauri/src/lib.rs` + `main.rs`
- `frontend/src-tauri/capabilities/default.json`

**Modify:**
- `frontend/vite.config.ts` — conditional VitePWA exclusion
- `frontend/package.json` — add `@tauri-apps/cli`, `@tauri-apps/api`
- `frontend/src/hooks/use-device.ts` — add `isTauri` flag
- `frontend/src/lib/api-client.ts` — conditional baseURL + bearer token auth
- `justfile` — add `tauri-android`, `tauri-ios`, `tauri-build-android`, `tauri-build-ios`

**Backend:**
- `app/routers/device_auth.py` — `POST /api/v1/device/token`, `POST /api/v1/device/refresh`, `DELETE /api/v1/device/token`
- Auth middleware: accept `Authorization: Bearer <jwt>` alongside session cookies, skip CSRF for bearer

**Verify:** `npx tauri android dev` → SPA loads, login works, HMR works. Existing web build + CI unaffected.

---

## Phase 1: Local Notifications / Reminders (5-7 days)

**Goal:** Users set reminders on tasks; Tauri fires local notifications at the specified time.

**Backend:**
- Add `reminder_minutes_before: int | None` to Task model (nullable, one reminder per task)
- Migration + update task create/update schemas
- `GET /api/v1/tasks/reminders` — tasks with active reminders (scheduled, not completed, has reminder)

**Rust:**
- `frontend/src-tauri/src/commands/notifications.rs` — `schedule_reminder(task_id, title, body, fire_at)`, `cancel_reminder(task_id)`
- Dep: `tauri-plugin-notification = "2"`

**Frontend:**
- `frontend/src/lib/tauri-notifications.ts` — wrapper around Tauri notification plugin
- `frontend/src/hooks/use-reminders.ts` — sync reminders on launch, schedule/cancel on task change
- Reminder selector in task edit forms ("No reminder", "At time", "5m", "15m", "30m", "1h", "1d before")

**Key decision:** Encryption key lives in WebView — frontend decrypts title before passing to Rust `invoke()`. Rust never touches encrypted data.

**Verify:** Create task with 1-minute reminder → notification fires → tap opens app.

---

## Phase 2: Push Notifications / Remote Reminders (7-10 days)

**Goal:** Server sends push notifications even when app is not running.

**Architecture:** Silent push + local notification (avoids dependency on immature community remote push plugins):
```
Backend cron (every 60s) → find tasks with remind_at in next minute →
send silent push via FCM/APNs → device receives → Rust creates local notification
```

**Backend:**
- `DeviceToken` model (`user_id`, `token`, `platform`, `created_at`)
- `app/routers/devices.py` — register/unregister device tokens
- `app/services/push_service.py` — FCM via `firebase-admin`, APNs via `httpx`
- `app/tasks/reminders.py` — background task, runs every 60s, sends pushes for imminent reminders
- Add `reminder_sent_at` to Task to avoid duplicate sends

**Rust:**
- Receive push notifications, create local notification from payload
- Send device token to backend on app launch
- Dep: evaluate `tauri-plugin-remote-push` or `tauri-plugin-notifications` with push feature

**Config:** Firebase project (`google-services.json`), APNs key (`.p8` file), backend env vars

**Encryption:** Push payload contains `task_id` only. Non-encrypted users get title in push; encrypted users get generic "Task reminder."

**Verify:** Create task with reminder, close app completely, notification fires at reminder time.

---

## Phase 3: Offline SQLite Cache (10-14 days)

**Goal:** Tasks cached locally in Rust SQLite. Mutations queue offline, sync on reconnect.

**Split into two sub-phases:**

### Phase 3a: Read Cache (5-6 days)
- On launch: fetch all tasks/domains from backend → store in local SQLite
- Subsequent reads from SQLite (instant, offline-capable)
- Periodic sync every 2 minutes; use `data_version` to skip no-change syncs
- Full sync (not incremental) — <1000 tasks, simple and robust

### Phase 3b: Write Queue (5-8 days)
- Offline mutations serialized to `write_queue` table
- FIFO drain on reconnect
- Dedup: complete+uncomplete = cancel, update+update = keep latest, create+delete = cancel

**Rust SQLite schema:**
```sql
CREATE TABLE cached_tasks (id INTEGER PRIMARY KEY, ...mirrors server fields..., synced_at TEXT);
CREATE TABLE cached_domains (id INTEGER PRIMARY KEY, ...mirrors server fields..., synced_at TEXT);
CREATE TABLE write_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT, entity_id INTEGER,
  operation TEXT, payload TEXT, method TEXT, path TEXT, created_at TEXT, status TEXT DEFAULT 'pending');
CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT);
```

**Frontend:**
- `frontend/src/lib/tauri-cache.ts` — abstracts Tauri SQLite behind API client interface
- `frontend/src/hooks/use-offline-sync.ts` — sync state, queue depth indicator
- `api-client.ts` — when `isTauri && !navigator.onLine`, route through Rust invoke()

**Key decision:** Cache stores ciphertext as-is (same as server). Decryption stays in WebView at TanStack Query layer. Rust never needs the encryption key.

**Deps:** `tauri-plugin-sql = { version = "2", features = ["sqlite"] }`

**Verify:** Launch online → go offline → tasks still visible → complete a task offline → reconnect → syncs to server.

---

## Phase 4: Biometric Auth (4-5 days)

**Goal:** Unlock encryption passphrase with Face ID / fingerprint.

**Flow:**
1. User enters passphrase → key derived → key exported to base64 → stored in OS keychain via biometric enrollment
2. Next launch → biometric prompt → success → key retrieved from keychain → crypto-store populated

**Plugins:** `tauri-plugin-biometric` (official) + `tauri-plugin-keystore` (community, by impierce) for iOS Keychain / Android Keystore

**Rust:** `commands/biometric.rs` — `check_biometric_availability()`, `store_encryption_key(key_data)`, `retrieve_encryption_key()`

**Frontend:**
- `frontend/src/lib/tauri-biometric.ts` — wrap biometric + keystore
- `frontend/src/stores/crypto-store.ts` — add `biometricEnabled`, `unlockWithBiometric`
- `frontend/src/components/encryption-unlock.tsx` — "Unlock with Face ID" button
- Settings: biometric toggle in encryption section

**Key decision:** Web Crypto API still does all encryption. Biometric only gates access to the stored key. Rust never performs encryption operations.

**Verify:** Enable encryption → enable biometric → close app → reopen → Face ID prompt → unlocked.

---

## Phase 5: Voice Input (2-3 days)

**Goal:** Voice-to-text for task creation, integrated with smart input parser.

**Frontend only — no Rust or backend changes.**

- `frontend/src/hooks/use-voice-input.ts` — wraps `webkitSpeechRecognition` API (available in WKWebView + Android WebView)
- Mic button in `task-quick-add.tsx` (and command palette)
- Transcribed text feeds into `parseTaskInput()` — "Buy groceries #personal !high tomorrow 30m" gets parsed like typed input

**Fallback:** If Web Speech API unavailable in WebView, try community `tauri-plugin-stt`. Check availability at runtime, show mic button only when supported.

**Verify:** Tap mic → speak → text appears in input → smart parser extracts metadata → task created.

---

## Phase 6: Home Screen Widgets (8-12 days)

**Goal:** Today's tasks + overdue count on iOS and Android home screens.

**Fully native code — no Tauri abstraction exists for widgets.**

**iOS (WidgetKit + SwiftUI):**
- Widget extension target in Xcode
- `WhendoistWidget.swift` — reads from App Group shared UserDefaults
- Tauri app writes serialized task data to App Group via Rust command

**Android (Glance Compose or RemoteViews):**
- `TodayTasksWidget.kt` — reads from SharedPreferences
- Widget info XML, layout XML
- Tauri app writes to SharedPreferences

**Rust bridge:** `commands/widgets.rs` — `update_widget_data(tasks)` writes to platform-specific shared storage

**Encryption:** Widget shows "N tasks today" count without titles when encryption enabled (keys not available outside WebView).

**Verify:** Add widget to home screen → shows today's tasks → complete task in app → widget updates.

---

## Phase 7: App Store Submission (5-7 days)

**Google Play (first):** $25 one-time → signed APK/AAB → Play Console → review (1-3 days)

**Apple App Store (second):** $99/year → code signing + provisioning → App Store Connect → review (1-7 days)

Apple Guideline 4.2 risk (lazy WebView wrappers): mitigated by native push notifications, biometric auth, offline cache, widgets, haptics — clearly not just a website wrapper.

---

## Dev Workflow

```bash
# Terminal 1: Backend
just dev-backend          # FastAPI on port 8000

# Terminal 2: Tauri + Vite (Tauri starts Vite via beforeDevCommand)
cd frontend && npx tauri android dev    # or: npx tauri ios dev
```

Tauri's `beforeDevCommand: "npm run dev"` auto-starts Vite. Vite proxies `/api` to backend. WebView loads from Vite dev server with full HMR.

---

## CI/CD

**Phases 0-3:** Add `cargo check` job only (catches Rust compile errors, runs on Linux):
```yaml
tauri-check:
  runs-on: ubuntu-latest
  steps:
    - uses: dtolnay/rust-toolchain@stable
    - run: sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev
    - run: cd frontend/src-tauri && cargo check
```

**Phase 7+:** Add Android build job (Linux, cheap). iOS build job (macOS, expensive — $0.08/min) only for releases.

---

## Phase Dependencies

```
Phase 0 (Scaffold)              ← Unlocks everything
  ├── Phase 5 (Voice)           ← Quick win, frontend-only, 2-3 days
  ├── Phase 1 (Local Notif)     ← First Rust integration
  ├── Phase 4 (Biometric)       ← Independent
  └── Phase 3 (Offline Cache)   ← Biggest effort, do after Phase 0 stable
Phase 1 → Phase 2 (Push Notif)  ← Requires Phase 1's reminder model
Phase 0 → Phase 6 (Widgets)     ← Requires native platform understanding
All → Phase 7 (App Store)       ← Do last
```

**Recommended order:** 0 → 5 → 1 → 4 → 2 → 3 → 6 → 7

**Total estimate:** 44-62 days (×1.5-2x for solo dev with other priorities)

---

## Critical Files

| File | Role in Migration |
|---|---|
| `frontend/vite.config.ts` | Conditional VitePWA exclusion |
| `frontend/src/lib/api-client.ts` | Conditional baseURL, token auth, offline routing to Rust |
| `frontend/src/hooks/use-device.ts` | `isTauri` flag gates all native feature UI |
| `frontend/src/lib/crypto.ts` | `exportKey()`/`importKey()` bridge Web Crypto ↔ native keychain |
| `app/models.py` | `reminder_minutes_before` on Task, new `DeviceToken` model |
| `app/main.py` | Register new device auth + device token routers |
