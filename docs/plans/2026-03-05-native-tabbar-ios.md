---
version:
pr:
created: 2026-03-05
---

# Native iOS UITabBar Implementation

## Context

The current mobile navigation is a CSS-based floating pill (`mobile-nav.tsx`) rendered inside WKWebView. On iOS 26, Apple introduces Liquid Glass — a frosted glass design language applied automatically to native UIKit controls like `UITabBar`. There's no CSS equivalent. Replacing the web-based nav with a native `UITabBar` gives us Liquid Glass for free and makes the app feel truly native.

## Architecture Overview

**Swift plugin** (`NativeTabBarPlugin`) reparents the WKWebView inside `load(webview:)` into a container `UIViewController` with a standalone `UITabBar` at the bottom. Tab taps send events to JS via Tauri's `trigger()`. JS listens for navigation events and calls TanStack Router's `navigate()`. When JS-side navigation occurs (e.g. deep links), it calls back to Swift to sync the active tab indicator.

## Implementation Steps

### 1. Create Swift plugin: `NativeTabBarPlugin.swift`

**File:** `frontend/src-tauri/gen/apple/Sources/whendoist/NativeTabBarPlugin.swift`

- Subclass `Plugin`, register with `@_cdecl("init_plugin_native_tabbar")`
- In `load(webview:)`:
  - Get `UIWindow` from `webview.window`
  - Create a `UIViewController` as container
  - Remove webview from its current superview
  - Add webview as subview of container's view
  - Create `UITabBar` with 5 items: Thoughts, Tasks, + (plus), Analytics, Settings
  - Use Auto Layout: webview top-to-safeArea.top, leading, trailing, bottom-to-tabbar.top; tabbar leading, trailing, bottom-to-superview.bottom
  - Set `window.rootViewController = container`
  - Implement `UITabBarDelegate.tabBar(_:didSelect:)` → call `self.trigger("tab-navigate", data:)` for route tabs, `self.trigger("tab-action", data:)` for the plus button
- Expose command `set_active_tab` for JS → Swift tab sync

**Tab items:**
| Index | Label     | SF Symbol            | Route/Action         |
|-------|-----------|----------------------|----------------------|
| 0     | Thoughts  | lightbulb            | /thoughts            |
| 1     | Tasks     | list.bullet          | /dashboard           |
| 2     | (plus)    | plus.circle.fill     | action: open-search  |
| 3     | Analytics | chart.bar            | /analytics           |
| 4     | Settings  | gearshape            | /settings            |

### 2. Register plugin in Rust

**File:** `frontend/src-tauri/src/lib.rs`

Add iOS-only plugin registration:
```rust
#[cfg(target_os = "ios")]
let builder = builder.plugin(tauri::plugin::Builder::new("native_tabbar").build());
```

This creates a minimal Rust-side plugin that the Swift plugin extends via the `@_cdecl` init function. No Rust commands needed — all logic is Swift.

### 3. Add Swift source to Xcode project

**File:** `frontend/src-tauri/gen/apple/project.yml`

Add `NativeTabBarPlugin.swift` to the `whendoist_iOS` target sources. The file lives under `Sources/whendoist/` which is already included via `path: Sources`.

No changes needed to `project.yml` — the `Sources` directory is already a source group.

### 4. Create JS IPC wrapper

**File:** `frontend/src/lib/tauri-native-tabbar.ts` (NEW)

Follow the same pattern as `tauri-stt.ts` and `tauri-widgets.ts`:
- `initNativeTabBar()` — sets up event listeners for `tab-navigate` and `tab-action` events from the plugin
- `setActiveTab(index: number)` — calls invoke to sync native tab highlight when JS navigates
- `isNativeTabBarAvailable()` — checks `isTauri` + iOS platform
- All calls use the 1.5s timeout + Promise.race pattern from existing wrappers

### 5. Integrate with React navigation

**File:** `frontend/src/components/layout/app-shell.tsx`

- Import `isNativeTabBarAvailable` and use it to conditionally hide `<MobileNav />`
- Add a `useEffect` that:
  - Calls `initNativeTabBar()` with a navigation callback that uses TanStack Router's `navigate()`
  - On route changes, calls `setActiveTab()` to sync the native indicator
  - For `tab-action` events (plus button), opens the search palette via `useUIStore`

### 6. Safe area CSS adjustments

**File:** `frontend/src/styles/globals.css`

When native tab bar is active (`.native-tabbar` class on `body`):
- Override `--safe-area-inset-bottom: 0px` — webview frame already ends at tabbar top
- Override `--nav-pill-height: 0px` and `--nav-pill-mb: 0px` — no web nav pill
- The `pb-nav-safe` utility will compute to `0.25rem` (just the gap), which is fine

**File:** `frontend/src/hooks/use-device.ts`
- No changes needed — already sets `body.tauri-app` and `body.ios-device` classes

### 7. Conditionally hide web MobileNav

**File:** `frontend/src/components/layout/mobile-nav.tsx`

Add early return if native tab bar is active:
```tsx
if (isTauri && isIOS) return null;
```

This is simpler than the AppShell approach and keeps the logic colocated. Use the `isTauri` export from `use-device.ts` plus a UA check for iOS.

## Files Modified

| File | Action | Purpose |
|------|--------|---------|
| `gen/apple/Sources/whendoist/NativeTabBarPlugin.swift` | CREATE | Swift plugin: view hierarchy + UITabBar |
| `src-tauri/src/lib.rs` | EDIT | Register native_tabbar plugin (iOS-only) |
| `src/lib/tauri-native-tabbar.ts` | CREATE | JS IPC wrapper for tab events |
| `src/components/layout/app-shell.tsx` | EDIT | Wire native tabbar init + route sync |
| `src/components/layout/mobile-nav.tsx` | EDIT | Hide on iOS Tauri |
| `src/styles/globals.css` | EDIT | Override safe area when native tabbar active |

## Key Risks & Mitigations

1. **WKWebView reparenting** — Wry may cache the superview. Mitigation: do it in `load(webview:)` before any content loads.
2. **Keyboard occlusion** — UITabBar may interfere with keyboard. Mitigation: hide tabbar when keyboard is shown (use `UIResponder.keyboardWillShowNotification`).
3. **Safe area double-accounting** — `tauri-plugin-edge-to-edge` injects `--safe-area-inset-bottom` which would be wrong after reparenting. Mitigation: CSS override via `.native-tabbar` class.

## Verification

1. Build and run: `just tauri-ios` (or `npm run -- tauri ios dev`)
2. Verify native tab bar appears at the bottom with 5 items
3. Tap each tab → web content navigates correctly
4. Tap plus button → search palette opens
5. Navigate via deep link or JS → native tab indicator syncs
6. Verify no double bottom padding (safe area override working)
7. Open keyboard → tab bar should not obstruct input
8. Rotate device → layout adapts correctly
