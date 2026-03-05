---
version: v0.63.0
pr: 642
created: 2026-03-05
---

# Phase 6: Home Screen Widgets (iOS + Android)

## Context

Phase 6 of the Tauri v2 Mobile migration. The app has offline SQLite caching (Phase 3),
biometric auth, and push notifications working. This phase adds **native home screen widgets**
showing today's tasks and overdue count on both iOS and Android.

No Tauri abstraction exists for widgets — this is fully native code on both platforms.

**Widget sizes:** Small (count display) + Medium (task list)
**Encryption:** Widgets show task counts only (no titles) when encryption is enabled — decryption
keys aren't available outside the WebView.

---

## Architecture

```
Frontend (TanStack Query cache subscription)
  │
  │ tasks change → filter today + overdue
  │
  ▼
invoke("update_widget_data", { data })
  │
  ▼
Rust: commands/widgets.rs
  ├── iOS: objc2 → NSUserDefaults (App Group) + WidgetCenter.reloadAllTimelines()
  └── Android: std::fs::write → widget-data.json + broadcast refresh
        │                                    │
        ▼                                    ▼
  iOS WidgetKit Extension              Android AppWidgetProvider
  (SwiftUI, reads UserDefaults)        (RemoteViews, reads JSON file)
```

**Shared JSON schema** (written by Rust, read by native widgets):
```json
{
  "updated_at": "2026-03-05T14:30:00Z",
  "encryption_enabled": false,
  "total_today": 5,
  "overdue_count": 2,
  "completed_today": 2,
  "tasks": [
    { "title": "Review PR", "domain_name": "Work", "scheduled_time": "10:00", "completed": false }
  ]
}
```

When `encryption_enabled: true`, the `tasks` array is empty.

---

## Step 1: Rust Bridge — `commands/widgets.rs`

**New file:** `frontend/src-tauri/src/commands/widgets.rs`

Defines `WidgetData` and `WidgetTask` structs (serde) and the `update_widget_data` command.

### iOS path (`#[cfg(target_os = "ios")]`)
- Uses `objc2` + `objc2-foundation` crates to write JSON to `NSUserDefaults(suiteName: "group.com.whendoist.app")`
- Calls `WidgetCenter.shared.reloadAllTimelines()` via `objc2` msg_send to force widget refresh
- Requires WidgetKit.framework linked in the main app target

```rust
#[cfg(target_os = "ios")]
mod ios {
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send, msg_send_id};
    use objc2_foundation::{NSString, NSUserDefaults};

    pub fn write_and_reload(json: &str) -> Result<(), String> {
        unsafe {
            // Write to App Group UserDefaults
            let suite = NSString::from_str("group.com.whendoist.app");
            let defaults: Option<objc2::rc::Retained<NSUserDefaults>> =
                msg_send_id![NSUserDefaults::class(), alloc => initWithSuiteName: &*suite];
            let defaults = defaults.ok_or("Failed to init NSUserDefaults with suite")?;
            let key = NSString::from_str("widget_data");
            let value = NSString::from_str(json);
            defaults.setObject_forKey(Some(&value), &key);

            // Reload widget timelines
            let cls = class!(WidgetCenter);
            let center: *mut AnyObject = msg_send![cls, shared];
            let _: () = msg_send![center, reloadAllTimelines];
        }
        Ok(())
    }
}
```

### Android path (`#[cfg(target_os = "android")]`)
- Writes `widget-data.json` to `app.path().app_data_dir()`
- v1: Widget picks up changes on its 30-min system update cycle
- v2 enhancement: Send broadcast via JNI for instant refresh (optional, deferred)

```rust
#[cfg(target_os = "android")]
fn write_widget_file(app: &tauri::AppHandle, json: &str) -> Result<(), String> {
    let data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    std::fs::write(data_dir.join("widget-data.json"), json).map_err(|e| e.to_string())?;
    Ok(())
}
```

### Cargo.toml additions

```toml
[target.'cfg(target_os = "ios")'.dependencies]
objc2 = "0.5"
objc2-foundation = { version = "0.2", features = ["NSString", "NSUserDefaults"] }
```

### Registration

- `commands/mod.rs`: add `pub mod widgets;`
- `lib.rs`: add `commands::widgets::update_widget_data` to `invoke_handler`

---

## Step 2: iOS — App Group & Widget Extension Target

### 2a. Entitlements

**Modify:** `frontend/src-tauri/gen/apple/whendoist_iOS/whendoist_iOS.entitlements`

```xml
<dict>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>group.com.whendoist.app</string>
  </array>
</dict>
```

### 2b. Widget extension directory

**Create:** `frontend/src-tauri/gen/apple/WhendoistWidget/`

Files:
- `WhendoistWidgetBundle.swift` — entry point (`@main`)
- `WhendoistWidget.swift` — TimelineProvider + widget views
- `Info.plist` — extension metadata
- `WhendoistWidget.entitlements` — same App Group entitlement

### 2c. XcodeGen project.yml — add widget target

**Modify:** `frontend/src-tauri/gen/apple/project.yml`

Add new target alongside `whendoist_iOS`:

```yaml
  WhendoistWidgetExtension:
    type: app-extension
    platform: iOS
    deploymentTarget: 15.0
    sources:
      - path: WhendoistWidget
    info:
      path: WhendoistWidget/Info.plist
      properties:
        CFBundleDisplayName: Whendoist Widget
        NSExtension:
          NSExtensionPointIdentifier: com.apple.widgetkit-extension
    entitlements:
      path: WhendoistWidget/WhendoistWidget.entitlements
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.whendoist.app.widget
        DEVELOPMENT_TEAM: Q28499Z3SB
        CODE_SIGN_STYLE: Automatic
        SWIFT_VERSION: "5.9"
        GENERATE_INFOPLIST_FILE: true
    dependencies:
      - sdk: SwiftUI.framework
      - sdk: WidgetKit.framework
```

Add widget as embedded dependency of main app:

```yaml
  whendoist_iOS:
    dependencies:
      # ... existing dependencies ...
      - target: WhendoistWidgetExtension
        embed: true
        codeSign: true
      - sdk: WidgetKit.framework   # For WidgetCenter API from main app
```

After editing, regenerate Xcode project: `cd frontend/src-tauri/gen/apple && xcodegen generate`

---

## Step 3: iOS — SwiftUI Widget Code

### `WhendoistWidgetBundle.swift`

```swift
import WidgetKit
import SwiftUI

@main
struct WhendoistWidgetBundle: WidgetBundle {
    var body: some Widget {
        WhendoistTodayWidget()
    }
}
```

### `WhendoistWidget.swift`

Key components:
- **`WidgetDataStore`** — reads JSON from `UserDefaults(suiteName: "group.com.whendoist.app")`
- **`TodayTasksProvider: TimelineProvider`** — creates timeline entries, refreshes every 30 min
- **`SmallWidgetView`** — shows "5 tasks today" with overdue badge, app icon
- **`MediumWidgetView`** — shows task list (up to 4 tasks) with times and domain names
- **`WhendoistTodayWidget: Widget`** — registers `.systemSmall` and `.systemMedium` families

Timeline strategy: `.after(Date().addingTimeInterval(30 * 60))` — refresh every 30 min.
The main app also calls `WidgetCenter.shared.reloadAllTimelines()` on every data write for
instant refresh when the app is active.

Encryption mode: Both sizes show "N tasks today · M overdue" count with a lock icon,
no task titles.

---

## Step 4: Frontend — Widget Data Sync

### 4a. New file: `frontend/src/lib/tauri-widgets.ts`

Follows the same lazy-import pattern as `tauri-cache.ts`:

```typescript
export async function updateWidgetData(
  tasks: TaskResponse[],
  encryptionEnabled: boolean,
): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  // Filter today's tasks + compute overdue count
  // Call invoke("update_widget_data", { data: widgetData })
}
```

Task filtering logic:
- **Today's tasks:** `scheduled_date === todayISO && status !== "deleted"`
- **Overdue:** `scheduled_date < todayISO && status === "pending"` (not completed, not deleted)
- **Completed today:** tasks with `status === "completed"` or `today_instance_completed === true`

### 4b. Integration point: `frontend/src/hooks/use-offline-sync.ts`

In the existing `persistToCache()` function, after writing tasks to SQLite cache,
also trigger widget update:

```typescript
if (keyStr === TASKS_KEY_PREFIX) {
  await setCachedData("tasks", data);
  // Update widget data
  const { updateWidgetData } = await import("@/lib/tauri-widgets");
  // Get encryption state from crypto store
  const { useCryptoStore } = await import("@/stores/crypto-store");
  const encryptionEnabled = useCryptoStore.getState().isEnabled;
  await updateWidgetData(data as TaskResponse[], encryptionEnabled);
}
```

Also trigger on app backgrounding via `visibilitychange` event to ensure
widget data is fresh when user leaves the app.

---

## Step 5: Android — Project Init & Widget

### 5a. Generate Android project

```bash
cd frontend && npx tauri android init
```

This creates `frontend/src-tauri/gen/android/` with the standard Gradle project structure.

### 5b. New Android files

| File | Purpose |
|------|---------|
| `gen/android/app/src/main/java/com/whendoist/app/TodayTasksWidgetProvider.kt` | Widget provider (AppWidgetProvider subclass) |
| `gen/android/app/src/main/res/layout/widget_today_tasks.xml` | Widget layout (5 inlined task rows) |
| `gen/android/app/src/main/res/xml/widget_today_tasks_info.xml` | Widget metadata (sizes, update period) |
| `gen/android/app/src/main/res/drawable/widget_background.xml` | Rounded white background shape |
| `gen/android/app/src/main/res/drawable/ic_check_circle.xml` | Green checkmark vector drawable |

### 5c. AndroidManifest.xml addition

Add `<receiver>` inside `<application>`:

```xml
<receiver android:name=".TodayTasksWidgetProvider" android:exported="true">
  <intent-filter>
    <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
  </intent-filter>
  <meta-data android:name="android.appwidget.provider"
             android:resource="@xml/widget_today_tasks_info" />
</receiver>
```

### 5d. Widget provider design

- Uses **RemoteViews** (not Glance Compose) — no extra Gradle dependencies needed
- Reads `widget-data.json` from `{context.filesDir.parentFile}/app_data/`
- Handles 3 states: no data ("Open Whendoist"), encrypted (counts only), normal (task list)
- `updatePeriodMillis: 1800000` (30 min) — Android minimum for system-triggered refresh
- Tap anywhere opens the app via `PendingIntent`

No Gradle dependency changes required — RemoteViews, JSONObject, and AppWidgetManager
are all part of the Android SDK.

---

## Step 6: Documentation & PR

- Create `docs/WIDGETS.md` — architecture overview, data flow, App Group setup
- Update `CHANGELOG.md` with version entry
- Bump version in `pyproject.toml`, run `uv lock`
- PR title: `v{version}/feat: Home screen widgets (iOS + Android)`

---

## File Summary

### New files (10)

| File | Lines (est.) |
|------|-------------|
| `frontend/src-tauri/src/commands/widgets.rs` | ~80 |
| `frontend/src/lib/tauri-widgets.ts` | ~60 |
| `frontend/src-tauri/gen/apple/WhendoistWidget/WhendoistWidgetBundle.swift` | ~15 |
| `frontend/src-tauri/gen/apple/WhendoistWidget/WhendoistWidget.swift` | ~200 |
| `frontend/src-tauri/gen/apple/WhendoistWidget/WhendoistWidget.entitlements` | ~10 |
| `frontend/src-tauri/gen/android/.../TodayTasksWidgetProvider.kt` | ~150 |
| `frontend/src-tauri/gen/android/.../layout/widget_today_tasks.xml` | ~120 |
| `frontend/src-tauri/gen/android/.../xml/widget_today_tasks_info.xml` | ~15 |
| `frontend/src-tauri/gen/android/.../drawable/widget_background.xml` | ~8 |
| `frontend/src-tauri/gen/android/.../drawable/ic_check_circle.xml` | ~10 |

### Modified files (6)

| File | Change |
|------|--------|
| `frontend/src-tauri/Cargo.toml` | Add `objc2`, `objc2-foundation` (iOS-only) |
| `frontend/src-tauri/src/commands/mod.rs` | Add `pub mod widgets;` |
| `frontend/src-tauri/src/lib.rs` | Register `update_widget_data` command |
| `frontend/src-tauri/gen/apple/project.yml` | Add widget extension target + embed dependency |
| `frontend/src-tauri/gen/apple/whendoist_iOS/whendoist_iOS.entitlements` | Add App Group |
| `frontend/src/hooks/use-offline-sync.ts` | Call `updateWidgetData()` after task persistence |

---

## Implementation Order

1. **Rust bridge** — `commands/widgets.rs` + Cargo.toml + registration (platform-agnostic first)
2. **iOS entitlements & project.yml** — App Group + widget extension target
3. **iOS SwiftUI widget** — `WhendoistWidget/` directory with all Swift files
4. **Frontend hook** — `tauri-widgets.ts` + integration in `use-offline-sync.ts`
5. **Test iOS** — build, add widget to home screen, verify data flow
6. **Android init** — `tauri android init`
7. **Android widget** — Kotlin provider, layout XMLs, manifest
8. **Test Android** — emulator, add widget, verify
9. **Docs & PR** — `docs/WIDGETS.md`, changelog, version bump

---

## Verification

### iOS
1. `cd frontend && npx tauri ios dev` — build and run on simulator
2. Long-press home screen → add "Whendoist" widget (small and medium)
3. Open app → tasks should appear in widget within seconds (WidgetCenter reload)
4. Complete a task → widget updates
5. Enable encryption → widget shows count only, no titles

### Android
1. `cd frontend && npx tauri android dev` — build and run on emulator
2. Long-press home screen → Widgets → find "Whendoist Today"
3. Open app → tasks load → widget shows data on next 30-min cycle (or sooner if broadcast works)
4. Verify encrypted mode shows counts only

### Edge cases
- No tasks today → widget shows "No tasks today" message
- App never opened → widget shows "Open Whendoist to load tasks"
- Offline → widget shows last-cached data (stale but better than empty)
- Logout → clear widget data (add to existing logout cleanup in `tauri-cache.ts`)
