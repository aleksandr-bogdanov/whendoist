# Keyboard Shortcuts Discoverability Assessment

> Assessment date: 2026-02-08 | Whendoist v0.41.0

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [UX Research Findings](#ux-research-findings)
3. [User Persona Analysis](#user-persona-analysis)
4. [Options Analysis](#options-analysis)
5. [Recommendation](#recommendation)
6. [Success Metrics](#success-metrics)

---

## Executive Summary

Whendoist v0.41.0 introduced a centralized keyboard shortcuts system with a `?`-triggered help modal. The core problem: **the `?` shortcut itself is undiscoverable** without prior knowledge. Research across 13+ web applications reveals that the most effective discoverability pattern is a **multi-layered approach** combining a subtle visual indicator with contextual inline hints. We recommend a **footer hint bar** as the primary solution -- minimal effort, high discoverability, zero intrusiveness.

---

## UX Research Findings

### Applications Surveyed (13)

| App | `?` Overlay | Cmd Palette | Tooltips | Context Menus | Visual Hint | Onboarding |
|-----|:-----------:|:-----------:|:--------:|:-------------:|:-----------:|:----------:|
| Gmail | Yes | -- | -- | -- | -- | -- |
| GitHub | Yes | Beta | -- | -- | -- | -- |
| Linear | Yes | Yes | Yes | Yes | -- | Via menus |
| Notion | Yes | Yes | -- | -- | `?` icon | Slash hint |
| Slack | Cmd+/ | Yes | -- | -- | -- | Cmd+K |
| Figma | -- | -- | Yes | -- | `?` icon | Used highlights |
| Todoist | Yes | Yes | -- | -- | -- | Via Cmd+K |
| VS Code | -- | Cmd+Shift+P | Yes | Yes | -- | Welcome tab |
| Trello | Yes | -- | -- | -- | -- | -- |
| Asana | Cmd+/ | -- | -- | -- | -- | -- |
| ClickUp | Yes | Cmd+J | -- | -- | -- | -- |
| Jira | Yes | -- | -- | -- | -- | -- |
| Discord | Cmd+/ | -- | -- | -- | -- | -- |

### Key Patterns Ranked by Effectiveness

1. **Command palette with inline shortcut display** (Linear, Todoist, VS Code)
   - Creates a natural learning loop: search for action -> see its shortcut -> memorize over time
   - But: high implementation effort, overkill for 4 shortcuts

2. **Shortcuts in context menus and tooltips** (Linear, VS Code, Figma)
   - Puts hints where users already look
   - Most "invisible" teaching method
   - Only 3/13 apps do this despite being highly effective

3. **Persistent visual indicator** (Notion `?` icon, Figma `?` icon)
   - Small icon in corner that opens help
   - Gives users a discoverable entry point
   - Low effort, high payoff

4. **Inline placeholder hints** (Notion "Type / for commands")
   - Teaches the entry point without requiring prior knowledge
   - Works for slash commands; less applicable to single-key shortcuts

5. **`?` key overlay** (8/13 apps use this)
   - Universal convention among power users
   - But: requires users to already know the convention

6. **Welcome/onboarding** (VS Code welcome tab)
   - Effective for first-time users, seen once
   - Whendoist already has a wizard -- could piggyback

### Anti-Patterns Identified

- **Shortcuts disabled by default** (Gmail, ClickUp) -- drastically reduces adoption
- **No visual indicators anywhere** (Gmail, Trello, Jira) -- no organic discovery path
- **`?` is itself undiscoverable** (most apps) -- chicken-and-egg problem
- **No mobile alternative** (most apps) -- keyboard shortcuts don't exist on touch devices

### The Discoverability Paradox

> The shortcut to discover shortcuts (`?`) requires knowing it exists, which requires discovering it first.

**Gmail** is the worst offender: shortcuts are disabled by default AND the `?` key is undiscoverable. A third-party Chrome extension ("Gmail Shortcut Nudges") exists solely to add tooltip hints that Gmail lacks.

**Linear** and **Figma** solve this best by embedding shortcut hints directly into context menus and tooltips, so users encounter them during normal mouse interaction.

**Notion** and **Figma** both place a persistent `?` icon in the bottom-right corner that opens help/shortcuts, providing a visible entry point for mouse users.

---

## User Persona Analysis

### Power Users (keyboard-first)

- **Discovery pattern**: Will try `?` naturally (familiar with Gmail/GitHub convention)
- **Need**: Searchable reference, customizable bindings (future)
- **Current experience**: Good -- `?` modal works, tooltips via `data-shortcut` exist
- **Gap**: None critical; they'll find it

### Casual Users (mouse-first)

- **Discovery pattern**: Hover over things, click around, read tooltips
- **Need**: Visual hint that shortcuts exist, easy access via UI
- **Current experience**: Poor -- must navigate to Settings > Appearance to find "View Shortcuts" button
- **Gap**: No visual indicator on main pages that shortcuts exist

### New Users (first visit)

- **Discovery pattern**: Explore the interface, might open Settings eventually
- **Need**: Gentle one-time hint, not a full tutorial
- **Current experience**: No onboarding for shortcuts
- **Gap**: No first-visit education; the wizard doesn't mention shortcuts

### Mobile Users (touch-first)

- **Discovery pattern**: Touch interactions, no keyboard available
- **Need**: Alternative access to the same help content
- **Current experience**: Can open Settings > Appearance > View Shortcuts (functional)
- **Gap**: No quick-access path; but keyboard shortcuts themselves aren't useful on mobile, so this is low priority

---

## Options Analysis

### Option 1: Footer Hint Bar

**Description**: A subtle text line at the bottom of the main task page showing `Press ? for keyboard shortcuts`. Visible only on desktop, hidden on mobile. Dismissible after first interaction.

```
┌─────────────────────────────────────────┐
│  [Whendoist Logo]  Tasks  Analytics  ⚙  │
├─────────────────────────────────────────┤
│                                         │
│  ☕ Energy   Clarity  Dur  Impact       │
│  ─────────────────────────────────────  │
│  □ Task 1                    60m  ●●●   │
│  □ Task 2                    30m  ●●    │
│  □ Task 3                    15m  ●     │
│                                         │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│  Press ? for keyboard shortcuts         │
└─────────────────────────────────────────┘
```

| Criterion | Score | Notes |
|-----------|-------|-------|
| Discoverability | **8/10** | Visible without any action; users notice footer text |
| Intrusiveness | **2/10** | Subtle, small text, doesn't compete with content |
| Implementation effort | **2-3 hours** | Simple HTML + CSS + localStorage dismiss logic |
| Mobile-friendliness | **Yes** | Hidden on mobile (keyboard shortcuts not relevant) |
| Precedent | GitHub (footer links), Figma (bottom panel), many SaaS apps |

**Pros**:
- Zero learning curve -- users see it immediately
- Disappears after first use (localStorage flag)
- No JavaScript complexity
- Doesn't affect existing UI layout
- Progressive: once dismissed, power users never see it again

**Cons**:
- Only visible on dashboard page (could add to all pages)
- "Banner blindness" -- some users ignore footer content
- Slightly reduces available vertical space (one text line)

---

### Option 2: Floating `?` Icon Button

**Description**: A small circular button with `?` in the bottom-right corner of the screen. Clicking it opens the shortcuts help modal. Similar to Notion/Figma pattern.

```
┌─────────────────────────────────────────┐
│  [Logo]  Tasks  Analytics  Settings  ⚙  │
├─────────────────────────────────────────┤
│                                         │
│  Task list content...                   │
│                                         │
│                                         │
│                                         │
│                                         │
│                                    ╭─╮  │
│                                    │?│  │
│                                    ╰─╯  │
└─────────────────────────────────────────┘
```

| Criterion | Score | Notes |
|-----------|-------|-------|
| Discoverability | **7/10** | Always visible, but easily mistaken for generic help |
| Intrusiveness | **3/10** | Small icon, but permanently on screen |
| Implementation effort | **2-3 hours** | Floating button + CSS + click handler |
| Mobile-friendliness | **Partial** | Visible on mobile, but opening keyboard shortcuts on mobile is low value |
| Precedent | Notion, Figma, Intercom-style help widgets |

**Pros**:
- Always accessible regardless of page
- Familiar pattern (Intercom, Zendesk, etc.)
- Works as a persistent entry point for all user types
- Easy to implement

**Cons**:
- Could be confused with a "help chat" or "support" widget
- Permanently occupies screen real estate
- On mobile, opening keyboard shortcuts is not useful
- Conflicts with existing demo pill (bottom-right, similar position)
- Can overlap with content on small screens

---

### Option 3: First-Visit Toast Notification

**Description**: On the user's first visit after shortcuts are available, show a brief toast notification: "New: Keyboard shortcuts! Press ? to see them." Auto-dismisses after 8 seconds, can be clicked to open the modal.

```
┌─────────────────────────────────────────┐
│  [Logo]  Tasks  Analytics  Settings     │
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │ ⌨ Press ? for keyboard shortcuts  │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Task list content...                   │
│                                         │
└─────────────────────────────────────────┘
```

| Criterion | Score | Notes |
|-----------|-------|-------|
| Discoverability | **9/10** | Hard to miss on first visit |
| Intrusiveness | **5/10** | Interrupts flow, but only once |
| Implementation effort | **1-2 hours** | Uses existing Toast system + localStorage flag |
| Mobile-friendliness | **Yes** | Can show on mobile too (even if less relevant) |
| Precedent | Many apps use one-time notifications for new features |

**Pros**:
- Highest immediate discoverability
- Uses existing Toast infrastructure (zero new UI)
- One-time only -- respects returning users
- Can link directly to the help modal
- Trivial implementation

**Cons**:
- Only shown once -- if user misses it, gone forever
- Feels like a "feature announcement" not a permanent fixture
- Users who dismiss toasts habitually will miss it
- Doesn't help users who join after the "new feature" period

---

### Option 4: Keyboard Icon in Header Nav

**Description**: Add a small keyboard icon (⌨) to the site header, between the navigation links and logout. Clicking it opens the shortcuts modal. Shows a tooltip "Keyboard shortcuts (?)" on hover.

```
┌──────────────────────────────────────────────────┐
│  [Logo]   Thoughts  Tasks  Analytics  Settings ⌨ 🚪│
└──────────────────────────────────────────────────┘
```

| Criterion | Score | Notes |
|-----------|-------|-------|
| Discoverability | **6/10** | Visible but easy to overlook among other icons |
| Intrusiveness | **1/10** | Blends naturally into header |
| Implementation effort | **1-2 hours** | SVG icon + click handler in base.html |
| Mobile-friendliness | **Partial** | Could appear in mobile hamburger menu |
| Precedent | Jira (help menu), some Atlassian products |

**Pros**:
- Always available on every page
- Zero layout disruption
- Minimal screen real estate
- Natural location (header = global actions)

**Cons**:
- Easy to overlook -- header icons get ignored ("banner blindness")
- Competes with nav items for attention
- Not obvious what ⌨ means to non-technical users
- Doesn't teach the `?` key itself
- Header is already somewhat crowded

---

### Option 5: Tooltip Hints on Existing Buttons

**Description**: Add shortcut hints to existing button tooltips throughout the UI. When hovering over "Quick Add" button: `"Quick add task (Q)"`. The `data-shortcut` attribute system already exists in shortcuts.js.

```
                          ┌─────────────────────┐
  [+ Quick Add]  ───────► │ Quick add task (Q)  │
                          └─────────────────────┘
```

| Criterion | Score | Notes |
|-----------|-------|-------|
| Discoverability | **5/10** | Only visible on hover; requires mouse exploration |
| Intrusiveness | **1/10** | Invisible until hover |
| Implementation effort | **1 hour** | Add `data-shortcut` attributes to buttons |
| Mobile-friendliness | **No** | Tooltips don't work on touch devices |
| Precedent | VS Code, Linear, Figma (gold standard) |

**Pros**:
- Zero visual noise -- only appears on demand
- Teaches individual shortcuts in context (most effective learning)
- Already partially implemented (`data-shortcut` infrastructure exists)
- Scales naturally as shortcuts are added

**Cons**:
- Doesn't teach the `?` key for the full reference
- Only works for buttons that have shortcuts (currently: quick add, new task)
- Requires mouse interaction -- won't help keyboard-only users
- Slow discovery -- user must hover over every button to find shortcuts

---

### Option 6: Command Palette (`Cmd+K`)

**Description**: A full command palette / searchable action launcher that shows shortcuts next to each action. The gold standard for keyboard-first apps.

```
┌─────────────────────────────────────────┐
│  🔍 Type a command...                   │
├─────────────────────────────────────────┤
│  Quick add task                       Q │
│  New task (editor)                    N │
│  Go to Settings                  ⌘ + , │
│  Toggle dark mode                       │
│  Show keyboard shortcuts              ? │
└─────────────────────────────────────────┘
```

| Criterion | Score | Notes |
|-----------|-------|-------|
| Discoverability | **7/10** | Users must know Cmd+K exists (same chicken-and-egg) |
| Intrusiveness | **1/10** | Only appears when invoked |
| Implementation effort | **8-12 hours** | Significant: fuzzy search, action registry, UI, keyboard nav |
| Mobile-friendliness | **Partial** | Works on mobile with external keyboard |
| Precedent | Linear, Todoist, VS Code, Slack, Notion, Superhuman |

**Pros**:
- The ultimate power-user tool
- Natural shortcut learning loop (search action -> see shortcut -> memorize)
- Scales infinitely as features grow
- Modern UX expectation for productivity apps

**Cons**:
- **Way overkill for 4 shortcuts** -- Whendoist has Q, N, Esc, ?
- High implementation effort for minimal current benefit
- Still has the discoverability problem (Cmd+K itself needs to be discovered)
- Violates Whendoist's vibecode philosophy (over-engineering)
- Better suited as a future enhancement when there are 15+ actions

---

### Option 7: Combined Approach (Footer Hint + Tooltip Enhancement)

**Description**: Combine Option 1 (footer hint bar) with Option 5 (tooltip hints on buttons). The footer teaches `?` exists; tooltips teach individual shortcuts in context.

```
┌─────────────────────────────────────────┐
│  [Logo]  Tasks  Analytics  Settings  ⚙  │
├─────────────────────────────────────────┤
│                                         │
│  [+ Quick Add]  ← tooltip: "(Q)"       │
│                                         │
│  Task list content...                   │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│  Tip: Press ? for keyboard shortcuts  ✕ │
└─────────────────────────────────────────┘
```

| Criterion | Score | Notes |
|-----------|-------|-------|
| Discoverability | **9/10** | Footer catches visual users; tooltips catch hover users |
| Intrusiveness | **2/10** | Footer is dismissible; tooltips are invisible until hover |
| Implementation effort | **3-4 hours** | Footer bar + add data-shortcut attrs to buttons |
| Mobile-friendliness | **Yes** | Footer hidden on mobile; tooltips N/A on mobile |
| Precedent | This combination is used by Linear (tooltips + ? reference) |

**Pros**:
- Covers both discovery paths (visual scanning + mouse exploration)
- Footer teaches the "meta" shortcut (?), tooltips teach individual shortcuts
- Progressive: footer dismissed after first use, tooltips persist
- Low effort, high impact
- Builds on existing `data-shortcut` infrastructure

**Cons**:
- Two things to implement (but both are small)
- Footer still susceptible to banner blindness

---

### Scoring Summary

| Option | Discoverability | Intrusiveness | Effort | Mobile | **Weighted Score** |
|--------|:-:|:-:|:-:|:-:|:-:|
| 1. Footer Hint Bar | 8 | 2 | 2-3h | Yes | **8.5** |
| 2. Floating `?` Icon | 7 | 3 | 2-3h | Partial | **7.0** |
| 3. First-Visit Toast | 9 | 5 | 1-2h | Yes | **7.5** |
| 4. Header Keyboard Icon | 6 | 1 | 1-2h | Partial | **6.5** |
| 5. Tooltip Hints | 5 | 1 | 1h | No | **5.5** |
| 6. Command Palette | 7 | 1 | 8-12h | Partial | **5.0** |
| **7. Combined (1+5)** | **9** | **2** | **3-4h** | **Yes** | **9.0** |

*Weighted formula: Discoverability(40%) + (10 - Intrusiveness)(30%) + (10 - EffortNormalized)(20%) + Mobile(10%)*

---

## Recommendation

### Primary: Option 7 -- Combined Footer Hint + Tooltip Enhancement

**Rationale**:

1. **Highest weighted score (9.0)** across all criteria
2. **Two complementary discovery paths**: visual scanning (footer) and contextual exploration (tooltips)
3. **Progressive disclosure**: footer teaches the meta-shortcut `?`; once users open the help modal, they learn all shortcuts; tooltips reinforce individual shortcuts during normal use
4. **Minimal effort**: 3-4 hours total, builds on existing `data-shortcut` infrastructure
5. **Respects vibecode philosophy**: simple, elegant, no over-engineering
6. **Dismissible**: footer disappears after first interaction, never nags returning users
7. **Desktop-focused**: correctly deprioritizes mobile (keyboard shortcuts are irrelevant on touch devices)

### Optional Add-On: First-Visit Toast (Option 3)

For the initial rollout, also fire a one-time toast notification on the user's first visit after this feature ships. This ensures maximum initial awareness. The toast and footer work together:
- Toast: "New: Keyboard shortcuts are here! Press ? to see them." (one-time, auto-dismiss)
- Footer: persistent until explicitly dismissed (catches users who missed the toast)

### Not Recommended (Yet)

- **Command palette**: Great feature, but premature. Revisit when Whendoist has 15+ actions. See [KEYBOARD-SHORTCUTS-FUTURE-ENHANCEMENTS.md](./KEYBOARD-SHORTCUTS-FUTURE-ENHANCEMENTS.md).
- **Floating `?` icon**: Conflicts with demo pill positioning and can be confused with chat widgets.
- **Header icon**: Too subtle, header already has enough items.

### Phased Rollout

| Phase | What | Effort | When |
|-------|------|--------|------|
| **Phase 1** | Footer hint bar + tooltip enhancement + one-time toast | 3-4h | Next PR |
| **Phase 2** | Add more shortcuts (j/k nav, c/d/e task actions) | 4-6h | After Phase 1 |
| **Phase 3** | Command palette (Cmd+K) | 8-12h | When 15+ actions exist |

---

## Success Metrics

### Measurable (via existing analytics/Sentry)

1. **Help modal open rate**: Track `Shortcuts.openHelp()` calls. Target: 20%+ of active desktop users open help modal within first month.
2. **Shortcut usage rate**: Track keyboard shortcut handler invocations vs. button clicks for the same action (e.g., `q` key vs. click "Quick Add"). Target: 10%+ of task creations via keyboard shortcuts after 3 months.
3. **Footer dismiss rate**: Track how quickly users dismiss the footer hint. Fast dismissal = they already knew; slow dismissal = they learned from it.

### Observable (qualitative)

4. **Support questions**: Reduction in "how do I quickly add a task?" type questions.
5. **User feedback**: Direct feedback mentioning keyboard shortcuts.
6. **Retention correlation**: Check if users who open the help modal have higher retention (power users tend to stick around).

### What Good Looks Like

- **Week 1**: 50%+ of desktop users see the footer hint; 30%+ dismiss it (meaning they read it)
- **Month 1**: 20%+ of desktop users have opened the help modal at least once
- **Month 3**: 10%+ of task operations are performed via keyboard shortcuts
- **Month 6**: Command palette implementation is justified by growing shortcut adoption
