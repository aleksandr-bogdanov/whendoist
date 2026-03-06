---
version: v0.63.3
pr: 647
created: 2026-03-06
---

# iOS Keyboard Avoidance for Tauri WKWebView

## Context

In the Tauri v2 iOS app, the WKWebView does not automatically reposition content when the iOS keyboard appears. Two inputs are affected:
1. **Thoughts page sticky input** — the "What's on your mind?" bar at the bottom of the scrollable list gets covered by the keyboard.
2. **Task edit drawer notes textarea** — the notes field inside the Vaul bottom sheet gets covered when focused.

The native UITabBar already hides on keyboard show (via `NativeTabBarPlugin.swift`), but no mechanism exists to push web content above the keyboard.

## Approach: Swift → JS Keyboard Height Bridge

Mirrors the existing `NativeTabBarPlugin` → `tauri-native-tabbar.ts` pattern for tab bar height. The Swift plugin already observes `keyboardWillShow`/`keyboardWillHide` — we extend those handlers to send keyboard height and animation duration to JS, which sets CSS variables and a body class.

## Changes

### 1. Swift: Send keyboard height to JS

**File:** `frontend/src-tauri/ios/Sources/NativeTabBarPlugin.swift`

- Add `sendKeyboardEvent(notification:visible:)` private method:
  - Extracts keyboard height from `UIKeyboardFrameEndUserInfoKey`
  - Extracts animation duration from `UIKeyboardAnimationDurationUserInfoKey`
  - Calls `webView?.evaluateJavaScript("window.__keyboardEvent(true/false, {height: N, animationDuration: N})")`
- Modify `keyboardWillShow` to call `sendKeyboardEvent` before hiding tab bar
- Modify `keyboardWillHide` to call `sendKeyboardEvent` before showing tab bar

### 2. JS: Keyboard event bridge

**New file:** `frontend/src/lib/tauri-keyboard.ts`

- `initKeyboardBridge()` — registers `window.__keyboardEvent` global handler
- On keyboard show: subtracts `--native-safe-area-bottom` from keyboard height (keyboard frame includes home indicator area, which CSS already accounts for), sets `--keyboard-height` and `--keyboard-anim-duration` CSS vars on `:root`, adds `body.keyboard-visible`
- On keyboard hide: sets vars to 0, removes class
- Only activates on Tauri iOS (mirrors `isNativeTabBarAvailable()` check)

### 3. Initialize bridge in app shell

**File:** `frontend/src/components/layout/app-shell.tsx`

- Import and call `initKeyboardBridge()` in the existing native tab bar `useEffect` (same lifecycle — both are Tauri iOS only)
- Store cleanup function alongside existing tab bar cleanup

### 4. CSS keyboard avoidance utilities

**File:** `frontend/src/styles/globals.css`

Add at end:
```css
/* Keyboard avoidance — when keyboard visible, override sticky bottom positioning
   and constrain drawer height. Transition matches native keyboard animation. */
body.keyboard-visible .keyboard-avoid-bottom {
  bottom: calc(var(--keyboard-height, 0px) + 0.5rem) !important;
  transition: bottom var(--keyboard-anim-duration, 0.25s) ease-out;
}
.keyboard-avoid-bottom {
  transition: bottom var(--keyboard-anim-duration, 0.25s) ease-out;
}

body.keyboard-visible .keyboard-avoid-clearance {
  height: calc(var(--keyboard-height, 0px) + 1rem) !important;
  transition: height var(--keyboard-anim-duration, 0.25s) ease-out;
}

body.keyboard-visible .drawer-keyboard-aware {
  max-height: calc(90vh - var(--keyboard-height, 0px)) !important;
  transition: max-height var(--keyboard-anim-duration, 0.25s) ease-out;
}
```

### 5. Fix Thoughts sticky input

**File:** `frontend/src/routes/_authenticated/thoughts.lazy.tsx`

- Line 483: Add `keyboard-avoid-bottom` class to the sticky input container
- Line 515: Add `keyboard-avoid-clearance` class to the scroll clearance spacer

When `body.keyboard-visible`, CSS overrides `bottom` to `keyboard-height + 0.5rem` (replacing the nav pill offset, which is irrelevant since the tab bar hides on keyboard show).

### 6. Fix drawer notes textarea

**File:** `frontend/src/components/task/task-edit-drawer.tsx`

- Line 123: Add `drawer-keyboard-aware` class to `Drawer.Content` (reduces max-height by keyboard)
- Line 528 (`onFocus`): After setting `descriptionFocused`, schedule `scrollIntoView({ block: "nearest", behavior: "smooth" })` with a delay matching the keyboard animation duration

### 7. Prevent conflict with use-viewport.ts

**File:** `frontend/src/hooks/use-viewport.ts`

- In `handleKeyboardResize`, skip the `keyboard-open` class toggle when `--keyboard-height` CSS var is present (native bridge is authoritative for Tauri iOS)

## Key files

| File | Action |
|------|--------|
| `frontend/src-tauri/ios/Sources/NativeTabBarPlugin.swift` | Modify — add `sendKeyboardEvent` |
| `frontend/src/lib/tauri-keyboard.ts` | **Create** — JS bridge |
| `frontend/src/components/layout/app-shell.tsx` | Modify — init bridge |
| `frontend/src/styles/globals.css` | Modify — add CSS utilities |
| `frontend/src/routes/_authenticated/thoughts.lazy.tsx` | Modify — add classes |
| `frontend/src/components/task/task-edit-drawer.tsx` | Modify — add class + scrollIntoView |
| `frontend/src/hooks/use-viewport.ts` | Modify — skip when native bridge active |

## Verification

Manual testing on iOS simulator/device:
1. Open Thoughts page → focus input → keyboard should push input above keyboard with smooth animation
2. Open task edit drawer → focus notes textarea → textarea should scroll into view, drawer should not extend behind keyboard
3. Dismiss keyboard → input returns to normal position, drawer restores max-height
4. Rotate device while keyboard open → should remain above keyboard
5. Desktop/PWA → no behavior change (all keyboard-avoid CSS is no-op without `--keyboard-height`)
