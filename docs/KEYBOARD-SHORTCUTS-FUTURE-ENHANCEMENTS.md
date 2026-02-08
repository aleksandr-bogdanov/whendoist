# Keyboard Shortcuts: Future Enhancements

> Ideas for v2+ of the keyboard shortcuts system. These are NOT planned for immediate implementation -- they should be revisited when the shortcuts system has more coverage and user adoption data.

## Table of Contents

1. [Command Palette](#command-palette)
2. [Additional Shortcuts](#additional-shortcuts)
3. [Customizable Keybindings](#customizable-keybindings)
4. [Chord Shortcuts](#chord-shortcuts)
5. [Shortcut Usage Analytics](#shortcut-usage-analytics)
6. [Context Menus with Shortcut Hints](#context-menus-with-shortcut-hints)
7. [Shortcut Gamification](#shortcut-gamification)

---

## Command Palette

**Priority**: High (implement when 15+ actions exist)
**Effort**: 8-12 hours
**Precedent**: Linear, Todoist, VS Code, Slack, Notion, Superhuman

### What It Is

A searchable action launcher triggered by `Cmd+K` (Mac) or `Ctrl+K` (Windows). Users type to fuzzy-search actions, and keyboard shortcuts are displayed alongside each result.

### Why Wait

Whendoist currently has 4 keyboard shortcuts. A command palette with 4 items feels empty. The palette becomes valuable when it can surface 15+ actions across categories:

- Task actions: create, edit, delete, complete, duplicate, move
- Navigation: go to tasks, calendar, analytics, settings
- View controls: toggle sidebar, switch energy level, change sort
- Quick filters: show completed, show deleted, today's tasks
- System: toggle dark mode, open help, logout

### Implementation Approach

```
┌─────────────────────────────────────┐
│  🔍 Type a command...              │
├─────────────────────────────────────┤
│  ▸ Quick add task               Q  │
│    New task (editor)            N  │
│    Toggle dark mode                │
│    Go to Analytics                 │
│    Keyboard shortcuts           ?  │
└─────────────────────────────────────┘
```

**Key decisions**:
- **Trigger**: `Cmd+K` / `Ctrl+K` (industry standard)
- **Fuzzy search**: Simple substring matching is sufficient initially; upgrade to scored fuzzy matching later
- **Architecture**: Register actions in shortcuts.js (extend the existing registry)
- **UI**: Modal overlay, similar to the existing help modal but with a search input
- **Keyboard nav**: Arrow keys + Enter to select, Escape to close

**Code sketch** (action registry extension):

```javascript
// Extend shortcuts.js with an actions registry
const actions = [
    { id: 'quick-add', label: 'Quick add task', shortcut: 'Q', handler: () => TaskDialog.open() },
    { id: 'new-task', label: 'New task (editor)', shortcut: 'N', handler: () => TaskSheet.open() },
    { id: 'dark-mode', label: 'Toggle dark mode', handler: () => toggleTheme() },
    { id: 'go-analytics', label: 'Go to Analytics', handler: () => window.location.href = '/analytics' },
    { id: 'shortcuts', label: 'Keyboard shortcuts', shortcut: '?', handler: () => openShortcutHelp() },
];
```

### Discoverability of the Palette Itself

The command palette has the same chicken-and-egg problem as `?`. Solutions:
- Add `Cmd+K` to the footer hint bar: `"Press ? for shortcuts · Cmd+K for commands"`
- Show `Cmd+K` in the help modal under a "Pro tip" section

---

## Additional Shortcuts

**Priority**: High (Phase 2, after discoverability is solved)
**Effort**: 4-6 hours

### Task Navigation

| Key | Action | Category |
|-----|--------|----------|
| `j` | Next task | Navigation |
| `k` | Previous task | Navigation |
| `Enter` | Open selected task | Navigation |
| `g t` | Go to Tasks | Navigation |
| `g a` | Go to Analytics | Navigation |
| `g s` | Go to Settings | Navigation |

### Task Actions

| Key | Action | Category |
|-----|--------|----------|
| `c` | Complete task | Actions |
| `d` | Delete task | Actions |
| `e` | Edit task | Actions |
| `p` | Plan task (schedule) | Actions |
| `#` | Set priority | Actions |

### View Controls

| Key | Action | Category |
|-----|--------|----------|
| `1` | Zombie energy | Views |
| `2` | Normal energy | Views |
| `3` | Focus energy | Views |
| `/` | Focus search | Views |

### Implementation Notes

- Task navigation (`j`/`k`) requires a "selected task" concept (visual highlight on the current task row)
- Go-to shortcuts (`g t`, `g a`) require chord support (see [Chord Shortcuts](#chord-shortcuts))
- Energy shortcuts (`1`/`2`/`3`) map directly to existing energy pills
- All shortcuts should use `excludeInputs: true` to avoid firing when typing in text fields

---

## Customizable Keybindings

**Priority**: Low (nice-to-have for power users)
**Effort**: 12-16 hours
**Precedent**: VS Code, Discord (desktop app)

### What It Is

Allow users to remap keyboard shortcuts to their preference. Store custom bindings in the user's preferences (server-side, synced across devices).

### Design

Settings > Appearance > Keyboard Shortcuts section would have:
- A "Customize" button that opens a keybindings editor
- Each shortcut shown in a row with the current key binding
- Click the key to record a new binding
- "Reset to defaults" button

### Storage

```python
# In user preferences (JSON field)
{
    "custom_keybindings": {
        "quick-add": "a",
        "new-task": "ctrl+n",
        "complete": "x"
    }
}
```

### Why Wait

- Very few users customize keybindings (VS Code data suggests < 5%)
- High implementation effort for low usage
- Risk of conflicting bindings (user sets `q` to something else, breaks quick-add)
- Better to establish good defaults first and only customize when there's demand

---

## Chord Shortcuts

**Priority**: Medium (implement alongside go-to navigation)
**Effort**: 4-6 hours
**Precedent**: Gmail (`g i` for inbox), Linear (`g d` for dashboard)

### What It Is

Two-key sequences where the first key is a "leader" key. Example: `g` followed by `t` = "Go to Tasks".

### Implementation Approach

```javascript
// In shortcuts.js, add chord state management
let chordLeader = null;
let chordTimeout = null;

function handleKeyDown(event) {
    // ... existing input field check ...

    // Check for chord sequence
    if (chordLeader) {
        const chord = chordLeader + ' ' + event.key;
        clearTimeout(chordTimeout);
        chordLeader = null;

        // Find matching chord shortcut
        for (const shortcut of contextShortcuts) {
            if (shortcut.chord === chord) {
                event.preventDefault();
                shortcut.handler(event);
                return;
            }
        }
        return; // No match, consume the key
    }

    // Check if this key starts a chord
    for (const shortcut of contextShortcuts) {
        if (shortcut.chord && shortcut.chord.startsWith(event.key + ' ')) {
            chordLeader = event.key;
            chordTimeout = setTimeout(() => { chordLeader = null; }, 1500);
            event.preventDefault();
            // Optional: show a "g..." indicator
            return;
        }
    }

    // ... existing single-key handling ...
}
```

### Visual Feedback

When a chord leader key is pressed, show a brief indicator:

```
┌──────────────────┐
│  g → ...         │  ← appears bottom-center for 1.5s
└──────────────────┘
```

This tells the user the system is waiting for the second key.

---

## Shortcut Usage Analytics

**Priority**: Low (useful for product decisions)
**Effort**: 2-3 hours
**Precedent**: Figma (highlights used shortcuts)

### What It Is

Track which keyboard shortcuts users actually use. This data informs:
- Which shortcuts to promote in discoverability hints
- Whether the discoverability improvements are working
- Which new shortcuts to add (based on frequent mouse actions)

### Implementation

```javascript
// In shortcuts.js handler, after executing a shortcut:
function trackShortcutUsage(shortcutKey) {
    // Fire-and-forget analytics event
    if (window.WHENDOIST?.analyticsEnabled) {
        fetch('/api/v1/analytics/event', {
            method: 'POST',
            headers: window.getCSRFHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                event: 'shortcut_used',
                key: shortcutKey,
                context: currentContext,
                timestamp: Date.now()
            })
        }).catch(() => {}); // Fire-and-forget
    }
}
```

### Privacy Consideration

Only track the shortcut key used, not any content. This is a behavioral metric, not a content metric.

---

## Context Menus with Shortcut Hints

**Priority**: Medium (high impact on discoverability)
**Effort**: 6-8 hours
**Precedent**: Linear, VS Code

### What It Is

Custom right-click context menus on task items that show available actions with their keyboard shortcuts:

```
┌─────────────────────────┐
│  ✏ Edit            E    │
│  ✓ Complete         C    │
│  📅 Schedule        P    │
│  ─────────────────────  │
│  🗑 Delete          D    │
└─────────────────────────┘
```

### Why It's Effective

Context menus are the #1 most effective shortcut teaching mechanism according to UX research. Users see shortcuts every time they right-click, creating repeated exposure that leads to memorization.

### Implementation Notes

- Requires `contextmenu` event listener on task items
- Must call `event.preventDefault()` to suppress the browser context menu
- Needs keyboard navigation within the menu (arrow keys + Enter)
- Should be positioned relative to click location
- Escape closes the menu
- Clicking outside closes the menu
- Careful not to break browser dev tools access (check for Ctrl+Shift+I first)

### Accessibility

- Menu should have `role="menu"` with `role="menuitem"` children
- `aria-haspopup="true"` on the triggering element
- Focus should move into the menu when opened
- Escape returns focus to the triggering element

---

## Shortcut Gamification

**Priority**: Very Low (experimental)
**Effort**: 4-6 hours
**Precedent**: Figma (highlights used shortcuts in the shortcuts panel)

### What It Is

In the keyboard shortcuts help modal, show a visual indicator of which shortcuts the user has used:

```
┌─────────────────────────────────────┐
│  Keyboard Shortcuts      3/8 used   │
├─────────────────────────────────────┤
│  TASKS                              │
│  ✓ Quick add task              Q    │  ← used (highlighted)
│  ✓ New task (editor)           N    │  ← used (highlighted)
│    Complete task               C    │  ← not yet used (dimmed)
│    Delete task                 D    │  ← not yet used (dimmed)
│                                     │
│  HELP                               │
│  ✓ Show shortcuts              ?    │  ← used (highlighted)
│                                     │
│  NAVIGATION                         │
│    Close dialog              Esc    │  ← not yet used (dimmed)
└─────────────────────────────────────┘
```

### Implementation

```javascript
// Track used shortcuts in localStorage
function markShortcutUsed(key) {
    const used = JSON.parse(localStorage.getItem('shortcuts-used') || '[]');
    if (!used.includes(key)) {
        used.push(key);
        localStorage.setItem('shortcuts-used', JSON.stringify(used));
    }
}

// In renderShortcutRow(), check if the shortcut has been used
function renderShortcutRow(shortcut) {
    const used = JSON.parse(localStorage.getItem('shortcuts-used') || '[]');
    const isUsed = used.includes(shortcut.key);
    const className = isUsed ? 'shortcut-row shortcut-row--used' : 'shortcut-row';
    // ...
}
```

### Why Wait

This is a nice-to-have that becomes meaningful only when there are 10+ shortcuts. With 4 shortcuts, it's trivial to use all of them and the gamification doesn't add value.

---

## Summary: Enhancement Roadmap

| Phase | Enhancement | Trigger | Effort |
|-------|-------------|---------|--------|
| **Now** | Discoverability (footer + tooltips + toast) | v0.41.x | 3-4h |
| **Phase 2** | Additional shortcuts (j/k, c/d/e, 1/2/3) | After discoverability ships | 4-6h |
| **Phase 3** | Chord shortcuts (g+t, g+a, g+s) | With Phase 2 | 4-6h |
| **Phase 4** | Command palette (Cmd+K) | When 15+ actions exist | 8-12h |
| **Phase 5** | Context menus with shortcut hints | After command palette | 6-8h |
| **Later** | Customizable keybindings | User demand | 12-16h |
| **Later** | Shortcut gamification | User demand | 4-6h |
| **Later** | Usage analytics | When analytics pipeline exists | 2-3h |
