# Whendoist Design System

> Complete design specification for Whendoist. Use this document to understand existing patterns and redesign any UI element consistently.

## App Overview

**Whendoist** is a task management and day planning app that answers "WHEN do I do my tasks?" by combining Todoist tasks with Google Calendar events.

### Four Pages

| Page | Purpose | Version | Design Status |
|------|---------|---------|---------------|
| **Tasks** | Day planning: task list + calendar + drag scheduling | v0.5 | Complete |
| **Thought Cabinet** | Quick capture inbox, promote to task | v0.6 | Complete |
| **Analytics** | Completion stats, trends, domain breakdown | v0.7 | Complete |
| **Settings** | Account config, integrations, domains, security, task display | v0.8 | Complete |

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Domains** | Project containers for tasks (Work, Personal, etc.) |
| **Clarity** | Task readiness: Executable → Defined → Exploratory |
| **Impact** | Priority: P1 (High) → P2 (Medium) → P3 (Low) → P4 (Minimal) |
| **Energy Mode** | Filters tasks by clarity (Zombie/Normal/Focus) |
| **Anytime Tasks** | Scheduled for date but no specific time |

---

## Design Philosophy

### Core Principles

1. **Tint-based interactions** — Hover/active states use color tints, never shadows
2. **Shadows for overlays only** — Modals, popovers, toasts get shadows; inline elements don't
3. **Single color signal per row** — Impact owns the row (rail + wash); chips stay neutral
4. **Calm enterprise aesthetic** — Muted colors, minimal noise, clear hierarchy
5. **Dense information display** — Rows with border-bottom dividers, not cards with gaps

### Visual Hierarchy

```
Canvas (dark-bg) → Panels (grey-bg) → Cards/Content (light-bg) → Overlays (elevated-bg)
```

---

## Color System

### Background Layers (Tailwind Slate)

```css
--dark-bg: #F8FAFC;      /* slate-50: page canvas, app chrome */
--grey-bg: #F1F5F9;      /* slate-100: panels, columns, headers */
--light-bg: #FFFFFF;     /* card surfaces, content areas */
--elevated-bg: #FFFFFF;  /* modals, popovers (+ shadow) */
```

### Text Colors

```css
--text: #0B1220;                      /* Primary - near black */
--text-muted: rgba(15, 23, 42, 0.64); /* Secondary */
--text-faint: rgba(15, 23, 42, 0.46); /* Tertiary/hints */
```

### Brand / Primary

```css
--primary: #6D5EF6;       /* Digital lavender */
--primary-hover: #5B4CF0;
--primary-tint: #E9E7FF;  /* Light lavender background */
```

### Border System (3-Tier)

```css
--border-hair: rgba(15, 23, 42, 0.055);  /* Inner dividers, grid lines */
--border: rgba(15, 23, 42, 0.085);       /* Cards, inputs, chips */
--border-strong: rgba(15, 23, 42, 0.12); /* Active containers, focus */
```

### Interactive States

```css
--row-hover: rgba(109, 94, 246, 0.06);  /* Subtle purple tint */
--row-active: rgba(109, 94, 246, 0.10); /* Selection tint */
--focus-ring: rgba(109, 94, 246, 0.22); /* Focus outline */
```

### Input Focus Glow (Pico CSS Override)

**Problem:** `box-shadow` focus glow gets clipped by `overflow-y: auto` on scroll containers.

**Solution:** Use `filter: drop-shadow()` which renders on a separate compositing layer.

```css
.modal-backdrop .input:focus {
    border-color: rgba(99, 102, 241, 0.5) !important;
    box-shadow: none !important;
    outline: none !important;
    filter: drop-shadow(0 0 4px rgba(99, 102, 241, 0.4)) !important;
    position: relative;
    z-index: 1;
}
```

**Why each property:**
| Property | Reason |
|----------|--------|
| `border-color` | Purple border on focus |
| `box-shadow: none` | Disable Pico's default (would be clipped) |
| `outline: none` | Disable browser default |
| `filter: drop-shadow()` | Smooth glow that isn't clipped by overflow |
| `position: relative; z-index: 1` | Raise above adjacent joined inputs |
| `!important` | Override Pico CSS specificity |

### Clarity Colors (Energy Mode Mapping)

| Clarity | Mode | Color | Tint |
|---------|------|-------|------|
| Executable | Zombie 🧟 | `#167BFF` | `#EAF2FF` |
| Defined | Normal ☕ | `#6D5EF6` | `#EFEEFF` |
| Exploratory | Focus 🧠 | `#A020C0` | `#F3ECFA` |

### Impact Colors (Priority)

| Impact | Label | Rail | Row Wash |
|--------|-------|------|----------|
| P1 | High | `#E8A0A6` | `rgba(201, 80, 90, 0.030)` |
| P2 | Medium | `#B8860B` | `rgba(184, 134, 11, 0.022)` |
| P3 | Low | `#1A9160` | `rgba(26, 145, 96, 0.030)` |
| P4 | Minimal | `#6B7385` | `rgba(107, 115, 133, 0.018)` |

### Utility Colors

```css
--danger: #DC2626;
--danger-bg: rgba(220, 38, 38, 0.08);
--success: #16a34a;
```

---

## Typography

### Base

- **Font:** System default (Pico CSS)
- **Base size:** `15px`

### Type Scale

| Element | Size | Weight | Transform | Spacing |
|---------|------|--------|-----------|---------|
| Page title | `1.75rem` | 700 | uppercase | `0.10em` |
| Page subtitle | `0.68rem` | 600 | uppercase | `0.12em` |
| Section header | `0.62rem` | 700 | uppercase | `0.14em` |
| Task title | `0.85rem` | 400 | — | — |
| Column headers | `11px` | 600 | uppercase | `0.06em` |
| Meta values | `0.65rem` | 500 | — | — |
| Keycap hint | `0.62rem` | 800 | uppercase | `0.14em` |
| Muted label | `0.55rem` | 600 | uppercase | `0.03em` |

### ALL CAPS Pattern (v0.6)

Used for titles, headers, hints in Thoughts/Settings:
```css
text-transform: uppercase;
letter-spacing: 0.10em to 0.14em;
font-weight: 600-700;
```

---

## Layout

### Global Container

```css
max-width: 1100px;        /* Tasks dashboard */
max-width: 900px;         /* Thoughts panel */
--content-padding: 3rem;
--layout-gap: 1.5rem;
```

### Dashboard Grid (Tasks)

```css
grid-template-columns: 2fr 1fr;  /* Tasks panel : Calendar */
height: calc(100vh - 68px - 1.5rem);
```

### Task Row Columns

```css
--col-duration: 68px;
--col-impact: 56px;
--col-clarity: 80px;
--col-gap: 12px;
--rail-w: 2px;
```

---

## Global Components

### Site Header

- **Height:** 68px desktop, 40px mobile
- **Background:** `#FFFFFF`
- **Position:** Sticky top

**Contents:**
1. Logo + version badge (left)
2. Energy selector (center, dashboard only)
3. Spaces nav pills (right)
4. Logout icon button (far right)

### Page Navigation

```css
.header-nav {
    background: var(--light-bg);
    border-radius: 8px;
    padding: 3px;
    height: 32px;
}

.nav-item {
    padding: 0 0.75rem;
    height: 26px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    border-radius: 6px;
}

.nav-item.active {
    background: rgba(15, 23, 42, 0.06);
    box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.06);
}
```

### Toast Notifications

- **Position:** Fixed bottom-left (24px)
- **Style:** Frosted glass with backdrop-blur
- **Actions:** Undo button + dismiss X
- **Animation:** Slide up with opacity

---

## Tasks Page (v0.5)

### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Header (sticky)                                              │
├───────────────────────────────────┬─────────────────────────┤
│ Tasks Panel (grey-bg)             │ Calendar Panel          │
│ ┌───────────────────────────────┐ │ ┌─────────────────────┐ │
│ │ Task List Header (grid cols)  │ │ │ Day Header          │ │
│ ├───────────────────────────────┤ │ ├─────────────────────┤ │
│ │ Domain Group                  │ │ │ Anytime Lane        │ │
│ │ ├─ Task Row                   │ │ ├─────────────────────┤ │
│ │ ├─ Task Row                   │ │ │ Hour Grid           │ │
│ │ └─ Task Row                   │ │ │ (prev evening +     │ │
│ │ Domain Group                  │ │ │  main day +         │ │
│ │ └─ ...                        │ │ │  next morning)      │ │
│ └───────────────────────────────┘ │ └─────────────────────┘ │
└───────────────────────────────────┴─────────────────────────┘
```

### Task Row

```
┌──┬────────────────────────┬────────┬────────┬──────────┐
│▌ │ Task title             │  30m   │  High  │ Defined  │
└──┴────────────────────────┴────────┴────────┴──────────┘
 ↑           ↑                  ↑        ↑         ↑
rail    content (flex)      duration  impact   clarity
                            (68px)   (56px)    (80px)
```

**CSS:**
```css
.task-row {
    display: grid;
    grid-template-columns: 1fr var(--col-duration) var(--col-impact) var(--col-clarity);
    column-gap: var(--col-gap);
    padding: 9px 12px 9px calc(12px + var(--rail-w));
    background: var(--impact-pX-row);  /* Subtle impact wash */
    border-bottom: 1px solid var(--border-hair);
    margin-left: var(--rail-w);  /* Inset divider */
}

.task-row::before {  /* Impact rail */
    content: "";
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: var(--rail-w);
    background: var(--impact-X-border);
}
```

**States:**
| State | Background | Rail |
|-------|------------|------|
| Default | Impact wash | Impact color |
| Hover | `rgba(15, 23, 42, 0.02)` | Unchanged |
| Selected | `rgba(109, 94, 246, 0.10)` | Primary |
| Dragging | `opacity: 0.5` | — |
| Scheduled | `opacity: 0.5`, dashed border | — |

### Domain Group

```css
.project-group {
    background: var(--light-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    margin-bottom: 0.5rem;
}

.project-header {
    padding: 10px 12px;
    background: var(--grey-bg);
    border-bottom: 1px solid var(--border-hair);
    cursor: pointer;
}
```

### Anytime Lane

Fixed height tray with scrollable tasks:

```css
.date-only-banner {
    height: 72px;  /* Fixed - prevents alignment shift */
    background: rgba(15, 23, 42, 0.02);
    border: 1px solid var(--border-hair);
    border-radius: 12px;
    margin: 4px;
}

.date-only-tasks {
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
}

.date-only-task {
    width: calc(100% - 0.5rem);
    background: rgba(255, 255, 255, 0.92);
    border-radius: 10px;
    /* Has impact rail like regular tasks */
}
```

### Calendar Hour Grid

```css
.hour-slot {
    height: 60px;  /* 40px on mobile */
    border-bottom: 1px solid var(--border-hair);
}

.hour-slot:nth-child(even) {
    background: rgba(15, 23, 42, 0.015);  /* Subtle banding */
}

.time-label {
    width: 54px;
    font-variant-numeric: tabular-nums;
    text-align: right;
}
```

---

## Thought Cabinet Page (v0.6)

### Layout Structure

```
┌──────────────────────────────────────────────────────┐
│ Header                                                │
├──────────────────────────────────────────────────────┤
│                    Page (flex center)                 │
│  ┌────────────────────────────────────────────────┐  │
│  │ Page Surface (grey-bg, rounded)                │  │
│  │                                                │  │
│  │ THOUGHT CABINET (title)                        │  │
│  │ QUICK CAPTURE FOR IDEAS... (subtitle)          │  │
│  │                                                │  │
│  │ ┌──────────────────────────────────────────┐  │  │
│  │ │ Capture Card (white)                     │  │  │
│  │ │ [Input field                          ]  │  │  │
│  │ │ [Enter] Capture                          │  │  │
│  │ └──────────────────────────────────────────┘  │  │
│  │                                                │  │
│  │ ┌──────────────────────────────────────────┐  │  │
│  │ │ Panel Header: "12 THOUGHTS"              │  │  │
│  │ ├──────────────────────────────────────────┤  │  │
│  │ │ • Thought text              [↑] [×]      │  │  │
│  │ │ • Thought text              [↑] [×]      │  │  │
│  │ │ • Thought text              [↑] [×]      │  │  │
│  │ └──────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Key Components

**Page Surface (shared container):**
```css
.page-surface {
    max-width: 900px;  /* 1100px for Settings */
    background: var(--grey-bg);
    border-radius: 12px;
    border: 1px solid var(--border-hair);
    padding: 28px 32px 40px;
}
```

**Title (ALL CAPS):**
```css
.thoughts-title {
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 700;
    font-size: 1.75rem;
}

.thoughts-subtitle {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-weight: 600;
    font-size: 0.68rem;
    color: var(--text-muted);
}
```

**Capture Card:**
```css
.capture-card {
    background: var(--light-bg);
    border: 1px solid var(--border-hair);
    border-radius: 12px;
    padding: 18px;
}

.capture-input {
    height: 44px;
    border-radius: 10px;
    border: 1px solid var(--border-hair);
}

.keycap {
    height: 22px;
    padding: 0 10px;
    border-radius: 6px;
    background: #fff;
    border: 1px solid var(--border-hair);
    font-weight: 800;
    letter-spacing: 0.14em;
}
```

**Thought Row (Dense):**
```css
.thought-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 14px;
    border-bottom: 1px solid var(--border-hair);
    background: #fff;
}

.thought-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #C7CFDA;
}

.thought-actions {
    opacity: 0;  /* Show on hover */
}

.thought-row:hover .thought-actions {
    opacity: 1;
}
```

**Icon Buttons:**
```css
.icon-btn {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    border: 1px solid var(--border-hair);
    background: rgba(255, 255, 255, 0.85);
}

.icon-btn.promote:hover {
    border-color: rgba(109, 94, 246, 0.35);
    background: rgba(109, 94, 246, 0.08);
    color: var(--primary);
}

.icon-btn.delete:hover {
    border-color: rgba(220, 38, 38, 0.25);
    background: rgba(220, 38, 38, 0.06);
    color: var(--danger);
}
```

---

## Settings Page (v0.6)

### Layout Structure

```
┌──────────────────────────────────────────────────────────────────┐
│ Header                                                            │
├──────────────────────────────────────────────────────────────────┤
│                         Page (flex center)                        │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Page Surface (grey-bg, max-width: 1100px)                  │  │
│  │                                                            │  │
│  │ SETTINGS (title)                                           │  │
│  │                                                            │  │
│  │ ┌─────────────────────┐  ┌─────────────────────┐           │  │
│  │ │ INTEGRATIONS        │  │ LIFE DOMAINS        │           │  │
│  │ │ • Google    [Conn.] │  │ • 📁 Domain  [✎][×] │           │  │
│  │ │ • Todoist   [Conn.] │  │ • 📁 Domain  [✎][×] │           │  │
│  │ └─────────────────────┘  │ [Add new domain...] │           │  │
│  │                          └─────────────────────┘           │  │
│  │ ┌─────────────────────┐  ┌─────────────────────┐           │  │
│  │ │ GOOGLE CALENDARS    │  │ DATA                │           │  │
│  │ │ • Calendar    [tog] │  │ [Import] [Unclear]  │           │  │
│  │ │ • Calendar    [tog] │  │ ─────────────────── │           │  │
│  │ └─────────────────────┘  │ Danger: [Wipe All]  │           │  │
│  │                          └─────────────────────┘           │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Key Components

**Page Surface:**
```css
.page-surface {
    max-width: 1100px;
    background: var(--grey-bg);
    border: 1px solid var(--border-hair);
    border-radius: 12px;
    padding: 32px 36px 44px;
}
```

**Two-Column Grid:**
```css
.settings-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
}

@media (max-width: 900px) {
    .settings-grid { grid-template-columns: 1fr; }
}
```

**Panel Component:**
```css
.settings-panel {
    background: var(--light-bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
}

.settings-panel__hd {
    background: var(--grey-bg);
    border-bottom: 1px solid var(--border-hair);
    padding: 10px 14px;
}

.panel-title {
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-weight: 700;
    font-size: 0.62rem;
}
```

**Settings Row (Dense):**
```css
.settings-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-hair);
    min-height: 44px;
}

.settings-row:hover {
    background: var(--row-hover);
}

.row-actions {
    opacity: 0;  /* Show on hover */
}

.settings-row:hover .row-actions {
    opacity: 1;
}
```

### Sections

| Panel | Column | Contents |
|-------|--------|----------|
| INTEGRATIONS | Left | Google Calendar, Todoist rows with status dot + Connect button |
| GOOGLE CALENDARS | Left | Calendar rows with color dot + toggle switch (if connected) |
| LIFE DOMAINS | Right | Domain rows with icon + hover edit/delete, add input at bottom |
| TASK DISPLAY | Right | Completed/scheduled task visibility and sorting preferences (v0.7) |
| SECURITY | Right | E2E encryption setup/disable (v0.8) |
| BUILD PROVENANCE | Right | Version info, commit hash, Verify Build modal (v0.8) |
| BACKUP | Right | Export/import data as JSON (v0.7) |
| MAINTENANCE | Right | Danger zone with wipe button |

### Completed Tasks Panel (v0.7)

Settings panel for controlling completed task visibility. Calendar always shows completed tasks (as historical data) - these settings primarily control the Task List.

| Setting | Type | Options | Default | Scope |
|---------|------|---------|---------|-------|
| Show in Task List | Toggle | On/Off | On | Task List only |
| Keep visible for | Segmented | 1 day / 3 days / 7 days | 3 days | Both (retention window) |
| Position in Task List | Segmented | Move to bottom / Keep in place | Move to bottom | Task List only |
| Hide recurring after completing today | Toggle | On/Off | Off | Task List only |

**Design rationale:**
- Calendar is historical - you never plan in the past, so completed tasks always show there (within retention window)
- Task List is where you work - hiding completed tasks declutters your view
- "Hide recurring after completing today" is for people who prefer a "remaining work only" view

**Example use case for "Hide recurring":**
You have 5 daily tasks. By noon, 3 are done. With this OFF, you see all 5 (3 completed, 2 pending). With this ON, you see only 2 remaining tasks.

### Security Panel (v0.8+)

Settings panel for E2E encryption and passkey management.

```
┌────────────────────────────────────────────────────────────────┐
│ SECURITY                                                        │
├────────────────────────────────────────────────────────────────┤
│ Encryption                    [Enabled ✓] or [Disabled]         │
│ End-to-end encryption for...                                    │
├────────────────────────────────────────────────────────────────┤
│ Lock Status                   🔓 Unlocked  [Re-authenticate]    │
│ Current encryption session... or 🔒 Locked                      │
├────────────────────────────────────────────────────────────────┤
│ Passkeys                      📋 List passkeys                  │
│ Use biometrics or security... ├─ 1Password  Jan 15 [Remove]     │
│                               ├─ Touch ID   Jan 15 [Remove]     │
│                               └─ [Add Passkey]                  │
├────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ SET UP ENCRYPTION                                          │ │
│ │ [Passphrase input  ] [Confirm     ]  [Enable Encryption]   │ │
│ │ or                                                         │ │
│ │ [Enter passphrase  ]               [Disable Encryption]    │ │
│ └────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

| Setting | Type | Description |
|---------|------|-------------|
| Encryption Status | Badge | Shows "Enabled ✓" (green) or "Disabled" |
| Lock Status | Status + Button | Shows 🔓 Unlocked / 🔒 Locked, Re-authenticate button when locked |
| Passkeys | List + Button | Registered passkeys with Remove action, Add Passkey button |
| Setup/Disable | Input + Button | Passphrase input for enabling/disabling encryption |

**Lock Status Row:**
- Shows when encryption is enabled
- 🔓 Unlocked (green) — key is in sessionStorage
- 🔒 Locked — need to re-authenticate
- "Re-authenticate" button shows when locked

**Passkeys Section:**
- Shows when encryption is enabled
- Lists all registered passkeys with name and creation date
- "Remove" button on hover for each passkey
- "Add Passkey" button at bottom

---

## Passkey Unlock Architecture (v0.8.4)

### Design Philosophy

**Core Principle: Key Wrapping, Not Key Derivation**

Each passkey wraps the same master key. This allows multiple passkeys (1Password, Touch ID, YubiKey) to unlock the same encrypted data.

```
❌ WRONG: Each passkey derives its own key
   Passkey A → PRF → Key A → encrypts data
   Passkey B → PRF → Key B → can't decrypt Key A's data

✅ CORRECT: Each passkey wraps the same master key
   Master Key (from passphrase) → encrypts all data
   Passkey A → PRF → Wrapping Key A → wraps master key
   Passkey B → PRF → Wrapping Key B → wraps master key
   Both unwrap to the SAME master key
```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PASSKEY KEY WRAPPING ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         USER PREFERENCES                            │   │
│   │  encryption_salt: base64      ← Salt for PBKDF2                     │   │
│   │  encryption_test_value: enc   ← "WHENDOIST..." encrypted with       │   │
│   │                                  MASTER key (verifies correctness)  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         USER PASSKEYS                               │   │
│   │                                                                     │   │
│   │  passkey_1:                    passkey_2:                           │   │
│   │    credential_id: bytes          credential_id: bytes               │   │
│   │    prf_salt: "salt1"             prf_salt: "salt2"                  │   │
│   │    wrapped_key: enc              wrapped_key: enc                   │   │
│   │    ↑ Master key wrapped          ↑ Master key wrapped              │   │
│   │      with PRF-derived key          with PRF-derived key            │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌─────────────────────┐          ┌─────────────────────┐                  │
│   │  PASSPHRASE FLOW    │          │  PASSKEY FLOW       │                  │
│   ├─────────────────────┤          ├─────────────────────┤                  │
│   │ 1. User enters pass │          │ 1. WebAuthn prompt  │                  │
│   │ 2. PBKDF2(pass,salt)│          │ 2. PRF extension    │                  │
│   │ 3. → Master key     │          │ 3. → Wrapping key   │                  │
│   │ 4. Decrypt test val │          │ 4. Unwrap master key│                  │
│   │ 5. Store in session │          │ 5. Decrypt test val │                  │
│   │                     │          │ 6. Store in session │                  │
│   └─────────────────────┘          └─────────────────────┘                  │
│            │                                  │                              │
│            └──────────────┬───────────────────┘                              │
│                           ▼                                                  │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    SAME MASTER KEY                                  │   │
│   │              Used for all encrypt/decrypt operations                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Unlock Modal (Updated v0.8.4)

The unlock modal now supports both passkey and passphrase authentication:

```
┌────────────────────────────────────────────────────────────────┐
│                          🔐                                     │
│                  Unlock Encrypted Data                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                 [Unlock with Passkey]                    │  │
│  │                     (if passkeys exist)                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│                         ─── or ───                              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  [Enter passphrase                                     ] │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│              [Unlock with Passphrase]                           │
│                                                                 │
│           ─────────────────────────────                         │
│               ⚠️ Error message here                             │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Flow:**
1. If user has passkeys, show "Unlock with Passkey" button prominently
2. Passphrase input always available as fallback
3. Error shown inline if authentication fails

### Passkey Registration Flow

```
User clicks "Add Passkey" (must be unlocked first!)
         │
         ▼
┌────────────────────────────┐
│ 1. Check Crypto.hasStored  │
│    Key() - must be true    │
│    (need master key!)      │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 2. Get registration options│
│    POST /api/passkeys/     │
│         register/options   │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 3. navigator.credentials   │
│    .create() with PRF ext  │
│    User authenticates      │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 4. PRF output → wrapping   │
│    key (AES-256-GCM)       │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 5. Get master key from     │
│    sessionStorage          │
│    Crypto.getStoredKey()   │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 6. Wrap master key with    │
│    wrapping key            │
│    wrapped = AES(wrap, mk) │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 7. Send to server          │
│    POST /api/passkeys/     │
│         register/verify    │
│    { credential, name,     │
│      prf_salt, wrapped_key}│
└────────────────────────────┘
```

### Passkey Authentication Flow

```
User clicks "Unlock with Passkey"
         │
         ▼
┌────────────────────────────┐
│ 1. Get authentication opts │
│    POST /api/passkeys/     │
│         authenticate/options│
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 2. navigator.credentials   │
│    .get() with PRF ext     │
│    (includes prf_salt)     │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 3. PRF output → wrapping   │
│    key (AES-256-GCM)       │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 4. Server returns          │
│    wrapped_key for the     │
│    passkey that was used   │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 5. Unwrap master key       │
│    mk = AES-decrypt(       │
│         wrap, wrapped_key) │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 6. Verify master key       │
│    Decrypt test value from │
│    UserPreferences         │
│    Must == "WHENDOIST_..." │
└────────────────────────────┘
         │ success
         ▼
┌────────────────────────────┐
│ 7. Store master key        │
│    Crypto.storeKey(mk)     │
│    → sessionStorage        │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 8. Notify server           │
│    POST /api/passkeys/     │
│         authenticate/verify│
│    (updates sign count)    │
└────────────────────────────┘
```

### API Endpoints (Passkeys)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/passkeys/` | GET | List user's passkeys |
| `/api/passkeys/register/options` | POST | Get WebAuthn registration options |
| `/api/passkeys/register/verify` | POST | Verify registration, store credential |
| `/api/passkeys/authenticate/options` | POST | Get WebAuthn authentication options |
| `/api/passkeys/authenticate/verify` | POST | Verify authentication, update sign count |
| `/api/passkeys/{id}` | DELETE | Remove a passkey |

### Files Involved (Passkeys)

| File | Role |
|------|------|
| `static/js/passkey.js` | Client-side WebAuthn + key wrapping |
| `app/services/passkey_service.py` | Credential management |
| `app/routers/passkeys.py` | Passkey API endpoints |
| `app/models.py` | UserPasskey model |
| `app/templates/base.html` | Unlock modal with passkey support |
| `app/templates/settings.html` | Passkey management UI |

### Security Considerations

1. **Registration requires unlock** — Must have master key in session to wrap it
2. **Key verification** — Always decrypt test value to verify correct key
3. **Sign count** — WebAuthn sign count prevents credential cloning
4. **User isolation** — All passkey operations filter by user_id
5. **Passphrase fallback** — Users can always unlock with passphrase

---

## E2E Encryption Architecture (v0.8+)

### Design Philosophy

**Core Principle: Global Toggle, Not Per-Record Flags**

The encryption system uses a **single global toggle** (`encryption_enabled`) per user. When enabled, ALL task titles, descriptions, and domain names are encrypted. This is an all-or-nothing design.

**Why not per-record flags?**
- Simpler mental model: data is either all encrypted or all plaintext
- No "mixed state" confusion where some tasks are encrypted and others aren't
- Prevents orphaned encrypted data (encrypted with a key that no longer exists)
- Easier to audit and reason about security

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        E2E ENCRYPTION DATA FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        USER PREFERENCES                              │   │
│  │  encryption_enabled: boolean  ← Single global toggle                 │   │
│  │  encryption_salt: base64      ← Random 32 bytes for PBKDF2           │   │
│  │  encryption_test_value: enc   ← "WHENDOIST_ENCRYPTION_TEST" encrypted│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     ENCRYPTED FIELDS (3 total)                       │   │
│  │                                                                      │   │
│  │  task.title        task.description        domain.name               │   │
│  │                                                                      │   │
│  │  Format: base64(IV[12] || ciphertext || authTag)                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────┐          ┌─────────────────────┐                  │
│  │    CLIENT SIDE      │          │    SERVER SIDE      │                  │
│  │    (crypto.js)      │◄────────►│    (Python)         │                  │
│  ├─────────────────────┤          ├─────────────────────┤                  │
│  │ • Key derivation    │          │ • Store salt        │                  │
│  │ • Encrypt/decrypt   │          │ • Store test value  │                  │
│  │ • Key in session    │          │ • Toggle flag       │                  │
│  │   Storage           │          │ • Batch update API  │                  │
│  │ • NEVER sends key   │          │ • NEVER sees key    │                  │
│  └─────────────────────┘          └─────────────────────┘                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Cryptographic Details

| Component | Algorithm/Parameters |
|-----------|---------------------|
| **Key Derivation** | PBKDF2 with SHA-256, 100,000 iterations |
| **Encryption** | AES-256-GCM (authenticated encryption) |
| **IV Length** | 12 bytes (96 bits, standard for GCM) |
| **Salt Length** | 32 bytes (256 bits) |
| **Key Storage** | sessionStorage (cleared on tab close) |

### Enable Encryption Flow

```
User clicks "Enable Encryption"
         │
         ▼
┌────────────────────────────┐
│ 1. Prompt for passphrase   │
│    (min 8 characters)      │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 2. Generate random salt    │
│    (32 bytes)              │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 3. Derive key via PBKDF2   │
│    key = PBKDF2(pass,      │
│          salt, 100000)     │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 4. Encrypt test value      │
│    enc = AES-GCM(key,      │
│    "WHENDOIST_...")        │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 5. Fetch all plaintext     │
│    GET /api/tasks/         │
│        all-content         │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 6. Encrypt all data        │
│    client-side             │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 7. Batch update to server  │
│    POST /api/tasks/        │
│         batch-update       │
│    POST /api/domains/      │
│         batch-update       │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 8. Enable flag on server   │
│    POST /api/preferences/  │
│         encryption/setup   │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 9. Store key in            │
│    sessionStorage          │
└────────────────────────────┘
```

### Unlock Flow (On Page Load)

```
Page loads with encryption enabled
         │
         ▼
┌────────────────────────────┐
│ 1. Check window.WHENDOIST  │
│    .encryptionEnabled      │
└────────────────────────────┘
         │ true
         ▼
┌────────────────────────────┐
│ 2. Show unlock modal       │
│    (passphrase prompt)     │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 3. Derive key from         │
│    passphrase + salt       │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 4. Decrypt test value      │
│    Verify == known string  │
└────────────────────────────┘
         │ success
         ▼
┌────────────────────────────┐
│ 5. Store key in            │
│    sessionStorage          │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 6. Decrypt displayed data  │
│    (task titles, domains)  │
└────────────────────────────┘
```

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/preferences/encryption` | GET | Get encryption status and salt |
| `/api/preferences/encryption/setup` | POST | Enable encryption (store salt, test value) |
| `/api/preferences/encryption/disable` | POST | Disable encryption (clear salt, test value) |
| `/api/tasks/all-content` | GET | Fetch all tasks for batch encrypt/decrypt |
| `/api/tasks/batch-update` | POST | Update multiple tasks (for encrypt/decrypt) |
| `/api/domains/batch-update` | POST | Update multiple domains (for encrypt/decrypt) |

### Multitenancy Security

**Critical:** All encryption operations are user-scoped.

```python
# Every query filters by user_id
query = select(Task).where(
    Task.id == task_id,
    Task.user_id == self.user_id  # ← Always present
)

# Batch updates validate ownership
for item in data.tasks:
    task = await service.get_task(item.id)  # Returns None if not owned
    if not task:
        continue  # Skip - not this user's task
    await service.update_task(...)
```

**Security guarantees:**
1. User A cannot read User B's encrypted data
2. User A cannot modify User B's data via batch endpoints
3. Each user has independent encryption state
4. Salt and test value are per-user (not shared)

### Files Involved

| File | Role |
|------|------|
| `static/js/crypto.js` | Client-side encryption/decryption |
| `app/services/preferences_service.py` | Encryption state management |
| `app/routers/preferences.py` | Encryption API endpoints |
| `app/routers/tasks.py` | all-content, batch-update endpoints |
| `app/routers/domains.py` | batch-update endpoint |
| `app/templates/base.html` | Sets `window.WHENDOIST` config |
| `app/templates/dashboard.html` | Decrypt on page load |
| `app/templates/settings.html` | Enable/disable UI |
| `static/js/task-dialog.js` | Encrypt on save |

### Testing

Comprehensive tests in `tests/test_encryption.py`:

| Test Class | Coverage |
|------------|----------|
| `TestEncryptionPreferences` | Enable/disable preferences |
| `TestEncryptionMultitenancy` | **CRITICAL** user isolation |
| `TestCryptoModuleExportsAPI` | crypto.js has required functions |
| `TestCryptoModuleArchitecture` | Correct algorithms used |
| `TestCryptoModuleIntegration` | Templates use Crypto correctly |

### Future Considerations

- **Key rotation**: Allow changing passphrase without re-encrypting all data
- **Recovery key**: Generate backup key during setup for account recovery
- **Hardware key support**: WebAuthn/FIDO2 for key storage

### Build Provenance Panel (v0.8)

Settings panel showing version info and code verification.

| Element | Description |
|---------|-------------|
| Version | Current app version (e.g., v0.8.0) |
| Commit | Git commit hash (short form) |
| Build Date | When the build was created |
| Verify Build | Button that opens verification modal |

**Verify Build modal:**
- Shows SHA256 hashes for all static files
- Instructions to verify against GitHub release
- Links to GitHub release page

### Backup Panel (v0.7)

Settings panel for data backup and restore functionality.

| Action | Button | Description |
|--------|--------|-------------|
| Export Data | Download Backup | Downloads all user data as JSON file with timestamp |
| Import Data | Restore Backup | Uploads JSON file and replaces all existing data |

**What's included in backup:**
- Domains (name, icon, color, external references)
- Tasks (title, description, schedule, due date, duration, impact, clarity, recurrence, completion status)
- Task instances (for recurring tasks)
- User preferences (all task display settings)

**Restore behavior:**
- Confirmation prompt requiring user to type "RESTORE"
- Clears all existing data before import
- Remaps domain IDs to maintain task relationships
- Page reloads after successful restore

---

## Analytics Page (v0.7)

Comprehensive analytics dashboard powered by **ApexCharts**.

### Layout Structure

```
┌──────────────────────────────────────────────────────────────────┐
│ Header                                                            │
├──────────────────────────────────────────────────────────────────┤
│                         Page (flex center)                        │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Page Surface (grey-bg, max-width: 1180px)                  │  │
│  │                                                            │  │
│  │ ANALYTICS              [7D] [30D] [90D]  Jan 01 - Jan 07   │  │
│  │                                                            │  │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │  │
│  │ │ 42       │ │ 15       │ │ 73%      │ │ 5 days   │       │  │
│  │ │ Completed│ │ Pending  │ │ Rate     │ │ Streak   │       │  │
│  │ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │  │
│  │                                                            │  │
│  │ ┌─────────────────────┐  ┌─────────────────────┐           │  │
│  │ │ DAILY COMPLETIONS   │  │ BY DOMAIN           │           │  │
│  │ │ [ApexCharts Bar]    │  │ [ApexCharts Donut]  │           │  │
│  │ └─────────────────────┘  └─────────────────────┘           │  │
│  │                                                            │  │
│  │ ┌─────────────────────┐  ┌─────────────────────┐           │  │
│  │ │ BEST DAYS           │  │ ACTIVE HOURS        │           │  │
│  │ │ [Day of Week Bar]   │  │ [Hour Area Chart]   │           │  │
│  │ └─────────────────────┘  └─────────────────────┘           │  │
│  │                                                            │  │
│  │ ┌────────────────────────────────────────────────────────┐ │  │
│  │ │ CONTRIBUTION HEATMAP (GitHub-style, 12 weeks)          │ │  │
│  │ └────────────────────────────────────────────────────────┘ │  │
│  │                                                            │  │
│  │ ┌─────────────────────┐  ┌─────────────────────┐           │  │
│  │ │ BY IMPACT           │  │ VELOCITY TREND      │           │  │
│  │ │ [P1-P4 Bar Chart]   │  │ [Bar + Rolling Avg] │           │  │
│  │ └─────────────────────┘  └─────────────────────┘           │  │
│  │                                                            │  │
│  │ ┌─────────────────────┐  ┌─────────────────────┐           │  │
│  │ │ TASK AGING          │  │ RECURRING TASKS     │           │  │
│  │ │ [Age Donut Chart]   │  │ [Progress Bars]     │           │  │
│  │ └─────────────────────┘  └─────────────────────┘           │  │
│  │                                                            │  │
│  │ ┌────────────────────────────────────────────────────────┐ │  │
│  │ │ RECENT COMPLETIONS (list with click to edit)           │ │  │
│  │ └────────────────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### ApexCharts Integration

**CDN:**
```html
<script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>
```

**Chart Configuration Pattern:**
```javascript
const options = {
    chart: {
        type: 'bar',  // or 'donut', 'area', 'heatmap'
        height: 200,
        toolbar: { show: false },
        fontFamily: 'inherit',
        foreColor: 'rgba(15, 23, 42, 0.64)'  // --text-muted
    },
    colors: ['#6D5EF6'],  // --primary
    grid: {
        borderColor: 'rgba(15, 23, 42, 0.055)'  // --border-hair
    }
};
```

### Chart Types Used

| Chart | Type | Data Source |
|-------|------|-------------|
| Daily Completions | Bar | `daily_completions` (date → count) |
| By Domain | Donut | `by_domain` (domain_id → count) |
| Best Days | Bar (horizontal) | `by_day_of_week` (Mon-Sun) |
| Active Hours | Area | `by_hour` (0-23) |
| Contribution Heatmap | Heatmap | `heatmap` (12 weeks × 7 days) |
| By Impact | Bar (colored) | `by_impact` (P1-P4) |
| Velocity Trend | Mixed (bar + line) | `velocity` (daily + 7-day rolling avg) |
| Task Aging | Donut | `aging` (1d/3d/7d/older) |

### Key Components

**Date Range Selector:**
```css
.range-btn {
    padding: 6px 14px;
    font-size: 0.625rem;
    text-transform: uppercase;
    border-radius: 6px;
    border: 1px solid var(--border);
}

.range-btn.active {
    background: var(--primary);
    color: #fff;
}
```

**Stats Row (4-column):**
```css
.stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
}

.stat-card {
    text-align: center;
    padding: 20px 16px;
    background: var(--light-bg);
    border: 1px solid var(--border);
    border-radius: 12px;
}

.stat-value {
    font-size: 2.5rem;
    font-weight: 700;
}

.stat-value.success { color: #16a34a; }
.stat-value.warning { color: #B8860B; }
.stat-value.primary { color: var(--primary); }
```

**Chart Panel:**
```css
.chart-panel {
    background: var(--light-bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
}

.chart-title {
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--text-muted);
    margin-bottom: 16px;
}
```

**Heatmap (Full Width):**
```css
.heatmap-panel {
    grid-column: 1 / -1;  /* Spans full width */
}
```

**Recurring Task Progress:**
```css
.recurring-progress {
    height: 6px;
    border-radius: 3px;
    background: var(--grey-bg);
}

.recurring-progress-fill {
    height: 100%;
    background: var(--primary);
    border-radius: 3px;
}
```

### Backend Service

`AnalyticsService` provides comprehensive statistics:

```python
async def get_comprehensive_stats(start_date, end_date) -> dict:
    # Returns:
    {
        "total_completed": int,
        "total_pending": int,
        "completion_rate": float,
        "daily_completions": [...],      # For bar chart
        "by_domain": [...],              # For donut
        "by_day_of_week": [...],         # Mon-Sun distribution
        "by_hour": [...],                # 24-hour distribution
        "by_impact": {...},              # P1-P4 breakdown
        "current_streak": int,
        "longest_streak": int,
        "heatmap": [...],                # 12 weeks of data
        "this_week": int,
        "last_week": int,
        "velocity": [...],               # 30-day trend
        "recurring_stats": [...],        # Per-task completion rates
        "aging": {...}                   # Task age distribution
    }
```

---

## Task Completion States (v0.7)

### Visual Aging

Completed tasks use a simplified 2-level aging system:

| Age | CSS Class | Style |
|-----|-----------|-------|
| Today | `.completed-today` | Grey text with strikethrough, slightly dimmed |
| Older | `.completed-older` | Muted grey (70% opacity) with strikethrough |

### CSS Implementation

**Task List Items:**
```css
.task-item.completed-today .task-text {
    text-decoration: line-through;
    color: var(--text-muted);
}

.task-item.completed-older .task-text {
    color: rgba(15, 23, 42, 0.7);  /* 70% opacity - readable but clearly done */
    text-decoration: line-through;
}
.task-item.completed-older::before {
    opacity: 0.6;  /* Dim the impact rail */
}
```

**Calendar Items:**
```css
.calendar-item.completed-today { opacity: 0.85; }
.calendar-item.completed-older .scheduled-task-text {
    color: rgba(15, 23, 42, 0.7);
    text-decoration: line-through;
}
```

### Recurring Task Completion

When a recurring task's today instance is completed:
1. Parent task remains visible (status stays "pending")
2. Visual aging applied based on instance's `completed_at`
3. Shows "done today" state in left panel
4. Optional: hide from list after completion (user preference)

### Retention Window

Completed tasks are filtered by retention window preference:
- **1 day**: Only today's completions
- **3 days**: Today, yesterday, day before (default)
- **7 days**: Full week of completions

Tasks outside retention window are excluded from display.

---

## Responsive Breakpoints

```css
@media (max-width: 900px), (orientation: portrait) {
    /* Tablet: stacked layout */
}

@media (max-width: 580px) {
    /* Phone: compact, abbreviated labels */
}
```

### Key Mobile Changes

| Element | Desktop | Mobile |
|---------|---------|--------|
| Header height | 68px | 40px |
| Hour slot height | 60px | 40px |
| Grid columns | 68/56/80px | 44/40/56px |
| Column labels | Full | Abbreviated (DUR, IMP, CLR) |
| Touch targets | — | Min 44px |
| Thought actions | Hover reveal | Always visible |

---

## Shadows & Elevation

**Rule:** Shadows only for floating elements that overlay content.

```css
/* Overlays (modals, popovers, toasts) */
--shadow-overlay: 0 10px 30px rgba(15, 23, 42, 0.10);

/* Never use shadows for: */
/* - Cards, panels, rows */
/* - Buttons, inputs */
/* - Hover states */
```

---

## Transitions

```css
/* Standard */
transition: all 0.15s ease;

/* Larger movements */
transition: all 0.2s ease;

/* Fast feedback */
transition: all 0.1s ease;
```

---

## Icons

| Icon | Usage | Type |
|------|-------|------|
| 🧟 | Zombie mode | Emoji |
| ☕ | Normal mode | Emoji |
| 🧠 | Focus mode | Emoji |
| ✨ | Plan My Day | Emoji |
| ↻ | Recurring | Unicode |
| 🗑️ | Trash bin | Emoji |

SVG icons: 12-18px, `stroke-width: 2-2.5`, `stroke="currentColor"`

---

## File Structure

```
static/css/
├── app.css        # Design tokens, header, nav, toast
├── dashboard.css  # Tasks page: task list, calendar, drag-drop
└── dialog.css     # Task edit modal

static/js/
├── drag-drop.js       # Drag scheduling, trash bin
├── plan-tasks.js      # Time range selection
├── task-dialog.js     # Create/edit modal
├── task-sort.js       # Column sorting
├── energy-selector.js # Mode toggle
├── recurrence-picker.js
├── crypto.js          # E2E encryption (AES-256-GCM)
├── passkey.js         # WebAuthn + key wrapping (v0.8.4)
└── toast.js

app/templates/
├── base.html       # Header, nav, layout
├── dashboard.html  # Tasks page
├── thoughts.html   # Thought Cabinet page (inline CSS)
├── analytics.html  # Analytics page (inline CSS)
├── settings.html   # Settings page (inline CSS)
└── login.html
```

---

## Design Checklist for New Elements

When designing new UI:

- [ ] Uses correct background layer (dark/grey/light)?
- [ ] Text uses proper hierarchy (text/muted/faint)?
- [ ] Borders use correct tier (hair/normal/strong)?
- [ ] Hover uses tint, not shadow?
- [ ] ALL CAPS with letter-spacing for headers?
- [ ] Dense rows with border-bottom (not cards)?
- [ ] Actions hidden until hover?
- [ ] Matches existing component patterns?
- [ ] Works on mobile (900px, 580px breakpoints)?

---

*Last updated: January 2026 (v0.8.4 - Passkey Unlock Architecture)*
