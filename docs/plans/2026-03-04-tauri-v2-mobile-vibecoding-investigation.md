---
created: 2026-03-04
---

# Tauri v2 Mobile: Vibecoding Feasibility Investigation

Deep investigation into the practical problems of building a mobile app with Tauri v2,
from the perspective of a solo developer using AI/LLM coding assistants. The app is an
existing React SPA (React 19, TypeScript, TanStack Router/Query, Tailwind v4, Vite) with
a FastAPI Python backend, to be wrapped in Tauri for iOS and Android.

---

## 1. Vibecoding / LLM Support Quality

### How well do current LLMs handle Tauri v2 mobile code generation?

**Mixed, with a significant Rust penalty.** The DevQualityEval v1.1 benchmark
(Symflower, 2025) tested 123 LLMs on Rust tasks:

- **58.5% of all LLMs scored below 80%** on Rust code generation
- Top performers: ChatGPT-4o (99.77%), o3-mini (99.44%), Claude 3.7 Sonnet thinking (95.13%)
- Average score across all models: 69.07%
- For comparison, JavaScript/TypeScript success rates are consistently in the 90%+ range
  across most models

**For Tauri specifically,** Erik Horton (who shipped 4 Tauri mobile apps in 2025) reported:
"The LLMs are pretty great at working across Rust + JavaScript + HTML/CSS." He used Claude
Sonnet 4.5 primarily, switching to GPT-5 for larger refactoring. Prototypes emerged within
10 minutes using two prompts, core features in 1-2 hours, polishing in 2-3 hours.

However, Tauri commands have specific async patterns (no borrowed arguments in async
function signatures, `Send` requirements, `tokio::Mutex` instead of `std::Mutex`) that
LLMs regularly get wrong on first attempt.

### Training data gap

The training data disparity is enormous:

| Framework | npm Weekly Downloads | GitHub Stars |
|-----------|---------------------|--------------|
| React Native | ~2M+ | 120K+ |
| @capacitor/core | 1,087,707 | 14,738 |
| @tauri-apps/cli | 1,238 | 102,776 |

Tauri has ~1000x fewer npm downloads than Capacitor. This directly impacts how much
Tauri-specific code LLMs have seen during training. React Native has 41,615 libraries
on npm; Tauri's plugin ecosystem is a fraction of that.

**Practical implication:** LLMs will frequently generate Capacitor-style or React Native-style
patterns when asked for "mobile" features. You will need explicit context steering.

### Tauri-specific AI tooling

Several tools exist to bridge the gap:

1. **hypothesi/mcp-server-tauri** - MCP server for Claude/Cursor/Windsurf that can capture
   screenshots, inspect DOM, monitor IPC calls, interact with WebView, and list simulators.
   Install: `npx -y install-mcp @hypothesi/tauri-mcp-server --client claude-code`

2. **P3GLEG/tauri-plugin-mcp** - Tauri plugin allowing AI agents to debug via screenshot
   capture, window management, DOM access, and simulated inputs.

3. **dchuk/claude-code-tauri-skills** (playbooks.com) - 9 Claude Code skills covering:
   project setup, plugins, frontend config, testing, GitHub CI/CD pipelines, debugging,
   sidecars, Node.js sidecars, and HTTP headers.

4. **Lobehub Tauri skill** - Claude skill for Tauri v2 development context.

**Verdict:** The tooling exists but is young. The MCP server is the most valuable --
it gives the LLM visual feedback from the running app, which is transformative for
debugging mobile layout issues.

---

## 2. Rust Compiler as Vibecheck Blocker

### How do Rust's strict compiler errors interact with LLM-generated code?

This is the single biggest friction point for vibecoding with Tauri.

**Benchmarked failure patterns** (DevQualityEval v1.1, Microsoft RustAssistant paper):

- Result type handling: LLMs write `assert_eq!(function(), Ok(value))` instead of unwrapping
- Unsigned integer semantics: Assigning negative values to `u64`
- Generic type information: `&[&[i32]]` multidimensional array initialization
- Vector initialization: Missing type annotations with `Vec::with_capacity()`
- Lifetimes in async: "a great many LLMs but to no avail" -- Rust forum user on async lifetimes

**Tauri-specific Rust patterns that trip up LLMs:**

```rust
// LLMs generate this (WRONG - borrowed args in async):
#[tauri::command]
async fn my_command(state: State<'_, AppState>, name: &str) -> String { ... }

// Correct pattern:
#[tauri::command]
async fn my_command(state: State<'_, AppState>, name: String) -> Result<String, String> { ... }
```

**The compiler-as-safety-net argument:** In JavaScript, LLM-generated code compiles and
runs -- bugs manifest at runtime, often in production. In Rust, wrong code fails loudly
at compile time. This is actually a vibecoding advantage: you paste the compiler error
back into the LLM, and it usually fixes it in 1-2 iterations.

Microsoft Research's RustAssistant paper found that LLMs can fix Rust compilation errors
iteratively with reasonable success, especially with the compiler error message as context.

**The catch:** Async + lifetimes + Send bounds can create error cascades that confuse both
humans and LLMs. One wrong assumption about ownership propagates through multiple functions.

**Practical impact for Whendoist:** Most Tauri commands are simple request/response wrappers
(invoke from JS -> run Rust function -> return JSON). The Rust code complexity is low:
no complex lifetime management, no concurrent data structures. The borrow checker risk is
manageable because the Rust layer is thin.

---

## 3. Three-Language Debugging (TS + Rust + Swift/Kotlin)

### What does the debugging workflow look like?

**Three separate debug surfaces, no unified tooling.**

| Layer | Debug Tool | Capability |
|-------|-----------|------------|
| TypeScript/WebView | Safari Web Inspector (iOS), Chrome DevTools (Android) | Full DOM/JS debugging |
| Rust | `println!` / `log` crate, IDE debugger (RustRover/VSCode) | Breakpoints, variable inspection |
| Native (Swift/Kotlin) | Xcode Console (iOS), Logcat (Android) | Native crash logs, native API debugging |

**Workflow for iOS:**
1. Run `cargo tauri ios dev --open` (keeps CLI process alive, opens Xcode)
2. Safari > Develop menu > select device/simulator > inspect WebView
3. Xcode > Window > Devices > Console for native logs
4. Tauri logging plugin forwards Rust logs to both console and native

**Workflow for Android:**
1. Run `cargo tauri android dev`
2. Chrome > `chrome://inspect/#devices` > select WebView
3. Logcat output is auto-forwarded by `tauri android dev`
4. Filter by app package name for relevant logs

**Cross-boundary tracing:** There is no single-step debugger that walks from JS through IPC
into Rust. You instrument each side independently. The IPC boundary is the hardest to debug
because errors may manifest in JS as "invoke failed" with minimal context about what went
wrong in Rust.

**The MCP server helps here:** hypothesi/mcp-server-tauri can capture IPC calls in real-time,
giving the AI assistant visibility into what's crossing the boundary.

**CrabNebula DevTools** (tauri-plugin-devtools) provides event logging, performance
monitoring, and metadata extraction -- but it's primarily a desktop tool.

**Practical impact for Whendoist:** Most debugging will be in the TypeScript layer (React
component logic, API calls). The Rust layer should be thin enough that `log::info!` traces
suffice. Native Swift/Kotlin code is only needed for push notifications and possibly
background sync -- these are the hardest parts to debug.

---

## 4. Push Notifications Deep Dive

### Official Tauri support: NOT YET SHIPPED

**GitHub Issue #11651** (opened Nov 12, 2024):
- 45 thumbs-up, 20 hearts, 9 rockets, 37 comments
- Multiple draft PRs exist across 4 repos (tauri, tao, plugins-workspace, tauri-docs)
- No milestone assigned
- Last activity: Dec 18, 2024
- Architecture: tao would forward `PushRegistration(PushToken)` and
  `PushRegistrationFailed(Error)` events; a new `tauri-plugin-push-notifications`
  would expose tokens to frontend

**This is not shipped as of March 2026.** You must use community plugins.

### Community Plugin: Choochmeque/tauri-plugin-notifications

| Metric | Value |
|--------|-------|
| Stars | 49 |
| Forks | 3 |
| Open Issues | 2 |
| Total Downloads | 3,825 |
| Recent Downloads | 2,332 |
| Latest Version | 0.4.3 (Feb 17, 2026) |
| First Version | 0.1.0 (Oct 7, 2025) |
| Languages | Rust, TypeScript, Kotlin, Swift |

**Features:**
- Local notifications: toast, rich content, scheduling, actions, channels
- Push notifications: FCM (Android) + APNs (iOS) via `push-notifications` feature flag
- Desktop notifications via `notify-rust`
- Active development: 15 versions in 5 months

**Risk assessment:** 49 stars, single maintainer, 5 months old. This is the most mature
option but still very young. The 2,332 recent downloads suggest growing adoption.

### Alternative: tauri-plugin-remote-push

| Metric | Value |
|--------|-------|
| Total Downloads | 4,121 |
| Recent Downloads | 140 |
| Latest Version | 1.0.10 (Jun 23, 2025) |
| Versions | 10 (all published Jun 22-23, 2025) |
| Repository | Placeholder URL in metadata |

**Red flag:** All 10 versions published in a single day. Repository URL is
`YOUR_USERNAME/tauri-plugin-remote-push`. Only 140 recent downloads vs 4,121 total
suggests it was briefly popular then abandoned. **Not recommended.**

### Silent push + local notification workaround

**Architecture:**
1. Backend sends silent/data-only push via FCM/APNs
2. Tauri app wakes briefly (native code receives push)
3. Native handler calls Rust via plugin bridge
4. Rust formats and triggers local notification via official notification plugin

**Problems:**
- iOS aggressively throttles silent pushes (Budget: ~3-4/hour if app isn't used)
- Requires writing native Swift/Kotlin code to handle push reception
- Still need FCM/APNs registration for the token -- back to needing a push plugin

### Recommended approach for Whendoist

Use **Choochmeque/tauri-plugin-notifications** with the `push-notifications` feature flag.
It's the only actively maintained option that covers both FCM and APNs. Accept the risk
of relying on a single maintainer. Contribute fixes upstream if needed.

If the official Tauri push plugin ships before you launch, migrate to it.

---

## 5. App Store Submission

### iOS App Store

**No confirmed successful Tauri mobile app submission found.** This is a significant gap
in the ecosystem.

Key data points:
- Tauri team admitted "We don't tested it ourselves yet tbh" (GitHub Discussion #6060)
- Discussion #10197 ("Tauri 2 - iOS, a Feedback") described iOS DX as "the worst developer
  experience in years"
- Tauri does have official App Store documentation with code signing guides
- The Tauri team suggested consulting Flutter's deployment docs as a reference

**Apple Guideline 4.2 (Minimum Functionality) risk:**

Apple rejects "lazy wrappers" -- apps that are just a WebView loading a URL. What saves
you from 4.2 rejection:

| Feature | Whendoist Status |
|---------|-----------------|
| Push notifications | Yes (planned) |
| Offline capability | Yes (planned SQLite cache) |
| Native navigation | Partial (WebView, but custom UI) |
| Biometric auth | Possible (Tauri has a plugin) |
| Haptic feedback | Possible |
| App-specific features | Yes (task management, calendar) |

**The key defense:** Whendoist is NOT a website wrapper. It's a full SPA with offline
support, push notifications, and device-native features. Apps like this routinely pass
App Store review when built with Capacitor or React Native's WebView.

**Tauri uses WKWebView on iOS** (the same WebView that Capacitor uses), not a browser
wrapper. Apple's real concern is apps that could "just be a bookmark" -- Whendoist has
enough native integration to avoid this.

### Google Play Store

Tauri uses an Android Studio project under the hood, so standard Android publishing
practices apply. Google Play is significantly less restrictive than Apple about WebView-
based apps. The documentation and signing setup are well-covered in Tauri's official docs.

**Verdict:** iOS submission is the higher risk due to zero confirmed precedent with Tauri
mobile and Apple's stricter review. Google Play is lower risk. Plan extra time for iOS
review iterations.

---

## 6. Build System and CI/CD

### GitHub Actions: Experimental mobile support

The official `tauri-apps/tauri-action` has experimental mobile support:

```yaml
# Android job (Ubuntu runner recommended)
- uses: tauri-apps/tauri-action@v0
  with:
    target: android
    # Outputs .apk, requires manual setup:
    # - Java 17
    # - Android SDK/NDK
    # - Rust Android targets (aarch64-linux-android, etc.)

# iOS job (macOS runner REQUIRED)
- uses: tauri-apps/tauri-action@v0
  with:
    target: ios
    # Outputs .ipa, requires manual setup:
    # - Xcode
    # - Code signing certificates/provisioning profiles
```

**Critical limitations:**
- You must install ALL system dependencies yourself (Xcode, SDKs, NDK)
- The action does NOT upload to App Store / Play Store
- Plain .ipa files are "generally useless" -- you need to submit through App Store Connect
- The action's mobile support is marked "experimental"

### Code Signing in CI

**Android:**
```yaml
env:
  ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
  ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
  ANDROID_KEY_BASE64: ${{ secrets.ANDROID_KEY_BASE64 }}
# Decode base64 keystore into keystore.properties during build
```

**iOS:**
```yaml
env:
  APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
  APPLE_API_KEY: ${{ secrets.APPLE_API_KEY }}
  APPLE_API_KEY_PATH: ${{ secrets.APPLE_API_KEY_PATH }}
# App Store Connect API key for automatic signing
```

### Build Times

| Build Type | Time |
|-----------|------|
| Clean (first build) | 5-20 minutes |
| Incremental (default) | 10-60 seconds |
| Incremental (optimized, dylib) | 3-15 seconds |
| CI full build (per platform) | 15-25 minutes |

Rust compilation dominates build time. Erik Horton: "Like all Rust projects, compiling is
where you spend all of your time." Storage is also an issue -- Rust target directories
grow large; he regularly cleaned build artifacts.

### Alternative: CrabNebula Cloud

CrabNebula Cloud offers purpose-built CDN and CI/CD for Tauri apps with GitHub Actions
integration and first-class updater support. Mobile support status is unclear -- their docs
focus on desktop distribution.

**Verdict:** CI/CD for mobile is doable but requires significant manual workflow setup.
No turnkey solution exists. Budget 1-2 days for initial CI/CD setup per platform.

---

## 7. Offline-First with Rust SQLite

### Architecture options

**Option A: Tauri SQL Plugin (tauri-plugin-sql)**
- Uses sqlx under the hood
- Supports SQLite, MySQL, PostgreSQL
- Execute queries from both Rust and JavaScript
- Built-in migration support
- Official, well-maintained

**Option B: Direct sqlx in Rust**
- Full control over connection pooling and query building
- Type-checked queries at compile time
- More Rust code to maintain

**Option C: libsql (Turso's SQLite fork) via tauri-plugin-libsql**
- AES-256-CBC encryption built in
- Embedded replica mode: local SQLite file syncs bidirectionally with Turso cloud
- `db.sync()` for manual sync, reads from local file (offline-capable)
- Production example: dev.to article describes full implementation with Drizzle ORM

### Recommended architecture for Whendoist

```
Frontend (React)
    |
    | invoke() via IPC
    |
Rust Layer (tauri commands)
    |
    |-- Online: Forward to FastAPI backend, cache response in SQLite
    |-- Offline: Serve from SQLite cache
    |
SQLite (local, via tauri-plugin-sql or sqlx)
```

**How the Rust layer intercepts API calls:**
```rust
#[tauri::command]
async fn get_tasks(db: State<'_, SqlPool>) -> Result<Vec<Task>, String> {
    match fetch_from_api().await {
        Ok(tasks) => {
            cache_to_sqlite(&db, &tasks).await;
            Ok(tasks)
        }
        Err(_) => {
            // Offline: serve from cache
            load_from_sqlite(&db).await
        }
    }
}
```

### Gotchas from real implementations

1. **IPC hangs on Rust panics** -- if libsql's URL validation calls `unwrap()` and panics,
   JavaScript `invoke()` hangs forever with no error
2. **execute_batch() fails silently** with embedded replicas -- use explicit
   `BEGIN`/`COMMIT` transactions
3. **Drizzle ORM's migrator needs Node's `fs`** module -- unavailable in WebView. Solved
   via Vite's `import.meta.glob` for bundling SQL files
4. **WebView has no direct filesystem access** -- ALL database access must go through IPC

### IndexedDB comparison

| Feature | SQLite (via Rust) | IndexedDB (in WebView) |
|---------|-------------------|----------------------|
| Query language | SQL | JavaScript API (cursor-based) |
| Performance | Fast (native) | Slower (JS engine) |
| Data capacity | Unlimited (filesystem) | Browser quota (~50MB-1GB) |
| Encryption | SQLCipher/libsql | Manual |
| Offline sync | Full control | Limited |
| Debugging | SQL tools | Browser DevTools |
| IPC overhead | Yes (every query crosses boundary) | No (same process) |
| Code complexity | Rust + IPC + JS | JS only |

**For Whendoist:** SQLite via Rust is the better choice because:
- Encryption is already a requirement (user.encryption_enabled)
- The data model is relational (tasks, domains, instances)
- No browser quota limitations
- Sync logic benefits from Rust's type safety

---

## 8. Tauri Mobile Development Experience (DX)

### Hot Reload / HMR

**Frontend HMR works** on both iOS simulator and Android emulator. All changes to HTML/CSS/JS
are reflected without rebuilding the native shell. This is the same DX as web development.

**Rust changes require recompilation.** Any change to `src-tauri/` triggers a Rust rebuild
(10-60 seconds incremental).

**Known HMR issues:**
- WebSocket connection issues due to incorrect IP configuration
- Android HMR sometimes doesn't reflect changes, requiring app restart
- Vite config needs explicit HMR WebSocket protocol and host/port settings for emulators

### Dev Loop

Erik Horton's workflow:
1. `just dev` -- develop on laptop (web browser)
2. `just android` -- test on Android emulator
3. `just debug` -- USB deploy to physical device

**Iteration speed:** "It's a game changer to go from developing to running on a phone in
less than a minute." Real-time CSS changes provide immediate feedback.

### Common Gotchas and Time Sinks

1. **Xcode is painful.** Discussion #10197: "the worst developer experience in years."
   Experienced Swift developers avoid Xcode; the .xcodeproj format is universally disliked.

2. **Plugin compatibility.** Many plugins are not supported everywhere. Documentation is
   often not up to date. The maturity was described as "alpha" rather than "beta" quality
   for iOS.

3. **Disk space.** Rust target directories + Android SDK + iOS simulator images consume
   enormous disk space. Regular cleanup is necessary.

4. **Apple environment overhead.** Apple Developer account, certificates, provisioning
   profiles, Xcode version compatibility -- all add friction that doesn't exist for web.

5. **visualViewport API fails to account for mobile keyboard height** (open issue).

6. **Edge-to-edge display** on Android/iOS is a feature request, not yet implemented.

7. **No widget support.** iOS/Android widgets are an open feature request (#9766). An
   Android-only community plugin (tauri-plugin-widget) exists but no iOS solution.

### Physical Device Testing

- **iOS:** Requires Apple Developer account. Enable Web Inspector in Settings > Safari >
  Advanced. Connect via USB, use Safari for WebView debugging.
- **Android:** Enable Developer Options + USB Debugging. ADB install. Chrome for WebView
  debugging.

---

## 9. Community Health

### Discord

- **21,732 members** in the official Tauri Discord
- Mobile channels exist but activity level is not quantifiable externally
- Over 30 people in the working group on GitHub, mostly contributing in free time

### GitHub Issues (as of March 2026)

| Label | Open | Closed |
|-------|------|--------|
| platform: Android | 77 | 98 |
| platform: iOS | 37 | 77 |
| Total mobile-related | ~114 | ~175 |

**Resolution rate:** ~60% of mobile issues have been closed, which is reasonable but
lower than the desktop issue resolution rate. Some mobile issues have been open since
mid-2024 (e.g., "Webview API not available on mobile" opened June 2024, still open).

### Investment Signals

**Positive:**
- v2.2.0 to v2.10.3 in 14 months (Jan 2025 - Mar 2026) = 19 minor/patch releases
- Mobile-specific fixes in recent releases (Android external storage, iOS simulator
  compatibility, security audit rewrites for mobile dev server)
- Official push notification PR in progress (4 repos touched)
- CrabNebula (the company behind Tauri) is funded and has commercial interests

**Concerning:**
- Many issues/PRs are "open for longer than desired" (team's own admission)
- No committed roadmap beyond 2.x
- Mobile DX described as "not completely happy" by the team themselves
- Key features (push, widgets, background tasks) rely on community plugins

### Missing Features (no official support)

- Push notifications (community plugin only)
- iOS/Android widgets (community Android plugin only)
- Background task scheduling
- In-app purchases (community plugin only)
- Edge-to-edge display

---

## 10. The Rust Ecosystem Velocity Argument

### Release cadence since Tauri 2.0 stable (Oct 2024)

```
2024-10: v2.0.0 (stable release)
2025-01: v2.2.0 - v2.2.5
2025-02: v2.3.0 - v2.3.1
2025-03: v2.4.0
2025-04: v2.4.1 - v2.5.1
2025-06: v2.6.0 - v2.6.2
2025-07: v2.7.0
2025-08: v2.8.0 - v2.8.5
2025-09: (v2.8.x continued)
2025-10: v2.9.0 - v2.9.2
2025-11: v2.9.3 - v2.9.4
2025-12: v2.9.5
2026-01: (none)
2026-02: v2.10.0 - v2.10.2
2026-03: v2.10.3 (today)
```

**19 releases in 17 months.** Major version bumps (2.x) roughly monthly. The pace is
steady but not accelerating.

### Features added since October 2024

- Edge-to-edge Android improvements
- Android external storage access
- iOS simulator version compatibility fixes
- Security audit rewrites for mobile dev server
- IPC layer rewrite with raw payload support
- HMR for mobile
- Mobile support in tauri-action (experimental)
- Multiple plugin updates (notification, sql, etc.)

### What's NOT on any public roadmap

- Official push notification plugin (in draft PR limbo)
- Widget support (feature request only)
- Background task scheduling
- Tauri 3.0 (no committed plans)
- Smart watch / wearable support (explicitly declined -- not a good fit for web tech)

### The velocity argument assessed

**The case for "it'll get better":**
- Active development with consistent monthly releases
- CrabNebula has commercial incentive to improve mobile
- Community plugins are filling gaps (notifications, IAP, widgets)
- Rust ecosystem itself is maturing (async improvements, better error messages)

**The case against "wait and see":**
- Push notifications have been in draft PR since Nov 2024 -- 16 months with no merge
- Team admits mobile DX needs improvement but prioritizes stability
- No published roadmap means no commitments
- Fundamental gaps (push, widgets, background tasks) may take years

---

## Summary Assessment

### Risk Matrix for Whendoist

| Area | Risk Level | Mitigation |
|------|-----------|------------|
| LLM code generation (JS/TS) | LOW | Existing codebase, massive training data |
| LLM code generation (Rust) | MEDIUM | Thin Rust layer, compiler catches errors |
| Push notifications | HIGH | Community plugin (single maintainer, 5 months old) |
| iOS App Store submission | HIGH | No confirmed Tauri precedent |
| Android Play Store | LOW | Standard Android project under the hood |
| Offline SQLite | LOW | Well-documented, multiple approaches |
| CI/CD | MEDIUM | Experimental mobile support, manual setup required |
| HMR / Dev experience | LOW-MEDIUM | Frontend HMR works, Rust rebuilds add friction |
| Three-language debugging | MEDIUM | Mostly JS debugging, Rust layer is thin |
| Community / longevity | MEDIUM | Active but understaffed, commercial backing exists |

### The Bottom Line

Tauri v2 mobile is viable for Whendoist but carries meaningful risk in two areas:

1. **Push notifications** depend on a 5-month-old community plugin with 49 stars. If it
   breaks or gets abandoned, you're writing native Swift/Kotlin push handling yourself.

2. **iOS App Store submission** has zero confirmed precedent. You may be the first to
   discover rejection reasons specific to Tauri's WKWebView implementation.

The Rust layer for Whendoist should be deliberately thin -- a bridge between the React
SPA and native capabilities (push tokens, SQLite, biometrics). The thinner the Rust layer,
the less the LLM code generation gap matters, and the less the three-language debugging
problem impacts you.

**Comparison to Capacitor:** Capacitor gives you the same WKWebView wrapping with pure
TypeScript/JavaScript (no Rust), 1000x more training data for LLMs, proven App Store track
record, and mature push notification plugins. The tradeoff is no Rust-native SQLite layer
and no Rust's type safety for the bridge code. For a vibecoding solo dev, the LLM support
difference is the strongest argument for Capacitor over Tauri.
