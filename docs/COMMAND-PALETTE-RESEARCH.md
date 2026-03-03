# Command Palette Competitive Analysis & Enhancement Proposals

Deep-dive across 13 best-in-class apps to identify what Whendoist's command palette is missing — and what only Whendoist could build.

---

## Table of Contents

1. [App-by-App Findings](#1-app-by-app-findings)
2. [Thematic Gap Analysis](#2-thematic-gap-analysis)
3. [Top 20 Enhancement Proposals (Ranked)](#3-top-20-enhancement-proposals)
4. ["Only Whendoist Could Do This" Ideas](#4-only-whendoist-could-do-this)
5. [Where Whendoist Already Leads](#5-where-whendoist-already-leads)

---

## 1. App-by-App Findings

### Linear (linear.app) — The Gold Standard

**What they do that Whendoist doesn't:**

| Feature | Details |
|---------|---------|
| **Scope prefixes** | Type `i ` for issues, `p ` for projects, `u ` for users, `t ` for teams, `l ` for labels, `f ` for favorites, `d ` for documents — 7 single-letter prefixes that narrow results to a specific entity type. Whendoist has only `>` for command mode. |
| **Separate search shortcut** | `/` opens workspace-wide full-text search (distinct from Cmd+K command menu). Three entry points total: Cmd+K (commands), `/` (search), `O then I` (recent issues). |
| **AI semantic search** | Hybrid vector embeddings + keyword matching. Searching "dentist" finds "Schedule teeth cleaning." Pulls context from customer requests, comments, linked support tickets. |
| **AI natural language filters** | Type "show me urgent bugs from last week" → filter builder auto-constructs the query. |
| **Composable two-key chords** | Vim-style navigation: `G then I` (go to Inbox), `G then V` (go to current cycle), `O then F` (open Favorites), `O then P` (open Projects). First key selects namespace, second key selects target. |
| **Saved views** | Any filtered view can be saved (Option+V), favorited for sidebar pinning, and shared across workspace. |
| **Contextual palette positioning** | Same Cmd+K palette repositions near the invoking element (e.g., clicking an assignee field opens a scoped, searchable palette near that field rather than centered on screen). |
| **Sort/filter in search results** | Results sortable by relevance, last updated, or creation date. Max 500 results. Relevance-sorted: in-progress first, then backlog, then completed/archived. |
| **Searchable shortcuts overlay** | `?` opens a flat, searchable list of ALL keyboard shortcuts with labels on left, key combos on right. |
| **Safe-area triangles** | Submenus use CSS clip-path polygons to allow diagonal mouse movement without menu closing — an "invisible detail" that makes the UX feel polished. |

**Mobile:** Chose NOT to adapt command palette to mobile. Built dedicated native iOS/Android navigation instead.

---

### Height (height.app) — Dual-Shortcut Pioneer

*(Shut down Sept 2025, but patterns remain valuable)*

| Feature | Details |
|---------|---------|
| **Cmd+P (search) / Cmd+K (commands) separation** | Distinct shortcuts for "find" vs. "do" — reduces cognitive overload of a single unified palette. |
| **Custom shortcut assignment** | Any command can be assigned a custom keyboard shortcut. Users build their own keyboard-driven workflow. ~100 commands remappable. |
| **Smart lists (saved searches)** | Build complex filter queries → save as a "smart list" with one click → appears in sidebar. Spans multiple lists pulling tasks from anywhere. |
| **Fullscreen search (Cmd+Shift+P)** | Search results display as a full table with customizable visible columns that auto-save for future sessions. |
| **Task preview modals** | Cmd+Return opens a task preview panel on the right side. Nested preview modals for mentioned tasks to maintain context. |
| **Boolean filter expressions** | `(status = open or status = in progress) and assignee = me` with parenthetical grouping. |
| **AI auto-fill attributes** | AI analyzes task content and automatically adds labels, priority, type. AI evaluates bug reports and assigns to the right person. |

---

### Notion (notion.so) — Three Surfaces, One Ecosystem

| Feature | Details |
|---------|---------|
| **Navigation keywords in search** | Typing `home` jumps to Home, `settings` jumps to Settings. Search doubles as navigation without a `>` prefix. |
| **Slash command menu** | `/` in editor body opens block insertion palette: headings, lists, tables, embeds (30+ integrations), math/LaTeX, synced blocks. Categorized with icons and descriptions. |
| **Search result sorting** | 5 options: Best Matches, Last Edited Newest/Oldest, Created Newest/Oldest. |
| **Search scope filters** | Filter by: Title Only, Created By, Teamspace, Page scope (incl. subpages), Date range (Today, Last 7 days, Last 30 days, custom). |
| **"Most viewed" / "Popular this week" labels** | Social/usage signals on search results. |
| **Hover preview** | Hovering over search results shows a tooltip preview of page content. |
| **Recent searches persistence** | Up to 5 recent searches shown in empty state (separate from recent pages). |
| **AI Enterprise Search** | Cross-app search (Slack, Google Drive, Jira, GitHub). AI-synthesized answers with cited sources. Model selector: GPT, Claude, or Gemini. |
| **Block transformation** | Any content block can be morphed into any other type via `Cmd+/` or `/turn` commands. |

---

### Obsidian (obsidian.md) — Plugin-Extensible Registry

| Feature | Details |
|---------|---------|
| **Plugin-extensible command registry** | Every installed plugin auto-registers commands into the palette. 50 plugins = 50+ new commands. The palette grows organically with the ecosystem. |
| **Pinned commands** | Configurable commands that always appear at the top of the palette regardless of search query. |
| **Trigger character modes** | Quick Switcher++ (popular plugin) adds `#` for headings, `@` for symbols, `>` for commands, `'` for bookmarks, `+` for workspaces, `~` for related items — each mode changes what's searched. |
| **Embedded search queries** | Insert `` ```query `` blocks in notes to create live, auto-updating search results. Saved search as content. |
| **Task-aware search operators** | `task-todo:` finds incomplete tasks, `task-done:` finds completed tasks across entire vault. |
| **Regex search** | Full regex support in vault-wide search: `/[a-z]{3}/`. |
| **Search operator composition** | `file:`, `path:`, `tag:`, `content:`, `section:()`, `block:()`, `line:()` — compose with AND/OR/NOT/parentheses. |
| **Query explanation** | Click `(?)` icon on complex queries to see plain-language explanation of what the query does. |
| **Persistent search sidebar** | Vault-wide search opens as a sidebar panel, not a modal — stays open while you work. |

**Mobile:** Swipe-down gesture opens command palette. Same command set as desktop. Pinned commands especially valuable on mobile.

---

### Todoist (todoist.com) — NLP and Voice Powerhouse

| Feature | Details |
|---------|---------|
| **Comprehensive NLP date parsing** | `50 days before new year's eve`, `every 3rd Tuesday starting Aug 29 ending in 6 months`, `mid January`, `end of month`, `in the morning` (→ 9am). Offset calculations, descriptive dates, complex recurring patterns — dramatically beyond Whendoist's date parsing. |
| **Deadline syntax** | `{march 30}` in curly braces for deadlines (distinct from scheduled dates). |
| **Reminder syntax** | `!14:00` or `!30 min before` inline. |
| **Tabbed search results** | Results categorized into: Tasks, Descriptions, Projects, Sections, Comments, Labels, Filters — each in its own tab. |
| **Filter query language** | Full boolean: `&` (AND), `|` (OR), `!` (NOT), `()` grouping. Operators: `date:`, `due:`, `deadline:`, `created:`, `overdue`, `recurring`, `search:`, `assigned to:`. Wildcards: `@urgent*`. Complex: `(p1 | p2) & 14 days`. |
| **Filter Assist (AI)** | Describe what you want in English → AI generates correct filter query syntax + suggests a title. Preview, retry, edit. |
| **Ramble (AI voice-to-tasks)** | Speak naturally → AI (Gemini 2.5 Flash Live) extracts tasks in real-time → preview panel shows tasks forming as you speak. Voice editing: "Actually, make that Thursday." 40+ languages, 10 free sessions/month. |
| **Customizable Quick Add toolbar** | Show/hide individual action buttons, drag-and-drop reorder, toggle labels vs. icons. Settings sync across devices. |
| **Two-key mnemonic shortcuts** | `G then T` (go to Today), `G then I` (go to Inbox), `O then S` (open Settings) — borrowed from Vim/Gmail. |
| **Smart recognition revert** | Auto-highlighted recognized tokens in input can be clicked to revert back to plain text if recognition was wrong. |

**Mobile:** iOS widgets (home screen, lock screen, Control Center, Action Button), Android widgets (customizable list, Quick Settings tile). Ramble widget on home screen.

---

### TickTick (ticktick.com) — Views and Pomodoro

| Feature | Details |
|---------|---------|
| **No command palette** | TickTick has NO unified Cmd+K equivalent. Search is basic keyword-only with no operators. This is a notable gap. |
| **Clipboard intelligence** | Auto-detects time info in clipboard content → prompts to create tasks. Batch-creates from multiple copied lines. |
| **Slash-command formatting** | `/` in task descriptions opens formatting menu (headings, bold, italic, code blocks, lists). |
| **Suggested Tasks** | Auto-recommendations: recently added, frequently postponed, long-overdue, upcoming deadlines. |
| **Eisenhower Matrix** | Four-quadrant urgent/important view with customizable rules per quadrant. Drag tasks between quadrants auto-updates priority. |
| **Duration estimation** | Set estimated duration per task → Pomodoro tracks actual time → shows estimated vs. actual comparison. |
| **Calendar multi-select** | Drag a box across timeline in day/week view to select multiple tasks. |
| **Draggable mobile + button** | Long-press and drag the + button to insert tasks at precise positions in lists, or drop on a task to create a subtask. |

---

### Raycast (raycast.com) — Extension Ecosystem & Launcher UX

| Feature | Details |
|---------|---------|
| **Extension marketplace** | 1,500+ open-source extensions. Every extension registers commands in the root search. The palette is the universal interface to an ecosystem. |
| **Quicklinks** | Parameterized URL shortcuts: define `https://google.com/search?q={query}` as "Google Search" → type the quicklink name → enter query → opens in browser. Any URL, file path, or app. |
| **Clipboard manager** | Full clipboard history with content-type filtering (text, images, links, files, colors). Searches text within images (OCR). |
| **Snippets with placeholders** | Text expansion with dynamic placeholders: `{clipboard}`, `{date}`, cursor position markers. Type a keyword → expands inline. |
| **Floating Notes** | Lightweight markdown notes accessible from anywhere. Auto-sizing window. Each note can have a dedicated keyboard shortcut via quicklink. |
| **Confetti** | A whimsical `confetti` command that fills the screen with confetti. Used to celebrate completed scripts or milestones. Available via `raycast://confetti` URL scheme. |
| **Standard layout for all dialogs** | Every extension, filter, and action menu uses the same keyboard-navigable layout. Users learn the pattern once. |

---

### Superhuman (superhuman.com) — Speed as Product

| Feature | Details |
|---------|---------|
| **Single Cmd+K for everything** | Every action in the app is accessible from Cmd+K: search, snooze, reply, create calendar event, apply label, forward, archive — all without leaving the keyboard. |
| **Inline shortcut teaching** | As you type in the palette, the matching shortcut appears on the right side of each result. "Learn by doing" — users discover shortcuts organically through repeated palette use. |
| **Visual design for power** | Monospaced font in the palette to evoke "directing a powerful machine." Visually imposing, centered, prominent. Every command has its own icon for visual differentiation. |
| **Toggle dismiss** | Same shortcut (Cmd+K) both opens and closes the palette, restoring focus to original position. |
| **Design principle: command = shortcut** | Engineers define both a keyboard shortcut and a command entry simultaneously. Product designers think of every new feature as UI + shortcut + command palette entry. |

---

### Slack (slack.com) — Frecency and Context Switching

| Feature | Details |
|---------|---------|
| **Frecency-based ranking** | Quick Switcher (Cmd+K) prioritizes results by a blend of frequency + recency of access ("frecency"). Items you use daily float to top without explicit pinning. |
| **Search modifiers** | `from:@Sara`, `in:#team-marketing`, `before:2024-01-01`, `has:link`, `has:file`. Boolean: AND, OR, NOT. Wildcards: `run*`. |
| **Quick switcher focus** | Channels, DMs, and recent conversations — not search results. The switcher is a "teleporter" for context switching, not a universal search. |
| **Workflow shortcuts** | `/` slash commands execute workflows inline: `/remind`, `/poll`, `/giphy`. Registered by installed apps. |

---

### VS Code — The Prefix System Pioneer

| Feature | Details |
|---------|---------|
| **Multi-prefix system** | `>` for commands, `@` for symbols, `:` for goto line, `#` for workspace symbols, no prefix for files. Each prefix transforms the palette into a different tool. Whendoist currently uses only `>`. |
| **Command history** | Palette remembers recent commands. Up/down arrow keys cycle through history. |
| **Most-used prioritization** | Frequently used commands bubble to the top automatically without explicit pinning. |
| **Extension command registration** | Every installed extension auto-registers commands. The palette scales with the ecosystem. |
| **Draggable palette** | Users can reposition the palette by dragging the top edge. Preconfigured positions available in layout settings. |

---

### Arc Browser — Tab Actions Pattern

| Feature | Details |
|---------|---------|
| **Tab action mode** | Press Tab immediately after Cmd+T to enter action mode (analogous to Whendoist's `>` prefix but triggered by Tab rather than a character). |
| **6 action categories** | Navigation, Organization, Tools, Split View, Other, Settings — each with descriptive text. |
| **Shift+Enter for top result** | Skip navigation and instantly execute the first/top result. |
| **Space management** | Create, switch, and organize "Spaces" (workspaces) from the command bar. |

---

### Things 3 (culturedcode.com/things) — Autofill from Context

| Feature | Details |
|---------|---------|
| **Quick Entry with Autofill** | `Ctrl+Option+Space` from any app → captures the link to the current website, email, or file and adds it to the new task's notes automatically. The app detects what you're looking at and pulls it into the task. |
| **System-wide global shortcut** | `Ctrl+Space` works from any app, even when Things is not focused. |
| **Full shortcut support in Quick Entry** | All keyboard shortcuts for tags, dates, moving to lists work inside the floating Quick Entry window. |

---

### Amie (amie.so) — Calendar-First Command Bar

| Feature | Details |
|---------|---------|
| **Calendar + task unified quick add** | Single input creates either events or tasks with natural language. "Meeting with John tomorrow 2pm" creates a calendar event; "Buy groceries" creates a task. |
| **Keyboard-first navigation** | Switch between inbox, split view, and calendar views with keyboard shortcuts. Quick action menu via shortcut for creating events/tasks from any view. |
| **Drag-and-drop scheduling** | Tasks can be dragged onto the calendar to allocate time blocks. |

---

## 2. Thematic Gap Analysis

### A. Search & Filtering

| Gap | Who Does It | Whendoist Status |
|-----|------------|-----------------|
| Scope prefixes (`t ` tasks, `d ` domains, `c ` commands) | Linear (7 prefixes), VS Code (`>`, `@`, `:`, `#`) | Only `>` for commands |
| Saved searches / smart views | Linear (Custom Views), Height (Smart Lists), Todoist (Filters), Obsidian (embedded queries) | None |
| Search operators (`from:`, `before:`, `has:`) | Slack, Todoist, Obsidian | None — only `@` and `#` tokens |
| Sort search results (by date, relevance, etc.) | Notion (5 options), Linear (3 options) | Fixed relevance only |
| Tabbed result categories | Todoist (Tasks/Descriptions/Projects/Comments/Labels) | Grouped sections but no tabs |
| Frecency-based ranking | Slack, VS Code | Basic recents (last 8 by interaction) |
| Regex / advanced pattern search | Obsidian | None |
| Full-text description + comment search | Linear, Todoist, Notion | Description snippets shown, but no comment search |
| Date range filter in search | Notion (Today, Last 7/30 days, custom) | `@today`/`@week` but no custom range |

### B. Inline Actions (Things You Can DO from the Palette)

| Gap | Who Does It | Whendoist Status |
|-----|------------|-----------------|
| Inline scheduling (type date, press Enter) | Todoist, Amie | Have drilldown → schedule, but not inline date entry |
| Quick priority change from palette | Todoist (`1-4` keys), Linear (Cmd+K on selected) | Have drilldown → but priority isn't an action |
| Inline task editing (edit title without leaving palette) | Height (Enter to edit name) | Must navigate to task to edit |
| Preview pane / peek (see task details without opening) | Height (Cmd+Return), Notion (hover preview) | Description snippet only |
| Undo last action from palette | Todoist (`Z`), VS Code | Undo via toast only |

### C. Creation & Input

| Gap | Who Does It | Whendoist Status |
|-----|------------|-----------------|
| Comprehensive NLP date parsing | Todoist (offset calc, descriptive, complex recurring) | Basic: `tomorrow`, `monday`, specific dates |
| Voice-to-tasks | Todoist (Ramble), TickTick (long-press +) | None |
| Autofill from current context | Things 3 (captures current URL/email/file) | None |
| Template-based creation | TickTick, Notion (template buttons) | None |
| Clipboard intelligence | TickTick (detect time info, batch-create from clipboard) | None |
| Customizable creation toolbar | Todoist (drag-reorder action buttons, toggle labels/icons) | Fixed metadata pills |

### D. Navigation & Context Switching

| Gap | Who Does It | Whendoist Status |
|-----|------------|-----------------|
| Navigation keywords (type "settings" or "dashboard") | Notion | Only via `>` command mode, not in search mode |
| Two-key chord navigation | Linear (`G then I`), Todoist (`G then T`) | None |
| Frecency-prioritized recent items | Slack, VS Code | Ring buffer of last 8 (no frequency weighting) |
| Quick switcher between views | Slack (Cmd+K for channels), Arc (spaces) | Commands exist but no view-specific switcher |

### E. AI / Smart Features

| Gap | Who Does It | Whendoist Status |
|-----|------------|-----------------|
| Semantic search (intent-based, not keyword-based) | Linear (vector embeddings) | Fuzzy string matching only |
| AI filter generation from natural language | Todoist (Filter Assist), Linear | None |
| AI voice-to-tasks with real-time extraction | Todoist (Ramble) | None |
| AI auto-fill attributes | Height (auto-labels, auto-priority, auto-assign) | None |
| Cross-app search | Notion Enterprise (Slack, Drive, Jira, GitHub) | Google Calendar only |

### F. Customization & Extensibility

| Gap | Who Does It | Whendoist Status |
|-----|------------|-----------------|
| Custom shortcut assignment (remap any command) | Height (~100 remappable), Obsidian (any command) | Fixed shortcuts only |
| Pinned / favorite commands | Obsidian (configurable pinned commands) | None — commands listed by category |
| Extension / plugin command registration | Raycast (1,500+), Obsidian, VS Code | Fixed command set |
| Quicklinks (parameterized URL shortcuts) | Raycast | None |

### G. Visual Design & Micro-interactions

| Gap | Who Does It | Whendoist Status |
|-----|------------|-----------------|
| Monospaced font for "power" feel | Superhuman | Standard font |
| Icons per command | Superhuman, Notion, Raycast | Category icons but not per-command |
| Confetti / celebration on milestones | Raycast | None |
| Safe-area triangles in submenus | Linear | Standard submenu behavior |
| Preview tooltip on hover | Notion | None |

### H. Mobile / Touch Adaptations

| Gap | Who Does It | Whendoist Status |
|-----|------------|-----------------|
| Swipe gesture to open palette | Obsidian (swipe down) | Unknown |
| Voice input from palette | Todoist (Ramble widget), TickTick (long-press +) | None |
| Draggable + button for precise insertion | TickTick | Standard creation |
| Home screen / lock screen widgets | Todoist, TickTick | PWA — limited widget support |

---

## 3. Top 20 Enhancement Proposals

Ranked by **(user impact × feasibility)**, most impactful-and-buildable first.

### Rank 1: Scope Prefixes for Faster Filtering

**One-liner:** Type `t ` for tasks only, `d ` for domains, `c ` for commands, `f ` for filters — single-character prefixes that instantly narrow the palette to one entity type.

**Inspired by:** Linear (7 prefixes), VS Code (`>`, `@`, `:`, `#`)

**Why it matters for Whendoist:** Currently, `>` is the only prefix. Users searching for a domain must scan through mixed task/command results. Adding `d ` instantly shows only domains, `t ` shows only tasks, `f ` shows only smart filters. This turns the palette from a "search everything" box into a scoped, modal tool — dramatically faster for power users who know what they want.

**Implementation:** Map first-character + space to a mode enum. Each mode filters `PaletteItem` types. Show mode indicator pill below input ("Searching tasks…"). Pressing Backspace on empty input returns to universal mode.

**Complexity:** S | **Impact:** High

---

### Rank 2: Saved Searches (Smart Views)

**One-liner:** Save any combination of smart filters (`@overdue #Work !high`) as a named "smart view" accessible from the sidebar and palette.

**Inspired by:** Linear (Custom Views), Height (Smart Lists), Todoist (Filters), Obsidian (embedded queries)

**Why it matters for Whendoist:** Four of the best apps in this analysis offer saved searches. Whendoist's smart filters are powerful but ephemeral — you re-type `@overdue #Work` every time. Saving them as named views makes the palette a tool for building persistent workflows, not just one-off searches.

**Implementation:** New `SmartView` model (name, filter_tokens JSON, user_id). Palette shows saved views in a "Views" section in empty state. Clicking applies those filters. Sidebar entry for pinned views.

**Complexity:** M | **Impact:** High

---

### Rank 3: Two-Key Chord Navigation

**One-liner:** `G then D` goes to Dashboard, `G then T` goes to Thoughts, `G then A` goes to Analytics, `G then S` goes to Settings — Vim-style namespace + target navigation that bypasses the palette entirely.

**Inspired by:** Linear (`G then I`, `G then V`), Todoist (`G then T`, `G then I`)

**Why it matters for Whendoist:** The palette is currently the only way to navigate between views (besides clicking sidebar). Two-key chords give power users instant teleportation without opening any UI. This is the signature interaction pattern of "serious" productivity tools (Linear, Gmail, Todoist all use it).

**Implementation:** Global keyboard listener in `useHotkeys()`. First keypress (`G`) starts a 500ms chord timer + shows a transient chord indicator ("G → ?"). Second keypress resolves navigation. Cancel on timeout or Escape.

**Complexity:** S | **Impact:** High

---

### Rank 4: Frecency-Ranked Recent Items

**One-liner:** Replace the ring-buffer "last 8 tasks" with a frecency algorithm that surfaces tasks you access frequently AND recently, not just the last ones you touched.

**Inspired by:** Slack (frecency in Quick Switcher), VS Code (most-used command prioritization)

**Why it matters for Whendoist:** The current recents ring buffer (8 items, newest-first) penalizes tasks you check daily but haven't opened in the last 5 minutes. Frecency would surface your "daily drivers" — the 3-5 tasks you're actively managing — at the top of the empty state every time. This makes the palette a personalized dashboard.

**Implementation:** Store `{ taskId, accessCount, lastAccessed }` in Zustand (persisted to localStorage). Score = `accessCount * recencyDecay(lastAccessed)`. Sort descending. Cap at 8-12 items.

**Complexity:** S | **Impact:** Medium

---

### Rank 5: Inline Task Preview Pane

**One-liner:** Press `Space` or `Cmd+Return` on a highlighted task to show a preview panel (description, domain, dates, subtasks) alongside the result list — without leaving the palette.

**Inspired by:** Height (Cmd+Return preview), Notion (hover preview), macOS Finder (Quick Look with Space)

**Why it matters for Whendoist:** Currently, users must leave the palette to see task details (or rely on the description snippet, which is truncated). A preview pane lets users triage tasks from the palette — scanning descriptions, checking subtasks, verifying dates — without losing their search context. This is especially valuable when multiple tasks have similar titles.

**Implementation:** Split palette into two columns when preview is active: result list (60%) + preview panel (40%). Preview fetches full task data (description, subtasks, domain, dates, priority, clarity). Animate width transition. Keyboard: Space toggles preview, ↑↓ updates it live.

**Complexity:** M | **Impact:** Medium

---

### Rank 6: Pinned Commands

**One-liner:** Let users pin 3-5 favorite commands to the top of command mode (`>`), always visible regardless of search query.

**Inspired by:** Obsidian (configurable pinned commands)

**Why it matters for Whendoist:** Users develop personal workflows — someone might use "Plan My Day," "New Thought," and "Sync Google Calendar" ten times a day. Pinning these to the top of `>` mode eliminates even the need to type. On mobile especially (where typing is slower), pinned commands become one-tap actions.

**Implementation:** Store `pinnedCommandIds: string[]` in user preferences (Zustand, persisted). Show pinned commands in a "Pinned" section above categories in command mode. Add "Pin/Unpin" action to each command's context.

**Complexity:** S | **Impact:** Medium

---

### Rank 7: Search Result Sorting

**One-liner:** Add a sort toggle in search results: Relevance (default), Recently Updated, Oldest First, Priority — changing how task results are ordered.

**Inspired by:** Notion (5 sort options), Linear (relevance/updated/created)

**Why it matters for Whendoist:** Fuzzy relevance is great for finding a specific task, but sometimes you want to see "which of my overdue tasks is oldest?" or "which high-priority tasks did I create most recently?" Sorting turns the palette from a search tool into an analytical lens.

**Implementation:** Sort dropdown or cycle button near the input. Apply `Array.sort()` on filtered results using the selected comparator. Persist last-used sort in session storage.

**Complexity:** S | **Impact:** Medium

---

### Rank 8: Navigation Keywords in Search Mode

**One-liner:** Typing "dashboard", "thoughts", "analytics", or "settings" in normal search mode (without `>` prefix) shows a navigation result — blurring the line between search and commands.

**Inspired by:** Notion (typing `home` or `settings` navigates to those sections)

**Why it matters for Whendoist:** Currently, navigation requires switching to command mode (`> dashboard`). But many users don't know about `>`. Making navigation keywords work in default search mode means new users discover navigation organically. It also reduces keystrokes for everyone: type "dash" → see "Go to Dashboard" alongside task results → Enter.

**Implementation:** Add navigation items to the search index with high-weight keywords. Mix them into results alongside tasks when query matches. Show with a distinct "Navigation" icon to differentiate from task results.

**Complexity:** S | **Impact:** Medium

---

### Rank 9: Smart Filter Composition with Operators

**One-liner:** Support `@overdue AND #Work`, `!high OR !critical`, and `NOT @completed` — boolean operators that let users build complex filter expressions in the palette.

**Inspired by:** Todoist (full boolean filter language), Obsidian (AND/OR/NOT with parentheses), Height (boolean expressions)

**Why it matters for Whendoist:** Current smart filters combine implicitly (presumably AND). Adding explicit AND/OR/NOT and parentheses enables queries like "show me all overdue tasks that are NOT in the Work domain" — impossible today. This is the stepping stone to saved searches (Rank 2).

**Implementation:** Extend `parseFilterTokens()` to recognize `AND`, `OR`, `NOT` keywords between tokens. Build a filter predicate tree instead of a flat list. Evaluate with short-circuit logic.

**Complexity:** M | **Impact:** Medium

---

### Rank 10: Priority and Energy as Drilldown Actions

**One-liner:** Add "Set priority" and "Set energy/clarity" to the task action drilldown (Tab →), with a picker submenu for each — same pattern as the existing "Move to domain" picker.

**Inspired by:** Todoist (`1-4` keys for priority), Linear (Cmd+K on selected → change priority/status)

**Why it matters for Whendoist:** The drilldown currently offers Complete, Schedule, Move, Edit, Delete — but not priority or clarity changes. These are the two most distinctive Whendoist attributes (energy-based planning, clarity levels) yet they require navigating to the task to change. Adding them to the drilldown makes the palette a complete triage tool.

**Implementation:** Add two new action items to `palette-task-actions.tsx`. Each opens a submenu (like domain picker) showing priority levels (p1-p4) or clarity levels (zombie/normal/brainstorm) with icons and colors. Keyboard shortcut: `P` for priority, `Y` for clarity (matching the existing shortcut pattern).

**Complexity:** S | **Impact:** High

---

### Rank 11: Searchable Keyboard Shortcuts Overlay

**One-liner:** Pressing `?` from anywhere (not just the palette) opens a full-screen, searchable overlay listing ALL keyboard shortcuts organized by category — with a search input to find any shortcut by name.

**Inspired by:** Linear (`?` → searchable flat list), Notion (`?` → shortcuts reference), Todoist (`?` → shortcuts overlay)

**Why it matters for Whendoist:** The current "Keyboard shortcuts" command exists in the palette, but three of the four best-in-class apps provide a dedicated `?` overlay for discoverability. This is the #1 pattern for helping users graduate from mouse to keyboard. The overlay itself teaches: users open it when stuck, find what they need, and learn the shortcut for next time.

**Implementation:** New `<ShortcutsOverlay>` component. Collect all registered shortcuts from commands, navigation chords, and global hotkeys. Group by category. Add search input that filters the list. Trigger on `?` keypress (when not in a text input). Escape to close.

**Complexity:** S | **Impact:** Medium

---

### Rank 12: Token Recognition Revert (Click-to-Undo Parsing)

**One-liner:** When the smart input parser highlights a recognized token (e.g., "tomorrow" turns into a date pill), clicking the pill reverts it back to plain text — in case the recognition was wrong.

**Inspired by:** Todoist (click highlighted token to revert), TickTick (click to revert parsed date)

**Why it matters for Whendoist:** The smart input parser is aggressive — it recognizes `#Work`, `!high`, `tomorrow`, `30m` etc. But sometimes "30m" is part of a task title, not a duration. Currently, there's no way to tell the parser "I didn't mean that." Click-to-revert solves false positives gracefully.

**Implementation:** Each `MetadataPill` gets an `onClick` handler that calls a new `revertToken(tokenType)` function on `useSmartInput()`. This removes the token from parsed state and re-inserts the original text at the cursor position. Visual: pill gets a subtle `×` icon on hover.

**Complexity:** S | **Impact:** Medium

---

### Rank 13: Batch Priority and Clarity Changes

**One-liner:** Extend multi-select batch operations to include "Set priority" and "Set clarity" — not just complete/schedule/move/delete.

**Inspired by:** Linear (bulk attribute changes on selected issues), Todoist (batch priority via multi-select toolbar)

**Why it matters for Whendoist:** The batch action bar currently has 5 actions (Complete, Today, Tomorrow, Move, Delete). Adding priority and clarity means users can select 10 unprocessed tasks and batch-assign them `!high` or `?brainstorm` in one action — essential for weekly review workflows where you triage many tasks at once.

**Implementation:** Add `set_priority` and `set_clarity` to `BatchActionRequest.action` Literal type. Add UI buttons to `palette-batch-actions.tsx`. Each opens a small picker (3-4 options). Backend: single UPDATE query with `WHERE id IN (...)`.

**Complexity:** S | **Impact:** Medium

---

### Rank 14: Recent Searches Persistence

**One-liner:** Show the last 5 search queries (not just recent tasks) in the empty state, so users can re-run previous searches with one click.

**Inspired by:** Notion (recent searches shown in empty state), Todoist (up to 5 recent searches cached)

**Why it matters for Whendoist:** Users often search for the same things: `@overdue #Work`, their boss's name, a project keyword. Current empty state shows recent tasks and stats but not recent queries. Adding recent searches enables "saved search lite" — without building a full saved views system (Rank 2), you get 80% of the benefit.

**Implementation:** Store `recentSearches: string[]` (max 5) in Zustand, persisted to localStorage. Push on Enter or result selection (if query is non-empty). Show in empty state between "Recent" and "Right Now" sections. Click to re-populate input.

**Complexity:** S | **Impact:** Medium

---

### Rank 15: Celebration on Task Completion

**One-liner:** When completing a task from the palette (via drilldown or batch), show a brief confetti burst or checkmark animation — a micro-reward that makes completion feel satisfying.

**Inspired by:** Raycast (confetti command), Todoist (karma points + level-up animations)

**Why it matters for Whendoist:** Completing tasks should feel good. The current UX is: click Complete → task disappears from list → toast notification. A 300ms confetti animation or expanding checkmark adds emotional reward without slowing down the workflow. This is especially impactful for batch completions — finishing 5 tasks at once should feel like a celebration.

**Implementation:** Lightweight confetti library (canvas-confetti, ~3KB). Trigger on complete action in drilldown and batch. Short duration (800ms), low density. Optional: user toggle in settings to disable.

**Complexity:** S | **Impact:** Low (but high delight)

---

### Rank 16: Date Range Filter in Search

**One-liner:** Add date-scoped smart filters: `@this-week`, `@last-7-days`, `@this-month`, or a custom range picker — filtering tasks by when they were created, scheduled, or completed.

**Inspired by:** Notion (Today, Last 7 days, Last 30 days, custom), Todoist (`created before:`, `date after:`)

**Why it matters for Whendoist:** Current smart filters are point-in-time (`@today`, `@tomorrow`) or relative (`@week`, `@overdue`). There's no way to search "tasks I created this month" or "tasks completed last week." Date range filters unlock retrospective analysis from the palette — useful for weekly reviews and analytics.

**Implementation:** Add new filter tokens: `@this-month`, `@last-7d`, `@last-30d`. For custom ranges, show a date picker dropdown when user types `@from:` or `@between:`. Apply as date range predicate on `created_at` or `scheduled_date`.

**Complexity:** M | **Impact:** Medium

---

### Rank 17: Inline Quick Schedule (Type Date in Drilldown)

**One-liner:** In the task action drilldown, add a "Schedule for…" action that opens a mini text input — type "next tuesday" or "march 15" and the NLP parser sets the date without navigating to the task.

**Inspired by:** Todoist (NLP date in quick add), Amie (natural language event creation)

**Why it matters for Whendoist:** The current drilldown offers "Schedule today" and "Schedule tomorrow" — but what about "schedule for next Friday"? Users must navigate to the task, open the date picker, and manually select. An inline date input in the drilldown keeps users in the palette flow for any date, not just today/tomorrow.

**Implementation:** Add a "Schedule for…" action item that expands into a text input. Reuse the existing date parser from smart input. On Enter, call the schedule API with the parsed date. Show the parsed date as confirmation before applying.

**Complexity:** M | **Impact:** Medium

---

### Rank 18: Command Palette History (Arrow Key Recall)

**One-liner:** Press ↑ in an empty palette input to cycle through previous queries — same as terminal/shell history.

**Inspired by:** VS Code (command history with arrow keys), terminal/shell UX

**Why it matters for Whendoist:** Power users repeat searches. Instead of retyping `@overdue #Work !high`, press ↑ to recall the last query. This is a micro-optimization that compounds: 2 seconds saved per search × 20 searches/day = nearly a minute saved daily. Terminal users expect this behavior instinctively.

**Implementation:** Store `queryHistory: string[]` (max 20) in Zustand. Track `historyIndex` in palette state. ↑ on empty input increments index and populates input. ↓ decrements. Typing resets index to -1.

**Complexity:** S | **Impact:** Low

---

### Rank 19: Smart Suggestions (AI-Powered)

**One-liner:** Show AI-generated task suggestions in the empty state: "frequently postponed," "overdue and high priority," "quick wins (< 15min, low clarity)" — smart recommendations based on task data patterns.

**Inspired by:** TickTick (Suggested Tasks: recently added, frequently postponed, long-overdue, upcoming deadlines), Height (AI auto-fill)

**Why it matters for Whendoist:** Whendoist has rich task metadata (priority, clarity, duration, energy, domain, scheduled dates) that enables intelligent suggestions no competitor can match. "You have 3 zombie-energy tasks under 15 minutes — perfect for your current energy state" is a recommendation only Whendoist can make.

**Implementation:** Backend endpoint that queries task patterns: overdue + high priority, frequently rescheduled (postponed 3+ times), quick wins by energy match. Return as a "Suggested" section in the palette empty state. No LLM needed — pure query logic.

**Complexity:** M | **Impact:** Medium

---

### Rank 20: Persistent Search Sidebar Mode

**One-liner:** Add an option to "pop out" the palette into a sidebar panel that stays open while you work — like Obsidian's persistent search sidebar.

**Inspired by:** Obsidian (search as sidebar panel, not modal), Height (fullscreen search with table columns)

**Why it matters for Whendoist:** The modal palette is great for quick searches, but during deep triage sessions (weekly review, processing inbox), users want to keep the filtered view visible while acting on individual tasks. A sidebar mode turns the palette from a transient search into a persistent work surface.

**Implementation:** Add a "Pin to sidebar" button in the palette header. When pinned, the palette renders as a right sidebar panel instead of a centered modal. Results update live as the user navigates. Click a result to open it in the main area while keeping the list visible.

**Complexity:** L | **Impact:** Medium

---

## 4. "Only Whendoist Could Do This"

These ideas combine the palette with Whendoist's unique capabilities in ways no competitor has done.

### Idea 1: Energy-Aware Palette Results

**What:** When the user has an active energy filter (zombie/normal/brainstorm), the palette's empty state reshuffles to show tasks matching that energy level first. Searching shows an "Energy Match" badge on results where the task's clarity level matches the current filter.

**Why only Whendoist:** No other task app has energy-based task classification. The palette would become context-aware — "I'm feeling zombie right now" changes what the palette recommends. Linear, Todoist, Notion all show the same results regardless of user state.

**Example:** User sets energy to "zombie" → palette empty state shows "Quick wins for zombie mode" (short, low-clarity tasks) instead of generic recents. Search results for "@today" sort zombie-friendly tasks to top.

**Complexity:** S | **Impact:** High

---

### Idea 2: Calendar Gap Finder in Palette

**What:** Type `@free` or `@gaps` in the palette to see today's (or this week's) free time slots pulled from Google Calendar. Each gap is a selectable result — pressing Enter on a gap opens task creation pre-filled with that time slot's date and duration.

**Why only Whendoist:** Whendoist is one of the only task apps with deep Google Calendar integration. No competitor's palette can show "you have 2 hours free between 2-4pm" and let you schedule a task into that gap directly. This bridges the calendar-task divide from the keyboard.

**Example:** Type `@free` → results show: "Today 10:00-11:30 (1.5h)", "Today 14:00-16:00 (2h)", "Tomorrow 09:00-10:00 (1h)". Press Enter on the 2h slot → palette switches to task creation with `tomorrow 2pm 2h` pre-filled.

**Complexity:** L | **Impact:** High

---

### Idea 3: "Plan My Day" Palette Mode

**What:** Type `@plan` to enter Plan My Day mode directly from the palette — see today's unscheduled tasks ranked by AI recommendation, drag-reorder them, and commit the plan — all without leaving the palette overlay.

**Why only Whendoist:** Plan My Day is Whendoist's signature feature. Surfacing it in the palette means users can start their day planning workflow from anywhere with Cmd+K → `@plan` → review → commit. No competitor has auto-scheduling integrated into a command palette.

**Example:** Cmd+K → `@plan` → palette shows: "Plan My Day" header with today's calendar blocks, recommended task order based on energy + priority + duration + calendar gaps. Arrow keys to reorder. Enter to commit schedule. The entire morning ritual in one keyboard-driven flow.

**Complexity:** XL | **Impact:** High

---

### Idea 4: Clarity Triage Mode

**What:** Type `@triage` to enter triage mode — the palette shows all unprocessed tasks (no clarity set, no priority, no domain) one by one. For each task: press `Z/N/B` to set clarity (zombie/normal/brainstorm), `1-4` for priority, `D` to assign domain. Each action auto-advances to the next task.

**Why only Whendoist:** The clarity/energy system is unique to Whendoist. No competitor has a concept of "this task requires brainstorm energy" vs. "this is zombie work." A triage mode that rapid-fires through unprocessed tasks using single-key assignments is the fastest possible way to process an inbox.

**Example:** Cmd+K → `@triage` → "Buy groceries" appears → press `Z` (zombie) → `3` (low priority) → auto-advances to "Design new landing page" → press `B` (brainstorm) → `1` (high priority) → `D` then select "Work" → auto-advances. 20 tasks triaged in 60 seconds.

**Complexity:** M | **Impact:** Critical

---

### Idea 5: Domain Context Palette

**What:** When viewing a specific domain (e.g., "Work"), Cmd+K auto-scopes the palette to that domain's tasks, with a "Show all" button to expand. The empty state shows domain-specific stats: tasks by energy level, overdue count, upcoming deadlines in this domain.

**Why only Whendoist:** Domains are Whendoist's organizational primitive (like Todoist's projects but representing life areas). Auto-scoping the palette to the current domain context creates a "workspace within a workspace" — the palette becomes domain-aware. Combined with energy filters, this creates a two-dimensional context: "I'm in Work mode, feeling brainstorm energy" → the palette shows exactly the 5 tasks that match both constraints.

**Complexity:** S | **Impact:** Medium

---

## 5. Where Whendoist Already Leads

These are features where Whendoist is ahead of the competition — areas to protect and strengthen, not reinvent.

| Advantage | Details |
|-----------|---------|
| **Unified palette with creation fallthrough** | Single Cmd+K seamlessly transitions from search → no results → task creation with smart parsing. Todoist has separate Quick Add vs. Quick Find. Linear has 3 separate shortcuts. Whendoist's flow is more fluid. |
| **Smart input parsing in palette** | `#domain`, `!priority`, `?clarity`, `30m` duration, `tomorrow`, `//notes` — more inline metadata types than any competitor. Todoist's `#project @label p1` is close but lacks clarity and duration. |
| **Task action drilldown** | Tab into a task → see all available actions → keyboard-execute. Neither Linear, Todoist, Notion, nor Obsidian offer this. Height came close with Cmd+K on selected tasks. |
| **Multi-select in the palette itself** | Cmd+Click to multi-select tasks directly in search results → batch actions. Competitors do multi-select in list views, not in the search/command palette. |
| **Description snippet highlighting** | Search results show matched description excerpts with highlighting. Linear and Todoist don't show description matches inline with task results. |
| **Empty state with live stats** | "Right Now" section showing today's task count, overdue count, and thoughts count gives users a reason to open the palette even without a search query. No competitor does this. |
| **Mobile command palette** | Neither Linear nor Height adapted their palette to mobile. Whendoist's mobile-adapted palette is a genuine differentiator for PWA users. |

---

## Appendix: Complexity Legend

| Size | Effort | Scope |
|------|--------|-------|
| **S** | 1-2 days | Single component or hook change, no backend, no new models |
| **M** | 3-5 days | Multiple component changes, possibly new API endpoint or model |
| **L** | 1-2 weeks | Significant new feature, new backend service, UI redesign of palette |
| **XL** | 2-4 weeks | Major feature requiring backend AI/scheduling logic, extensive UI work |
