# Home Screen Widgets (iOS + Android)

Native home screen widgets showing today's tasks and overdue count.

**Phase 6** of the Tauri v2 Mobile migration.

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
  └── Android: std::fs::write → widget-data.json
        │                                    │
        ▼                                    ▼
  iOS WidgetKit Extension              Android AppWidgetProvider
  (SwiftUI, reads UserDefaults)        (RemoteViews, reads JSON file)
```

### Data Flow

1. Frontend subscribes to TanStack Query cache updates for tasks
2. On task change, `tauri-widgets.ts` filters today's tasks and computes overdue count
3. Calls `invoke("update_widget_data", { data })` — sends JSON to Rust
4. Rust writes the data to the platform-specific shared store
5. Native widget extension reads the data on its next timeline refresh

Widget data is also pushed on app backgrounding (`visibilitychange` event)
to ensure fresh data when the user leaves the app.

### Shared JSON Schema

Written by Rust, read by native widgets:

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

### Encryption Mode

When `encryption_enabled: true`, the `tasks` array is empty — widget extensions
run in a separate process and can't access WebCrypto decryption keys. Both widget
sizes fall back to showing counts only with a lock icon.

---

## Widget Sizes

### Small (`.systemSmall`)
- Task count with large number
- Progress bar (completed / total)
- Overdue badge (red pill)
- Lock icon in encrypted mode

### Medium (`.systemMedium`)
- Header row: "Today" + completion count + overdue badge
- Task list (up to 4 tasks on iOS, 5 on Android)
- Each row: checkbox + title + domain + scheduled time
- "+N more" if tasks overflow

---

## iOS Implementation

### App Group

The main app and widget extension share data via `NSUserDefaults` with the
App Group `group.com.whendoist.app`. Both targets must have the same entitlement.

### Files

| File | Purpose |
|------|---------|
| `src-tauri/src/commands/widgets.rs` | Rust bridge: iOS path writes to NSUserDefaults via `objc2` |
| `gen/apple/WhendoistWidget/WhendoistWidgetBundle.swift` | Widget extension entry point |
| `gen/apple/WhendoistWidget/WhendoistWidget.swift` | TimelineProvider + SwiftUI views |
| `gen/apple/WhendoistWidget/WhendoistWidget.entitlements` | App Group entitlement |
| `gen/apple/WhendoistWidget/Info.plist` | Extension metadata |
| `gen/apple/project.yml` | XcodeGen config with widget extension target |

### Refresh Strategy

- **Active:** Main app calls `WidgetCenter.shared.reloadAllTimelines()` after every data write
- **Passive:** Timeline policy `.after(30 minutes)` triggers WidgetKit refresh

---

## Android Implementation

### Files

| File | Purpose |
|------|---------|
| `src-tauri/src/commands/widgets.rs` | Rust bridge: Android path writes JSON file |
| `gen/android/.../TodayTasksWidgetProvider.kt` | AppWidgetProvider reading widget-data.json |
| `gen/android/.../layout/widget_today_tasks.xml` | RemoteViews layout (5 task rows) |
| `gen/android/.../xml/widget_today_tasks_info.xml` | Widget metadata |
| `gen/android/.../drawable/widget_background.xml` | Rounded white background |
| `gen/android/.../drawable/ic_check_circle.xml` | Green check icon |
| `gen/android/.../drawable/ic_circle_outline.xml` | Grey circle outline icon |

### Setup

After generating the Android project (`npx tauri android init`), add the
widget receiver to `AndroidManifest.xml`:

```xml
<receiver android:name=".TodayTasksWidgetProvider" android:exported="true">
    <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
    </intent-filter>
    <meta-data android:name="android.appwidget.provider"
               android:resource="@xml/widget_today_tasks_info" />
</receiver>
```

### Refresh Strategy

- `updatePeriodMillis: 1800000` (30 minutes) — Android's minimum system-triggered refresh
- v2 enhancement: broadcast intent for instant refresh (deferred)

---

## Frontend Integration

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/tauri-widgets.ts` | `updateWidgetData()` / `clearWidgetData()` — lazy Tauri IPC |
| `src/hooks/use-offline-sync.ts` | Triggers widget update after task cache persistence |
| `src/components/layout/header.tsx` | Calls `clearWidgetData()` on logout |

### Triggers

1. **Task cache persistence** — every time tasks are written to SQLite cache
2. **App backgrounding** — `visibilitychange` event ensures fresh widget data
3. **Logout** — clears widget data so stale tasks aren't shown

---

## Edge Cases

| Scenario | Widget Behavior |
|----------|----------------|
| No tasks today | Shows "No tasks today" message |
| App never opened | Shows "Open Whendoist to load tasks" |
| Offline | Shows last-cached data (stale but better than empty) |
| Logout | Widget cleared, shows "Open Whendoist" |
| Encryption enabled | Shows counts + lock icon, no task titles |
